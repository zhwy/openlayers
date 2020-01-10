import Map from "../src/ol/Map.js";
import View from "../src/ol/View.js";
import TileLayer from "../src/ol/layer/Tile.js";
import WebGLPointsLayer from "../src/ol/layer/WebGLPoints.js";
import GeoJSON from "../src/ol/format/GeoJSON.js";
import Vector from "../src/ol/source/Vector.js";
import OSM from "../src/ol/source/OSM.js";

const vectorSource = new Vector({
  url: "data/geojson/world-cities.geojson",
  format: new GeoJSON()
});

const predefinedStyles = {
  icons: {
    symbol: {
      symbolType: "image",
      src: "data/icon.png",
      size: [18, 28],
      color: "lightyellow",
      rotateWithView: false,
      offset: [0, 9]
    }
  },
  triangles: {
    symbol: {
      symbolType: "triangle",
      size: 18,
      color: [
        "interpolate",
        ["linear"],
        ["get", "population"],
        20000,
        "#5aca5b",
        300000,
        "#ff6a19"
      ],
      rotateWithView: true
    }
  },
  "triangles-latitude": {
    symbol: {
      symbolType: "triangle",
      size: [
        "interpolate",
        ["linear"],
        ["get", "population"],
        40000,
        12,
        2000000,
        24
      ],
      color: [
        "interpolate",
        ["linear"],
        ["get", "latitude"],
        -60,
        "#ff14c3",
        -20,
        "#ff621d",
        20,
        "#ffed02",
        60,
        "#00ff67"
      ],
      offset: [0, 0],
      opacity: 0.95
    }
  },
  circles: {
    symbol: {
      symbolType: "circle",
      size: [
        "interpolate",
        ["linear"],
        ["get", "population"],
        40000,
        8,
        2000000,
        28
      ],
      color: "#006688",
      rotateWithView: false,
      offset: [0, 0],
      opacity: [
        "interpolate",
        ["linear"],
        ["get", "population"],
        40000,
        0.6,
        2000000,
        0.92
      ]
    }
  },
  "circles-zoom": {
    symbol: {
      symbolType: "circle",
      size: ["interpolate", ["exponential", 2.5], ["zoom"], 2, 1, 14, 32],
      color: "#240572",
      offset: [0, 0],
      opacity: 0.95
    }
  },
  "rotating-bars": {
    symbol: {
      symbolType: "square",
      rotation: ["*", ["time"], 0.1],
      size: [
        "array",
        4,
        ["interpolate", ["linear"], ["get", "population"], 20000, 4, 300000, 28]
      ],
      color: [
        "interpolate",
        ["linear"],
        ["get", "population"],
        20000,
        "#ffdc00",
        300000,
        "#ff5b19"
      ],
      offset: [
        "array",
        0,
        ["interpolate", ["linear"], ["get", "population"], 20000, 2, 300000, 14]
      ]
    }
  }
};

const map = new Map({
  layers: [
    new TileLayer({
      source: new OSM()
    })
  ],
  target: document.getElementById("map"),
  view: new View({
    center: [0, 0],
    zoom: 2
  })
});
map.on("click", function(evt) {
  var feature = map.getFeaturesAtPixel(evt.pixel)[0];
  if (feature) {
    console.log(feature);
  }
});

let literalStyle;
let pointsLayer;
function refreshLayer(newStyle) {
  const previousLayer = pointsLayer;
  pointsLayer = new WebGLPointsLayer({
    source: vectorSource,
    style: newStyle,
    disableHitDetection: false
  });
  map.addLayer(pointsLayer);

  if (previousLayer) {
    map.removeLayer(previousLayer);
    previousLayer.dispose();
  }
  literalStyle = newStyle;
}

const spanValid = document.getElementById("style-valid");
const spanInvalid = document.getElementById("style-invalid");
function setStyleStatus(errorMsg) {
  const isError = typeof errorMsg === "string";
  spanValid.style.display = errorMsg === null ? "initial" : "none";
  spanInvalid.firstElementChild.innerText = isError ? errorMsg : "";
  spanInvalid.style.display = isError ? "initial" : "none";
}

const editor = document.getElementById("style-editor");
editor.addEventListener("input", function() {
  const textStyle = editor.value;
  try {
    const newLiteralStyle = JSON.parse(textStyle);
    if (JSON.stringify(newLiteralStyle) !== JSON.stringify(literalStyle)) {
      refreshLayer(newLiteralStyle);
    }
    setStyleStatus(null);
  } catch (e) {
    setStyleStatus(e.message);
  }
});

const select = document.getElementById("style-select");
select.value = "circles";
function onSelectChange() {
  const style = select.value;
  const newLiteralStyle = predefinedStyles[style];
  editor.value = JSON.stringify(newLiteralStyle, null, 2);
  try {
    refreshLayer(newLiteralStyle);
    setStyleStatus();
  } catch (e) {
    setStyleStatus(e.message);
  }
}
onSelectChange();
select.addEventListener("change", onSelectChange);

// animate the map
function animate() {
  map.render();
  window.requestAnimationFrame(animate);
}
animate();
