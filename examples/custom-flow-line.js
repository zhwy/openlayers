import WebGLVectorLayerRenderer from "../src/ol/renderer/webgl/VectorLayer.js";
import VectorLayer from "../src/ol/layer/Vector.js";
import TileLayer from "../src/ol/layer/Tile.js";
import Vector from "../src/ol/source/Vector.js";
import Map from "../src/ol/Map.js";
import View from "../src/ol/View.js";
import GeoJSON from "../src/ol/format/GeoJSON.js";
import OSM from "../src/ol/source/OSM.js";
import { COMMON_HEADER, ShaderBuilder } from "../src/ol/webgl/ShaderBuilder.js";
import Feature from "../src/ol/Feature.js";
import { LineString } from "../src/ol/geom.js";
import { LINESTRING_ANGLE_COSINE_CUTOFF } from "../src/ol/render/webgl/utils.js";
import { stringToGlsl, uniformNameForVariable } from "../src/ol/expr/gpu.js";
import VectorStyleRenderer from "../src/ol/render/webgl/VectorStyleRenderer.js";
import { getCustomAttributesSize } from "../src/ol/render/webgl/renderinstructions.js";
import { create as createWebGLWorker } from "../src/ol/worker/custom-flow-line-worker.js";
import WebGLArrayBuffer from "../src/ol/webgl/Buffer.js";
import {
  ARRAY_BUFFER,
  DYNAMIC_DRAW,
  ELEMENT_ARRAY_BUFFER,
} from "../src/ol/webgl.js";
import {
  create as createTransform,
  makeInverse as makeInverseTransform,
} from "../src/ol/transform.js";
import MixedGeometryBatch from "../src/ol/render/webgl/MixedGeometryBatch.js";
import { AttributeType } from "../src/ol/webgl/Helper.js";

const WEBGL_WORKER = createWebGLWorker();

const STRIDE_LENGTH = 3;

class CustomShaderBuilder extends ShaderBuilder {
  constructor() {
    super();

    this.hasStroke_ = true;
    this.strokePathDuration_ = "0.";
    this.strokePathStartTime_ = "0.";
  }

