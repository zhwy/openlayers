import Map from "../src/ol/Map.js";
import View from "../src/ol/View.js";
import GeoJSON from "../src/ol/format/GeoJSON.js";
import TileLayer from "../src/ol/layer/Tile.js";
import VectorTileLayer from "../src/ol/layer/VectorTile.js";
import VectorTile from "../src/ol/source/VectorTile.js";
import XYZ from "../src/ol/source/XYZ.js";
import Projection from "../src/ol/proj/Projection.js";
import TileGrid from "../src/ol/tilegrid/WMTS.js";

const proj = new Projection({
  code: "EPSG:4326",
  units: "degrees"
});
var resolutions = [
  0.703125,
  0.3515625,
  0.17578125,
  0.087890625,
  0.0439453125,
  0.02197265625,
  0.010986328125,
  0.0054931640625,
  0.00274658203125,
  0.001373291015625,
  6.866455078125e-4,
  3.4332275390625e-4,
  1.71661376953125e-4,
  8.58306884765625e-5,
  4.291534423828125e-5,
  2.1457672119140625e-5,
  1.0728836059570312e-5,
  5.364418029785156e-6,
  2.682209014892578e-6,
  1.341104507446289e-6,
  6.705522537231445e-7,
  3.3527612686157227e-7
];
const gridsetName = "EPSG:4326";
const gridNames = [
  "EPSG:4326:0",
  "EPSG:4326:1",
  "EPSG:4326:2",
  "EPSG:4326:3",
  "EPSG:4326:4",
  "EPSG:4326:5",
  "EPSG:4326:6",
  "EPSG:4326:7",
  "EPSG:4326:8",
  "EPSG:4326:9",
  "EPSG:4326:10",
  "EPSG:4326:11",
  "EPSG:4326:12",
  "EPSG:4326:13",
  "EPSG:4326:14",
  "EPSG:4326:15",
  "EPSG:4326:16",
  "EPSG:4326:17",
  "EPSG:4326:18",
  "EPSG:4326:19",
  "EPSG:4326:20",
  "EPSG:4326:21"
];
const tilegrid = new TileGrid({
  tileSize: [256, 256],
  origin: [-180.0, 90.0],
  resolutions: resolutions,
  matrixIds: gridNames,
  extent: [-180.0, -90.0, 180.0, 90.0]
});

const map = new Map({
  target: "map",
  view: new View({
    center: [114.026069, 22.626171],
    zoom: 10,
    projection: proj
  }),
  layers: [
    new TileLayer({
      source: new XYZ({
        // projection: proj,
        url:
          "http://wprd0{1-4}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=7&x={x}&y={y}&z={z}"
      })
    }),
    new VectorTileLayer({
      source: new VectorTile({
        projection: proj,
        tileGrid: tilegrid,
        format: new GeoJSON(),
        url:
          "http://localhost:8089/geoserver/gwc/service/tms/1.0.0/shenzhen_gismod%3AGCJPM_LINE_AXISES2@EPSG%3A4326@geojson/{z}/{x}/{-y}.geojson"
        // url:
        //   "http://localhost:8089/geoserver/gwc/service/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&LAYER=shenzhen_gismod:GCJPM_LINE_AXISES2&STYLE=&TILEMATRIX=EPSG:900913:{z}&TILEMATRIXSET=EPSG:4326&FORMAT=application/json;type=geojson&TILECOL={x}&TILEROW={y}"
      })
    })
  ]
});

// map.on("pointermove", showInfo);

const info = document.getElementById("info");
function showInfo(event) {
  const features = map.getFeaturesAtPixel(event.pixel);
  if (features.length == 0) {
    info.innerText = "";
    info.style.opacity = 0;
    return;
  }
  const properties = features[0].getProperties();
  info.innerText = JSON.stringify(properties, null, 2);
  info.style.opacity = 1;
}
