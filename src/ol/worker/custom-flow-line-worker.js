/**
 * A worker that does cpu-heavy tasks related to webgl rendering.
 * @module ol/worker/webgl
 */
import {
  create as createTransform,
  makeInverse as makeInverseTransform,
  apply as applyTransform,
} from "../transform.js";
import { clamp } from "../math.js";
import { LINESTRING_ANGLE_COSINE_CUTOFF } from "../render/webgl/utils.js";

/** @type {any} */
const worker = self;

/**
 * Pushes a single quad to form a line segment; also includes a computation for the join angles with previous and next
 * segment, in order to be able to offset the vertices correctly in the shader.
 * Join angles are between 0 and 2PI.
 * This also computes the length of the current segment and the sum of the join angle tangents in order
 * to store this information on each subsequent segment along the line. This is necessary to correctly render dashes
 * and symbols along the line.
 *
 *   pB (before)                          pA (after)
 *    X             negative             X
 *     \             offset             /
 *      \                              /
 *       \   join              join   /
 *        \ angle 0          angle 1 /
 *         \←---                ←---/      positive
 *          \   ←--          ←--   /        offset
 *           \     ↑       ↓      /
 *            X────┴───────┴─────X
 *            p0                  p1
 *
 * @param {Float32Array} instructions Array of render instructions for lines.s
 * @param {number} segmentStartIndex Index of the segment start point from which render instructions will be read.
 * @param {number} segmentEndIndex Index of the segment end point from which render instructions will be read.
 * @param {number|null} beforeSegmentIndex Index of the point right before the segment (null if none, e.g this is a line start)
 * @param {number|null} afterSegmentIndex Index of the point right after the segment (null if none, e.g this is a line end)
 * @param {Array<number>} vertexArray Array containing vertices.
 * @param {Array<number>} indexArray Array containing indices.
 * @param {Array<number>} customAttributes Array of custom attributes value
 * @param {import('../../ol/transform.js').Transform} toWorldTransform Transform matrix used to obtain world coordinates from instructions
 * @param {number} currentLength Cumulated length of segments processed so far
 * @param {number} currentAngleTangentSum Cumulated tangents of the join angles processed so far
 * @return {{length: number, angle: number}} Cumulated length with the newly processed segment (in world units), new sum of the join angle tangents
 * @private
 */
