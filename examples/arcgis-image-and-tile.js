import Map from '../src/ol/Map.js';
import View from '../src/ol/View.js';
import { ImageArcGISRest, OSM, TileArcGISRest, XYZ } from '../src/ol/source.js';
import { Image as ImageLayer, Tile as TileLayer } from '../src/ol/layer.js';
import { fromLonLat, Projection, transform } from "../src/ol/proj.js";
import TileGrid from "../src/ol/tilegrid/TileGrid.js";
import { FullScreen, defaults as defaultControls } from 'ol/control';
// import proj4 from "proj4";
import { register } from "../src/ol/proj/proj4";

proj4.defs("EPSG:2385", "+proj=tmerc +lat_0=31.25 +lon_0=121.5 +k=1 +x_0=0 +y_0=0 +a=6378140 +b=6356755.288157528 +units=m +no_defs");
register(proj4)

const url =
  'http://10.10.20.46:6080/arcgis/rest/services/WaterWay_2017/MapServer';
const url2 = 'http://10.10.20.46:6080/arcgis/rest/services/WaterWay_Base1/MapServer';

const customProj = "EPSG:2385";

const resolutions = [
  264.5838625010584,
  132.2919312505292,
  66.1459656252646,
  33.0729828126323,
  16.933367200067735,
  8.466683600033868,
  4.233341800016934,
  2.116670900008467,
  1.0583354500042335,
  0.5291677250021167,
  0.26458386250105836,
  0.13229193125052918,
  0.06614596562526459
]

const tilegrid = new TileGrid({
  extent: [-59652.19859999977, -60368.23010000028, 55208.431099999696, 68546.7575000003],
  resolutions: resolutions,
  origin: [-5123200.0, 1.00021E7]
})

const layers = [
  new TileLayer({
    source: new OSM(),
  }),
  new TileLayer({
    // source: new TileArcGISRest({
    //   url: url2,
    // }),
    source: new XYZ({
      url: url2 + "/tile/{z}/{y}/{x}",
      projection: customProj,
      tileGrid: tilegrid
    }),
  }),
  new ImageLayer({
    source: new ImageArcGISRest({
      url: url,
      projection: customProj
    }),
  }),
];

console.log(transform([-10210, 29508], 'EPSG:2385', 'EPSG:3857'))

const map = new Map({
  controls: defaultControls().extend([new FullScreen()]),
  layers: layers,
  target: 'map',
  view: new View({
    // center: fromLonLat([118.670, 39.083]),
    // center: transform([-10210, 29508], 'EPSG:2385', 'EPSG:3857'),
    center: [-10210, 29508],
    zoom: 0,
    projection: customProj,
    resolutions: resolutions,
    constrainResolution: true
  }),
});