  getStrokeVertexShader() {
    if (!this.hasStroke_) {
      return null;
    }

    return `${COMMON_HEADER}
      ${this.uniforms_
        .map(function (uniform) {
          return "uniform " + uniform + ";";
        })
        .join("\n")}
      attribute vec2 a_position;
      attribute float a_index;
      attribute vec2 a_segmentStart;
      attribute vec2 a_segmentEnd;
      attribute float a_parameters;
      attribute float a_distance;
      attribute vec2 a_joinAngles;
      attribute vec4 a_prop_hitColor;
      attribute float a_time_offset;
      attribute float a_time_offset1;
      ${this.attributes_
        .map(function (attribute) {
          return "attribute " + attribute + ";";
        })
        .join("\n")}      
      varying vec2 v_segmentStart;
      varying vec2 v_segmentEnd;
      varying float v_angleStart;
      varying float v_angleEnd;
      varying float v_width;
      varying vec4 v_prop_hitColor;
      varying float v_distanceOffsetPx;
      varying float v_time_offset;
      varying float v_time;
      ${this.varyings_
        .map(function (varying) {
          return "varying " + varying.type + " " + varying.name + ";";
        })
        .join("\n")}
      ${this.vertexShaderFunctions_.join("\n")}
      vec2 worldToPx(vec2 worldPos) {
        vec4 screenPos = u_projectionMatrix * vec4(worldPos, 0.0, 1.0);
        return (0.5 * screenPos.xy + 0.5) * u_viewportSizePx;
      }

      vec4 pxToScreen(vec2 pxPos) {
        vec2 screenPos = 2.0 * pxPos / u_viewportSizePx - 1.0;
        return vec4(screenPos, u_depth, 1.0);
      }

      bool isCap(float joinAngle) {
        return joinAngle < -0.1;
      }

      vec2 getJoinOffsetDirection(vec2 normalPx, float joinAngle) {
        float halfAngle = joinAngle / 2.0;
        float c = cos(halfAngle);
        float s = sin(halfAngle);
        vec2 angleBisectorNormal = vec2(s * normalPx.x + c * normalPx.y, -c * normalPx.x + s * normalPx.y);
        float length = 1.0 / s;
        return angleBisectorNormal * length;
      }

      vec2 getOffsetPoint(vec2 point, vec2 normal, float joinAngle, float offsetPx) {
        // if on a cap or the join angle is too high, offset the line along the segment normal
        if (cos(joinAngle) > 0.998 || isCap(joinAngle)) {
          return point - normal * offsetPx;
        }
        // offset is applied along the inverted normal (positive offset goes "right" relative to line direction)
        return point - getJoinOffsetDirection(normal, joinAngle) * offsetPx;
      }

      void main(void) {
        v_angleStart = a_joinAngles.x;
        v_angleEnd = a_joinAngles.y;
        float vertexNumber = floor(abs(a_parameters) / 10000. + 0.5);
        // we're reading the fractional part while keeping the sign (so -4.12 gives -0.12, 3.45 gives 0.45)
        float angleTangentSum = fract(abs(a_parameters) / 10000.) * 10000. * sign(a_parameters);

        float lineWidth = ${this.strokeWidthExpression_};
        float lineOffsetPx = ${this.strokeOffsetExpression_};

        // compute segment start/end in px with offset
        vec2 segmentStartPx = worldToPx(a_segmentStart);
        vec2 segmentEndPx = worldToPx(a_segmentEnd);
        vec2 tangentPx = normalize(segmentEndPx - segmentStartPx);
        vec2 normalPx = vec2(-tangentPx.y, tangentPx.x);
        segmentStartPx = getOffsetPoint(segmentStartPx, normalPx, v_angleStart, lineOffsetPx),
        segmentEndPx = getOffsetPoint(segmentEndPx, normalPx, v_angleEnd, lineOffsetPx);
        
        // compute current vertex position
        float normalDir = vertexNumber < 0.5 || (vertexNumber > 1.5 && vertexNumber < 2.5) ? 1.0 : -1.0;
        float tangentDir = vertexNumber < 1.5 ? 1.0 : -1.0;
        float angle = vertexNumber < 1.5 ? v_angleStart : v_angleEnd;
        vec2 joinDirection;
        vec2 positionPx = vertexNumber < 1.5 ? segmentStartPx : segmentEndPx;
        // if angle is too high, do not make a proper join
        if (cos(angle) > ${LINESTRING_ANGLE_COSINE_CUTOFF} || isCap(angle)) {
          joinDirection = normalPx * normalDir - tangentPx * tangentDir;
        } else {
          joinDirection = getJoinOffsetDirection(normalPx * normalDir, angle);
        }
        positionPx = positionPx + joinDirection * (lineWidth * 0.5 + 1.); // adding 1 pixel for antialiasing
        gl_Position = pxToScreen(positionPx);

        v_segmentStart = segmentStartPx;
        v_segmentEnd = segmentEndPx;
        v_width = lineWidth;
        v_prop_hitColor = a_prop_hitColor;
        v_distanceOffsetPx = a_distance / u_resolution - (lineOffsetPx * angleTangentSum);

        v_time_offset = a_time_offset;
        v_time = u_time;
      ${this.varyings_
        .map(function (varying) {
          return "  " + varying.name + " = " + varying.expression + ";";
        })
        .join("\n")}
      }`;
  }