function writeLineSegmentToBuffers(
  instructions,
  segmentStartIndex,
  segmentEndIndex,
  beforeSegmentIndex,
  afterSegmentIndex,
  vertexArray,
  indexArray,
  customAttributes,
  toWorldTransform,
  currentLength,
  currentAngleTangentSum
) {
  // compute the stride to determine how many vertices were already pushed
  const baseVertexAttrsCount = 10; // base attributes: x0, y0, x1, y1, timeoffset0, timeoffset1, angle0, angle1, distance, params
  const stride = baseVertexAttrsCount + customAttributes.length;
  const baseIndex = vertexArray.length / stride;

  // The segment is composed of two positions called P0[x0, y0] and P1[x1, y1]
  // Depending on whether there are points before and after the segment, its final shape
  // will be different
  const p0 = [
    instructions[segmentStartIndex + 0],
    instructions[segmentStartIndex + 1],
  ];
  const p1 = [instructions[segmentEndIndex], instructions[segmentEndIndex + 1]];

  // to compute join angles we need to reproject coordinates back in world units
  const p0world = applyTransform(toWorldTransform, [...p0]);
  const p1world = applyTransform(toWorldTransform, [...p1]);

  const timeoffset0 = instructions[segmentStartIndex + 2];
  const timeoffset1 = instructions[segmentEndIndex + 2];

  /**
   * Compute the angle between p0pA and p0pB
   * @param {import("../../ol/coordinate.js").Coordinate} p0 Point 0
   * @param {import("../../ol/coordinate.js").Coordinate} pA Point A
   * @param {import("../../ol/coordinate.js").Coordinate} pB Point B
   * @return {number} a value in [0, 2PI]
   */
  function angleBetween(p0, pA, pB) {
    const lenA = Math.sqrt(
      (pA[0] - p0[0]) * (pA[0] - p0[0]) + (pA[1] - p0[1]) * (pA[1] - p0[1])
    );
    const tangentA = [(pA[0] - p0[0]) / lenA, (pA[1] - p0[1]) / lenA];
    const orthoA = [-tangentA[1], tangentA[0]];
    const lenB = Math.sqrt(
      (pB[0] - p0[0]) * (pB[0] - p0[0]) + (pB[1] - p0[1]) * (pB[1] - p0[1])
    );
    const tangentB = [(pB[0] - p0[0]) / lenB, (pB[1] - p0[1]) / lenB];

    // this angle can be clockwise or anticlockwise; hence the computation afterwards
    const angle =
      lenA === 0 || lenB === 0
        ? 0
        : Math.acos(
            clamp(tangentB[0] * tangentA[0] + tangentB[1] * tangentA[1], -1, 1)
          );
    const isClockwise = tangentB[0] * orthoA[0] + tangentB[1] * orthoA[1] > 0;
    return !isClockwise ? Math.PI * 2 - angle : angle;
  }

  // a negative angle indicates a line cap
  let angle0 = -1;
  let angle1 = -1;
  let newAngleTangentSum = currentAngleTangentSum;

  const joinBefore = beforeSegmentIndex !== null;
  const joinAfter = afterSegmentIndex !== null;

  // add vertices and adapt offsets for P0 in case of join
  if (joinBefore) {
    // B for before
    const pB = [
      instructions[beforeSegmentIndex],
      instructions[beforeSegmentIndex + 1],
    ];
    const pBworld = applyTransform(toWorldTransform, [...pB]);
    angle0 = angleBetween(p0world, p1world, pBworld);

    // only add to the sum if the angle isn't too close to 0 or 2PI
    if (Math.cos(angle0) <= LINESTRING_ANGLE_COSINE_CUTOFF) {
      newAngleTangentSum += Math.tan((angle0 - Math.PI) / 2);
    }
  }
  // adapt offsets for P1 in case of join; add to angle sum
  if (joinAfter) {
    // A for after
    const pA = [
      instructions[afterSegmentIndex],
      instructions[afterSegmentIndex + 1],
    ];
    const pAworld = applyTransform(toWorldTransform, [...pA]);
    angle1 = angleBetween(p1world, p0world, pAworld);

    // only add to the sum if the angle isn't too close to 0 or 2PI
    if (Math.cos(angle1) <= LINESTRING_ANGLE_COSINE_CUTOFF) {
      newAngleTangentSum += Math.tan((Math.PI - angle1) / 2);
    }
  }

  /**
   * @param {number} vertexIndex From 0 to 3, indicating position in the quad
   * @param {number} angleSum Sum of the join angles encountered so far (used to compute distance offset
   * @return {number} A float value containing both information
   */
  function computeParameters(vertexIndex, angleSum) {
    if (angleSum === 0) {
      return vertexIndex * 10000;
    }
    return Math.sign(angleSum) * (vertexIndex * 10000 + Math.abs(angleSum));
  }

  // add main segment triangles
  vertexArray.push(
    p0[0],
    p0[1],
    p1[0],
    p1[1],
    angle0,
    angle1,
    currentLength,
    computeParameters(0, currentAngleTangentSum),
    timeoffset0,
    timeoffset0 // 这个值在着色器中不使用
  );
  vertexArray.push(...customAttributes);

  vertexArray.push(
    p0[0],
    p0[1],
    p1[0],
    p1[1],
    angle0,
    angle1,
    currentLength,
    computeParameters(1, currentAngleTangentSum),
    timeoffset0,
    timeoffset0
  );
  vertexArray.push(...customAttributes);

  vertexArray.push(
    p0[0],
    p0[1],
    p1[0],
    p1[1],
    angle0,
    angle1,
    currentLength,
    computeParameters(2, currentAngleTangentSum),
    timeoffset1,
    timeoffset1
  );
  vertexArray.push(...customAttributes);

  vertexArray.push(
    p0[0],
    p0[1],
    p1[0],
    p1[1],
    angle0,
    angle1,
    currentLength,
    computeParameters(3, currentAngleTangentSum),
    timeoffset1,
    timeoffset1
  );
  vertexArray.push(...customAttributes);

  indexArray.push(
    baseIndex,
    baseIndex + 1,
    baseIndex + 2,
    baseIndex + 1,
    baseIndex + 3,
    baseIndex + 2
  );

  return {
    length:
      currentLength +
      Math.sqrt(
        (p1world[0] - p0world[0]) * (p1world[0] - p0world[0]) +
          (p1world[1] - p0world[1]) * (p1world[1] - p0world[1])
      ),
    angle: newAngleTangentSum,
  };
}

