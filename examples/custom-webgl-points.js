import Renderer from '../src/ol/renderer/webgl/PointsLayer.js';
import { clamp } from '../src/ol/math.js';
import VectorLayer from '../src/ol/layer/Vector.js';

import TileLayer from '../src/ol/layer/Tile.js';
import Vector from '../src/ol/source/Vector.js';
import Map from "../src/ol/Map.js";
import View from "../src/ol/View.js";
import GeoJSON from "../src/ol/format/GeoJSON.js";
import OSM from '../src/ol/source/OSM.js';

class CustomLayer extends VectorLayer {
    createRenderer() {
        return new Renderer(this, {
            attributes: [
                {
                    name: 'population',
                    callback: feature => {
                        return 20 * (feature.get('population')) / 5000000 + 5;
                    },
                },
                {
                    name: 'type',
                    callback: feature => {
                        return feature.get('population') < 5000000 ? 0 : 1;
                    }
                }
            ],
            uniforms: {
                u_color: [0.0, 0.5, 1.0, 1.]
            },
            vertexShader: `
                precision mediump float;
                uniform mat4 u_projectionMatrix;
                uniform mat4 u_offsetScaleMatrix;
                uniform mat4 u_offsetRotateMatrix;
                uniform float u_time;
                uniform float u_zoom;
                uniform float u_resolution;
                uniform vec4 u_color;

                attribute vec2 a_position;
                attribute float a_index;
                attribute float a_population;
                attribute float a_type;

                varying vec2 v_texCoord;
                varying vec2 v_quadCoord;
                varying vec2 v_size;
                varying float v_type;
                varying vec4 v_color;

                void main(void) {
                    float population = 30.;
                    mat4 offsetMatrix = u_offsetScaleMatrix;
                    vec2 halfSize = vec2(a_population) * 0.5;
                    vec2 offset = vec2(0.0, 0.0);
                    float angle = 0.;
                    float offsetX;
                    float offsetY;
                    if (a_index == 0.0) {
                        offsetX = (offset.x - halfSize.x) * cos(angle) + (offset.y - halfSize.y) * sin(angle);
                        offsetY = (offset.y - halfSize.y) * cos(angle) - (offset.x - halfSize.x) * sin(angle);
                    } else if (a_index == 1.0) {
                        offsetX = (offset.x + halfSize.x) * cos(angle) + (offset.y - halfSize.y) * sin(angle);
                        offsetY = (offset.y - halfSize.y) * cos(angle) - (offset.x + halfSize.x) * sin(angle);
                    } else if (a_index == 2.0) {
                        offsetX = (offset.x + halfSize.x) * cos(angle) + (offset.y + halfSize.y) * sin(angle);
                        offsetY = (offset.y + halfSize.y) * cos(angle) - (offset.x + halfSize.x) * sin(angle);
                    } else {
                        offsetX = (offset.x - halfSize.x) * cos(angle) + (offset.y + halfSize.y) * sin(angle);
                        offsetY = (offset.y + halfSize.y) * cos(angle) - (offset.x - halfSize.x) * sin(angle);
                    }
                    vec4 offsets = offsetMatrix * vec4(offsetX, offsetY, 0.0, 0.0);
                    gl_Position = u_projectionMatrix * vec4(a_position, 0.0, 1.0) + offsets;
                    vec4 texCoord = vec4(0.0, 0.0, 1.0, 1.0);
                    float u = a_index == 0.0 || a_index == 3.0 ? texCoord.x : texCoord.z;
                    float v = a_index == 2.0 || a_index == 3.0 ? texCoord.y : texCoord.w;
                    v_texCoord = vec2(u, v);
                    u = a_index == 0.0 || a_index == 3.0 ? 0.0 : 1.0;
                    v = a_index == 2.0 || a_index == 3.0 ? 0.0 : 1.0;
                    v_quadCoord = vec2(u, v);

                    v_size = halfSize;
                    v_type = a_type;
                    v_color = u_color;
                }
            `,
            fragmentShader: `
                precision mediump float;
                uniform float u_time;
                uniform float u_zoom;
                uniform float u_resolution;

                varying vec2 v_texCoord;
                varying vec2 v_quadCoord;
                varying vec2 v_size;
                varying float v_type;
                varying vec4 v_color;

                void main(void) {
                    if (false) { discard; }
                    if(v_type == 0.0)
                    {
                        // 圆形
                        vec4 tmp = vec4(v_color.rgb, 1. * (1. - smoothstep(1. - 4./v_size.x, 1., dot(v_quadCoord-.5,v_quadCoord-.5)*4. + 2./v_size.x)));
                        gl_FragColor = vec4(1., 1., 1., v_color.a * 1.0 * (1.0-smoothstep(1.-4./v_size.x,1.,dot(v_quadCoord-.5,v_quadCoord-.5)*4.)));                        

                        gl_FragColor.a -= tmp.a; //减出一个环
                        gl_FragColor.rgb *= gl_FragColor.a;

                        tmp.rgb *= tmp.a;
                        gl_FragColor += tmp; //加上环 
                        

                    }
                    else
                    {
                        // 三角形
                        float tmp = 2.094395102;
                        vec2 trans = v_quadCoord * 2. -1.;
                        gl_FragColor = vec4(v_color.rgb, v_color.a * 1.0 * (1.0 - smoothstep(0.5 - 3./v_size.x, .5, cos(floor(.5 + atan(trans.x,trans.y) / tmp) *  tmp - atan(trans.x,trans.y)) * length(trans))));
                        gl_FragColor.rgb *= gl_FragColor.a;
                    }                    
                }
            `,
            hitVertexShader: `
                precision mediump float;
                uniform mat4 u_projectionMatrix;
                uniform mat4 u_offsetScaleMatrix;
                uniform mat4 u_offsetRotateMatrix;
                uniform float u_time;
                uniform float u_zoom;
                uniform float u_resolution;

                attribute vec2 a_position;
                attribute float a_index;
                attribute vec4 a_hitColor;
                attribute float a_type;
                attribute float a_population;

                varying vec2 v_texCoord;
                varying vec2 v_quadCoord;
                varying vec4 v_hitColor;
                varying float v_type;
                varying vec2 v_size;

                void main(void) {
                    mat4 offsetMatrix = u_offsetScaleMatrix;
                    vec2 halfSize = vec2(a_population) * 0.5;
                    vec2 offset = vec2(0.0, 0.0);
                    float angle = 0.0;
                    float offsetX;
                    float offsetY;
                    if (a_index == 0.0) {
                        offsetX = (offset.x - halfSize.x) * cos(angle) + (offset.y - halfSize.y) * sin(angle);
                        offsetY = (offset.y - halfSize.y) * cos(angle) - (offset.x - halfSize.x) * sin(angle);
                    } else if (a_index == 1.0) {
                        offsetX = (offset.x + halfSize.x) * cos(angle) + (offset.y - halfSize.y) * sin(angle);
                        offsetY = (offset.y - halfSize.y) * cos(angle) - (offset.x + halfSize.x) * sin(angle);
                    } else if (a_index == 2.0) {
                        offsetX = (offset.x + halfSize.x) * cos(angle) + (offset.y + halfSize.y) * sin(angle);
                        offsetY = (offset.y + halfSize.y) * cos(angle) - (offset.x + halfSize.x) * sin(angle);
                    } else {
                        offsetX = (offset.x - halfSize.x) * cos(angle) + (offset.y + halfSize.y) * sin(angle);
                        offsetY = (offset.y + halfSize.y) * cos(angle) - (offset.x - halfSize.x) * sin(angle);
                    }
                    vec4 offsets = offsetMatrix * vec4(offsetX, offsetY, 0.0, 0.0);
                    gl_Position = u_projectionMatrix * vec4(a_position, 0.0, 1.0) + offsets;
                    vec4 texCoord = vec4(0.0, 0.0, 1.0, 1.0);
                    float u = a_index == 0.0 || a_index == 3.0 ? texCoord.s : texCoord.p;
                    float v = a_index == 2.0 || a_index == 3.0 ? texCoord.t : texCoord.q;
                    v_texCoord = vec2(u, v);
                    u = a_index == 0.0 || a_index == 3.0 ? 0.0 : 1.0;
                    v = a_index == 2.0 || a_index == 3.0 ? 0.0 : 1.0;
                    v_quadCoord = vec2(u, v);
                    v_hitColor = a_hitColor;
                    v_size = halfSize;
                    v_type = a_type;
                }
            `,
            hitFragmentShader: `                
                precision mediump float;
                uniform float u_time;
                uniform float u_zoom;
                uniform float u_resolution;

                varying vec2 v_texCoord;
                varying vec2 v_quadCoord;
                varying vec4 v_hitColor;
                varying float v_type;
                varying vec2 v_size;

                void main(void) {
                    vec4 color = vec4(1.0, 1., 1., 1.);
                    if (false) { discard; }
                    if(v_type == 0.0)
                    {
                        gl_FragColor = vec4(color.rgb, color.a * 1.0 * (1.0-smoothstep(1.-4./v_size.x,1.,dot(v_quadCoord-.5,v_quadCoord-.5)*4.)));

                    }
                    else
                    {
                        // 三角形
                        float tmp = 2.094395102;
                        // tmp = 3.;
                        gl_FragColor = vec4(color.rgb, color.a * 1.0 * (1.0-smoothstep(.5-3./v_size.x,.5,cos(floor(.5+(atan((v_quadCoord*2.-1.).x,(v_quadCoord*2.-1.).y))/tmp)*tmp-(atan((v_quadCoord*2.-1.).x,(v_quadCoord*2.-1.).y)))*length((v_quadCoord*2.-1.)))));
                    }
                    gl_FragColor.rgb *= gl_FragColor.a;
                    if (gl_FragColor.a < 0.1) { discard; } gl_FragColor = v_hitColor;
                }
            `

        });
    }
}

const vectorSource = new Vector({
    url: 'data/geojson/world-cities.geojson',
    format: new GeoJSON()
});

const webglLayer = new CustomLayer({
    source: vectorSource
})

const map = new Map({
    layers: [
        new TileLayer({
            source: new OSM()
        }),
        webglLayer
        // vectorLayer
    ],
    target: document.getElementById('map'),
    view: new View({
        center: [0, 0],
        zoom: 2
    })
});
map.on('pointermove', function (evt) {
    const hasFeature = map.hasFeatureAtPixel(evt.pixel);
    if (hasFeature) {
        document.getElementById('map').style.cursor = "pointer";
    } else {
        document.getElementById('map').style.cursor = "default";
    }
})
// function animate() {
//     map.render();
//     window.requestAnimationFrame(animate);
// }
// animate();