  getStrokeFragmentShader() {
    if (!this.hasStroke_) {
      return null;
    }

    return `${COMMON_HEADER}
      ${this.uniforms_
        .map(function (uniform) {
          return "uniform " + uniform + ";";
        })
        .join("\n")}
      varying vec2 v_segmentStart;
      varying vec2 v_segmentEnd;
      varying float v_angleStart;
      varying float v_angleEnd;
      varying float v_width;
      varying vec4 v_prop_hitColor;
      varying float v_distanceOffsetPx;
      varying float v_time_offset;
      varying float v_time;
      ${this.varyings_
        .map(function (varying) {
          return "varying " + varying.type + " " + varying.name + ";";
        })
        .join("\n")}
      ${this.fragmentShaderFunctions_.join("\n")}

      vec2 pxToWorld(vec2 pxPos) {
        vec2 screenPos = 2.0 * pxPos / u_viewportSizePx - 1.0;
        return (u_screenToWorldMatrix * vec4(screenPos, 0.0, 1.0)).xy;
      }

      bool isCap(float joinAngle) {
        return joinAngle < -0.1;
      }

      float segmentDistanceField(vec2 point, vec2 start, vec2 end, float width) {
        vec2 tangent = normalize(end - start);
        vec2 normal = vec2(-tangent.y, tangent.x);
        vec2 startToPoint = point - start;
        return abs(dot(startToPoint, normal)) - width * 0.5;
      }

      float buttCapDistanceField(vec2 point, vec2 start, vec2 end) {
        vec2 startToPoint = point - start;
        vec2 tangent = normalize(end - start);
        return dot(startToPoint, -tangent);
      }

      float squareCapDistanceField(vec2 point, vec2 start, vec2 end, float width) {
        return buttCapDistanceField(point, start, end) - width * 0.5;
      }

      float roundCapDistanceField(vec2 point, vec2 start, vec2 end, float width) {
        float onSegment = max(0., 1000. * dot(point - start, end - start)); // this is very high when inside the segment
        return length(point - start) - width * 0.5 - onSegment;
      }

      float roundJoinDistanceField(vec2 point, vec2 start, vec2 end, float width) {
        return roundCapDistanceField(point, start, end, width);
      }

      float bevelJoinField(vec2 point, vec2 start, vec2 end, float width, float joinAngle) {
        vec2 startToPoint = point - start;
        vec2 tangent = normalize(end - start);
        float c = cos(joinAngle * 0.5);
        float s = sin(joinAngle * 0.5);
        float direction = -sign(sin(joinAngle));
        vec2 bisector = vec2(c * tangent.x - s * tangent.y, s * tangent.x + c * tangent.y);
        float radius = width * 0.5 * s;
        return dot(startToPoint, bisector * direction) - radius;
      }

      float miterJoinDistanceField(vec2 point, vec2 start, vec2 end, float width, float joinAngle) {
        if (cos(joinAngle) > ${LINESTRING_ANGLE_COSINE_CUTOFF}) { // avoid risking a division by zero
          return bevelJoinField(point, start, end, width, joinAngle);
        }
        float miterLength = 1. / sin(joinAngle * 0.5);
        float miterLimit = ${this.strokeMiterLimitExpression_};
        if (miterLength > miterLimit) {
          return bevelJoinField(point, start, end, width, joinAngle);
        }
        return -1000.;
      }

      float capDistanceField(vec2 point, vec2 start, vec2 end, float width, float capType) {
        if (capType == ${stringToGlsl("butt")}) {
          return buttCapDistanceField(point, start, end);
        } else if (capType == ${stringToGlsl("square")}) {
          return squareCapDistanceField(point, start, end, width);
        }
        return roundCapDistanceField(point, start, end, width);
      }

      float joinDistanceField(vec2 point, vec2 start, vec2 end, float width, float joinAngle, float joinType) {
        if (joinType == ${stringToGlsl("bevel")}) {
          return bevelJoinField(point, start, end, width, joinAngle);
        } else if (joinType == ${stringToGlsl("miter")}) {
          return miterJoinDistanceField(point, start, end, width, joinAngle);
        }
        return roundJoinDistanceField(point, start, end, width);
      }

      float computeSegmentPointDistance(vec2 point, vec2 start, vec2 end, float width, float joinAngle, float capType, float joinType) {
        if (isCap(joinAngle)) {
          return capDistanceField(point, start, end, width, capType);
        }
        return joinDistanceField(point, start, end, width, joinAngle, joinType);
      }

      void main(void) {
        vec2 currentPoint = gl_FragCoord.xy / u_pixelRatio;
        #ifdef GL_FRAGMENT_PRECISION_HIGH
        vec2 worldPos = pxToWorld(currentPoint);
        if (
          abs(u_renderExtent[0] - u_renderExtent[2]) > 0.0 && (
            worldPos[0] < u_renderExtent[0] ||
            worldPos[1] < u_renderExtent[1] ||
            worldPos[0] > u_renderExtent[2] ||
            worldPos[1] > u_renderExtent[3]
          )
        ) {
          discard;
        }
        #endif
        if (${this.discardExpression_}) { discard; }

        float segmentLength = length(v_segmentEnd - v_segmentStart);
        vec2 segmentTangent = (v_segmentEnd - v_segmentStart) / segmentLength;
        vec2 segmentNormal = vec2(-segmentTangent.y, segmentTangent.x);
        vec2 startToPoint = currentPoint - v_segmentStart;
        float currentLengthPx = max(0., min(dot(segmentTangent, startToPoint), segmentLength)) + v_distanceOffsetPx; 
        float currentRadiusPx = abs(dot(segmentNormal, startToPoint));
        float currentRadiusRatio = dot(segmentNormal, startToPoint) * 2. / v_width;
        vec4 color = ${this.strokeColorExpression_} * u_globalAlpha;
        float capType = ${this.strokeCapExpression_};
        float joinType = ${this.strokeJoinExpression_};
        float segmentStartDistance = computeSegmentPointDistance(currentPoint, v_segmentStart, v_segmentEnd, v_width, v_angleStart, capType, joinType);
        float segmentEndDistance = computeSegmentPointDistance(currentPoint, v_segmentEnd, v_segmentStart, v_width, v_angleEnd, capType, joinType);
        float distance = max(
          segmentDistanceField(currentPoint, v_segmentStart, v_segmentEnd, v_width),
          max(segmentStartDistance, segmentEndDistance)
        );
        distance = max(distance, ${this.strokeDistanceFieldExpression_});
        gl_FragColor = color * smoothstep(0.5, -0.5, distance);

        if (${this.strokePathDuration_} == 0.){
          gl_FragColor.a = 1.;
        } else {
          gl_FragColor.a = ( 
            (v_time_offset <  mod((u_time - ${this.strokePathStartTime_}) * 1000., ${this.strokePathDuration_})) && 
            (v_time_offset >  mod((u_time - ${this.strokePathStartTime_} - 0.5) * 1000., ${this.strokePathDuration_}))
          ) ? 1. : 0.;
        }

  
        
        if (u_hitDetection > 0) {
          if (gl_FragColor.a < 0.1) { discard; };
          gl_FragColor = v_prop_hitColor;
        }
      }`;
  }

