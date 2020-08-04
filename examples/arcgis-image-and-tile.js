import Map from '../src/ol/Map.js';
import View from '../src/ol/View.js';
import { ImageArcGISRest, OSM } from '../src/ol/source.js';
import { Image as ImageLayer, Tile as TileLayer } from '../src/ol/layer.js';
import { fromLonLat, Projection } from "../src/ol/proj.js";

const url =
  'http://10.10.20.46:6080/arcgis/rest/services/WaterWay_2017/MapServer';
// const url2 = 'https://sampleserver1.arcgisonline.com/ArcGIS/rest/services/' +
//   'Specialty/ESRI_StateCityHighway_USA/MapServer';

const layers = [
  // new TileLayer({
  //   source: new OSM(),
  // }),
  new ImageLayer({
    source: new ImageArcGISRest({
      ratio: 1,
      params: {
        BBOXSR: 2385,
        IMAGESR: 2385
      },
      url: url2,
      projection: new Projection({
        code: "EPSG:2385",

      })
    }),
  }),
];
const map = new Map({
  layers: layers,
  target: 'map',
  view: new View({
    // center: fromLonLat([118.670, 39.083]),
    center: [-10210, 29508],
    zoom: 10,
    projection: "EPSG:3857"
  }),
});