worker.onmessage = (event) => {
  const received = event.data;
  {
    /** @type {Array<number>} */
    const vertices = [];
    /** @type {Array<number>} */
    const indices = [];

    const customAttrsCount = received.customAttributesSize;
    const instructionsPerVertex = received.instructionsPerVertex;

    const renderInstructions = new Float32Array(received.renderInstructions);
    let currentInstructionsIndex = 0;

    const transform = received.renderInstructionsTransform;
    const invertTransform = createTransform();
    makeInverseTransform(invertTransform, transform);

    let verticesCount, customAttributes;
    while (currentInstructionsIndex < renderInstructions.length) {
      customAttributes = Array.from(
        renderInstructions.slice(
          currentInstructionsIndex,
          currentInstructionsIndex + customAttrsCount
        )
      );
      currentInstructionsIndex += customAttrsCount;
      verticesCount = renderInstructions[currentInstructionsIndex++];

      const firstInstructionsIndex = currentInstructionsIndex;
      const lastInstructionsIndex =
        currentInstructionsIndex + (verticesCount - 1) * instructionsPerVertex;
      const isLoop =
        renderInstructions[firstInstructionsIndex] ===
          renderInstructions[lastInstructionsIndex] &&
        renderInstructions[firstInstructionsIndex + 1] ===
          renderInstructions[lastInstructionsIndex + 1];

      let currentLength = 0;
      let currentAngleTangentSum = 0;

      // last point is only a segment end, do not loop over it
      for (let i = 0; i < verticesCount - 1; i++) {
        let beforeIndex = null;
        if (i > 0) {
          beforeIndex =
            currentInstructionsIndex + (i - 1) * instructionsPerVertex;
        } else if (isLoop) {
          beforeIndex = lastInstructionsIndex - instructionsPerVertex;
        }
        let afterIndex = null;
        if (i < verticesCount - 3) {
          afterIndex =
            currentInstructionsIndex + (i + 3) * instructionsPerVertex;
        } else if (isLoop) {
          afterIndex = firstInstructionsIndex + instructionsPerVertex;
        }
        const measures = writeLineSegmentToBuffers(
          renderInstructions,
          currentInstructionsIndex + i * instructionsPerVertex,
          currentInstructionsIndex + (i + 1) * instructionsPerVertex,
          beforeIndex,
          afterIndex,
          vertices,
          indices,
          customAttributes,
          invertTransform,
          currentLength,
          currentAngleTangentSum
        );
        currentLength = measures.length;
        currentAngleTangentSum = measures.angle;
      }

      currentInstructionsIndex += verticesCount * instructionsPerVertex;
    }

    const indexBuffer = Uint32Array.from(indices);
    const vertexBuffer = Float32Array.from(vertices);

    /** @type {import('../render/webgl/constants.js').WebGLWorkerGenerateBuffersMessage} */
    const message = Object.assign(
      {
        vertexBuffer: vertexBuffer.buffer,
        indexBuffer: indexBuffer.buffer,
        renderInstructions: renderInstructions.buffer,
      },
      received
    );

    worker.postMessage(message, [
      vertexBuffer.buffer,
      indexBuffer.buffer,
      renderInstructions.buffer,
    ]);
  }
};

export let create;