  setStrokePathStartTime(expression) {
    this.strokePathStartTime_ = expression;
    return this;
  }

  setStrokPathDuration(expression) {
    this.strokePathDuration_ = expression;
    return this;
  }
}

function pushCustomAttributesInRenderInstructions(
  renderInstructions,
  customAttributes,
  batchEntry,
  currentIndex
) {
  let shift = 0;
  for (const key in customAttributes) {
    const attr = customAttributes[key];
    const value = attr.callback.call(batchEntry, batchEntry.feature);
    renderInstructions[currentIndex + shift++] = value[0] ?? value;
    if (!attr.size || attr.size === 1) {
      continue;
    }
    renderInstructions[currentIndex + shift++] = value[1];
    if (attr.size < 3) {
      continue;
    }
    renderInstructions[currentIndex + shift++] = value[2];
    if (attr.size < 4) {
      continue;
    }
    renderInstructions[currentIndex + shift++] = value[3];
  }
  return shift;
}

/**
 * @param {Array<number>} flatCoordinates Flat coordinates.
 * @param {number} offset Offset.
 * @param {number} end End.
 * @param {number} stride Stride.
 * @param {import("../../transform.js").Transform} transform Transform.
 * @param {Array<number>} [dest] Destination.
 * @return {Array<number>} Transformed coordinates.
 */
function transform2D(flatCoordinates, offset, end, stride, transform, dest) {
  dest = dest ? dest : [];
  let i = 0;
  for (let j = offset; j < end; j += stride) {
    const x = flatCoordinates[j];
    const y = flatCoordinates[j + 1];
    dest[i++] = transform[0] * x + transform[2] * y + transform[4];
    dest[i++] = transform[1] * x + transform[3] * y + transform[5];
    // 除xy之外的顶点参数
    for (let k = 2; k < stride; k += 1) {
      dest[i++] = flatCoordinates[j + k];
    }
  }
  if (dest && dest.length != i) {
    dest.length = i;
  }
  return dest;
}

