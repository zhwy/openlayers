import Map from "../src/ol/Map.js";
import View from "../src/ol/View.js";
import GeoJSON from "../src/ol/format/GeoJSON.js";
import TileLayer from "../src/ol/layer/Tile.js";
import VectorTileLayer from "../src/ol/layer/VectorTile.js";
import VectorTile from "../src/ol/source/VectorTile.js";
import OSM from "../src/ol/source/OSM.js";
import Projection from "../src/ol/proj/Projection.js";
import TileGrid from "../src/ol/tilegrid/WMTS.js";
import { Fill, Stroke, Style, Circle } from "../src/ol/style.js";

const use3857 = true;

const proj = use3857
  ? new Projection({
      code: "EPSG:3857",
      units: "m",
    })
  : new Projection({
      code: "EPSG:4326",
      units: "degrees",
    });

const extent = use3857
  ? [-20037508.34, -20037508.34, 20037508.34, 20037508.34]
  : [-180.0, -90.0, 180.0, 90.0];

const maxResolution = use3857 ? (20037508.34 * 2) / 256 : 180 / 256;

const resolutions = [];

for (let i = 0; i < 20; i += 1) {
  resolutions.push(maxResolution / Math.pow(2, i));
}

const tilegrid = new TileGrid({
  tileSize: [256, 256],
  origin: [extent[0], extent[3]],
  resolutions: resolutions,
  extent: extent,
});

const map = new Map({
  target: "map",
  view: new View({
    center: [0, 0],
    zoom: 1,
    projection: proj,
    constrainResolution: true,
  }),
  layers: [
    new TileLayer({
      source: new OSM(),
    }),
    // tileGrid需和geoserver上匹配
    new VectorTileLayer({
      source: new VectorTile({
        projection: proj,
        tileGrid: tilegrid,
        format: new GeoJSON({
          dataProjection: proj,
        }),
        // url: `http://localhost:8080/geoserver/gwc/service/tms/1.0.0/ForTest:PointTest@EPSG:${
        //   use3857 ? "3857" : "4326"
        // }@geojson/{z}/{x}/{-y}.geojson`,
        url: `http://localhost:8080/geoserver/gwc/service/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&LAYER=ForTest:PointTest&STYLE=&TILEMATRIX=EPSG:${
          use3857 ? "3857" : "4326"
        }:{z}&TILEMATRIXSET=EPSG:${
          use3857 ? "3857" : "4326"
        }&FORMAT=application/json;type=geojson&TILECOL={x}&TILEROW={y}`,
      }),
      style: (fea) => {
        return new Style({
          image: new Circle({
            radius: 3,
            fill: new Fill({
              color: "red",
            }),
          }),
        });
      },
    }),
  ],
});

map.on("pointermove", showInfo);

const info = document.getElementById("info");
function showInfo(event) {
  info.innerHTML = `${event.coordinate[0].toFixed(
    2
  )},<br/>${event.coordinate[1].toFixed(2)}`;
  // const features = map.getFeaturesAtPixel(event.pixel);
  // if (features.length == 0) {
  //   info.innerText = "";
  //   info.style.opacity = 0;
  //   return;
  // }
  // const properties = features[0].getProperties();
  // info.innerText = JSON.stringify(properties, null, 2);
  // info.style.opacity = 1;
}