function generateLineStringRenderInstructions(
  batch,
  renderInstructions,
  customAttributes,
  transform
) {
  const strideLength = STRIDE_LENGTH;

  // here we anticipate the amount of render instructions for lines:
  // 3 instructions per vertex for position (x, y, currentTimeoffest, nextTimeoffest)
  // + 1 instruction per line per custom attributes
  // + 1 instruction per line (for vertices count)
  const totalInstructionsCount =
    strideLength * batch.verticesCount +
    (1 + getCustomAttributesSize(customAttributes)) * batch.geometriesCount;
  if (
    !renderInstructions ||
    renderInstructions.length !== totalInstructionsCount
  ) {
    renderInstructions = new Float32Array(totalInstructionsCount);
  }

  // loop on features to fill the render instructions
  const flatCoords = [];
  let renderIndex = 0;
  for (const featureUid in batch.entries) {
    const batchEntry = batch.entries[featureUid];
    for (let i = 0, ii = batchEntry.flatCoordss.length; i < ii; i++) {
      flatCoords.length = batchEntry.flatCoordss[i].length;
      transform2D(
        batchEntry.flatCoordss[i],
        0,
        flatCoords.length,
        strideLength,
        transform,
        flatCoords
      );
      renderIndex += pushCustomAttributesInRenderInstructions(
        renderInstructions,
        customAttributes,
        batchEntry,
        renderIndex
      );

      // vertices count
      renderInstructions[renderIndex++] = flatCoords.length / strideLength;

      // looping on points for positions
      for (let j = 0, jj = flatCoords.length; j < jj; j += strideLength) {
        renderInstructions[renderIndex++] = flatCoords[j];
        renderInstructions[renderIndex++] = flatCoords[j + 1];

        for (let k = 2; k < strideLength; k += 1) {
          renderInstructions[renderIndex++] = flatCoords[j + k];
        }
      }
    }
  }
  return renderInstructions;
}

const Attributes = {
  POSITION: "a_position",
  INDEX: "a_index",
  SEGMENT_START: "a_segmentStart",
  SEGMENT_END: "a_segmentEnd",
  PARAMETERS: "a_parameters",
  JOIN_ANGLES: "a_joinAngles",
  DISTANCE: "a_distance",
  TIME_OFFSET: "a_time_offset",
};

let workerMessageCounter = 0;

class CustomStyleRenderer extends VectorStyleRenderer {
  constructor(styleOrShaders, helper, enableHitDetection) {
    super(styleOrShaders, helper, enableHitDetection);

    const customAttributesDesc = Object.entries(this.customAttributes_).map(
      ([name, value]) => ({
        name: `a_prop_${name}`,
        size: value.size || 1,
        type: AttributeType.FLOAT,
      })
    );

    this.lineStringAttributesDesc_ = [
      {
        name: Attributes.SEGMENT_START,
        size: 2,
        type: AttributeType.FLOAT,
      },
      {
        name: Attributes.SEGMENT_END,
        size: 2,
        type: AttributeType.FLOAT,
      },
      {
        name: Attributes.JOIN_ANGLES,
        size: 2,
        type: AttributeType.FLOAT,
      },
      {
        name: Attributes.DISTANCE,
        size: 1,
        type: AttributeType.FLOAT,
      },
      {
        name: Attributes.PARAMETERS,
        size: 1,
        type: AttributeType.FLOAT,
      },
      {
        name: Attributes.TIME_OFFSET,
        size: 1,
        type: AttributeType.FLOAT,
      },
      ...customAttributesDesc,
    ];
  }
  async generateBuffers(geometryBatch, transform) {
    const renderInstructions = generateLineStringRenderInstructions(
      geometryBatch.lineStringBatch,
      new Float32Array(0),
      this.customAttributes_,
      transform
    );

    const lineStringBuffers = await this.generateBuffersForType_(
      renderInstructions,
      transform
    );
    // also return the inverse of the transform that was applied when generating buffers
    const invertVerticesTransform = makeInverseTransform(
      createTransform(),
      transform
    );

    return {
      polygonBuffers: null,
      lineStringBuffers: lineStringBuffers,
      pointBuffers: null,
      invertVerticesTransform: invertVerticesTransform,
    };
  }
  generateBuffersForType_(renderInstructions, transform) {
    if (renderInstructions === null) {
      return null;
    }

    const messageId = `flow_line_${workerMessageCounter++}`;
    const messageType = "GENERATE_LINE_STRING_BUFFERS";

    /** @type {import('./constants.js').WebGLWorkerGenerateBuffersMessage} */
    const message = {
      id: messageId,
      type: messageType,
      renderInstructions: renderInstructions.buffer,
      renderInstructionsTransform: transform,
      customAttributesSize: getCustomAttributesSize(this.customAttributes_),
      instructionsPerVertex: STRIDE_LENGTH,
    };
    WEBGL_WORKER.postMessage(message, [renderInstructions.buffer]);

    // leave ownership of render instructions
    renderInstructions = null;

    return new Promise((resolve) => {
      /**
       * @param {*} event Event.
       */
      const handleMessage = (event) => {
        const received = event.data;

        // this is not the response to our request: skip
        if (received.id !== messageId) {
          return;
        }

        // we've received our response: stop listening
        WEBGL_WORKER.removeEventListener("message", handleMessage);

        // the helper has disposed in the meantime; the promise will not be resolved
        if (!this.helper_.getGL()) {
          return;
        }

        // copy & flush received buffers to GPU
        const verticesBuffer = new WebGLArrayBuffer(
          ARRAY_BUFFER,
          DYNAMIC_DRAW
        ).fromArrayBuffer(received.vertexBuffer);
        const indicesBuffer = new WebGLArrayBuffer(
          ELEMENT_ARRAY_BUFFER,
          DYNAMIC_DRAW
        ).fromArrayBuffer(received.indexBuffer);
        this.helper_.flushBufferData(verticesBuffer);
        this.helper_.flushBufferData(indicesBuffer);

        resolve([indicesBuffer, verticesBuffer]);
      };

      WEBGL_WORKER.addEventListener("message", handleMessage);
    });
  }
}

class CustomMixedGeometryBatch extends MixedGeometryBatch {
  constructor() {
    super();
  }
  /**
   * @param {GeometryType} type Geometry type
   * @param {Array<number>} flatCoords Flat coordinates
   * @param {Array<number> | Array<Array<number>> | null} ends Coordinate ends
   * @param {Feature|RenderFeature} feature Feature
   * @param {string} featureUid Feature uid
   * @param {number} stride Stride
   * @private
   */
  addCoordinates_(type, flatCoords, ends, feature, featureUid, stride) {
    /** @type {number} */
    let verticesCount;
    switch (type) {
      case "LineString":
      case "LinearRing":
        if (!this.lineStringBatch.entries[featureUid]) {
          this.lineStringBatch.entries[featureUid] = this.addRefToEntry_(
            featureUid,
            {
              feature: feature,
              flatCoordss: [],
              verticesCount: 0,
            }
          );
        }
        verticesCount = flatCoords.length / stride;
        this.lineStringBatch.verticesCount += verticesCount;
        this.lineStringBatch.geometriesCount++;
        this.lineStringBatch.entries[featureUid].flatCoordss.push(flatCoords);
        this.lineStringBatch.entries[featureUid].verticesCount += verticesCount;
        break;
      default:
      // pass
    }
  }
}

class CustomLayerRenderer extends WebGLVectorLayerRenderer {
  constructor(layer, options) {
    super(layer, options);

    this.batch_ = new CustomMixedGeometryBatch();
  }
  createRenderers_() {
    this.buffers_ = [];
    this.styleRenderers_ = this.styles_.map(
      (style) =>
        new CustomStyleRenderer(style, this.helper, this.hitDetectionEnabled_)
    );
  }
}

class CustomLayer extends VectorLayer {
  createRenderer() {
    const renerer = new CustomLayerRenderer(this, {
      style: {
        // todo 下面的数据应从style数据获取，style更新时renerer也要更新
        builder: new CustomShaderBuilder()
          .setStrokeWidthExpression("2.")
          .addUniform("float timeStart")
          .addUniform("float timeEnd")
          .setStrokePathStartTime("0.")
          .setStrokPathDuration("10000."),
      },
    });

    return renerer;
  }
}

const vectorSource = new Vector({
  format: new GeoJSON(),
  features: [
    new Feature({
      geometry: new LineString([
        [0, 0, 0],
        [10000000, 0, 1000],
        [10000000, 10000000, 10000],
      ]),
      properties: {
        startTime: 0,
        endTime: 10000,
      },
    }),
  ],
});

const webglLayer = new CustomLayer({
  source: vectorSource,
});

const debugLayer = new VectorLayer({
  source: vectorSource,
});

const map = new Map({
  layers: [
    new TileLayer({
      source: new OSM(),
    }),
    webglLayer,
    // debugLayer,
  ],
  target: document.getElementById("map"),
  view: new View({
    center: [0, 0],
    zoom: 2,
  }),
});
map.on("pointermove", function (evt) {
  const hasFeature = map.hasFeatureAtPixel(evt.pixel);
  if (hasFeature) {
    document.getElementById("map").style.cursor = "pointer";
  } else {
    document.getElementById("map").style.cursor = "default";
  }
});
function animate() {
  map.render();
  window.requestAnimationFrame(animate);
}
animate();
