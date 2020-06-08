import olms from 'ol-mapbox-style';
import Map from '../src/ol/Map.js';
import View from "../src/ol/View.js";
import MVT from '../src/ol/format/MVT.js';
import VectorTileSource from '../src/ol/source/VectorTile.js';
import TileGrid from '../src/ol/tilegrid/TileGrid.js';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import TileDebug from "../src/ol/source/TileDebug.js";
import * as olProj from 'ol/proj';
import { defaultResolutions } from 'ol-mapbox-style/dist/util.js';

// original example
// apply('map', 'https://api.maptiler.com/maps/topo/style.json?key=get_your_own_D6rA4zTHduk6KOKTXzGB');

const maxResolution = 360 / 512;
defaultResolutions.length = 14;
for (let i = 0; i < 14; ++i) {
    defaultResolutions[i] = maxResolution / Math.pow(2, i + 1);
}
var tileGrid = new TileGrid({
    extent: [-180, -90, 180, 90],
    tileSize: 512,
    resolutions: defaultResolutions
})
var map = new Map({
    target: 'map',
    view: new View({
        // center: olProj.fromLonLat([121.459, 31.224]),
        center: [121.459, 31.224],
        projection: 'EPSG:4326',
        zoom: 11,
    }),
    layers: [
        // new TileLayer({
        //     source: new XYZ({
        //         url: "https://api.mapbox.com/styles/v1/mmxqanny/ckal5kq4p0zuf1io5g1l1dxt1/tiles/512/{z}/{x}/{y}?access_token=pk.eyJ1IjoibW14cWFubnkiLCJhIjoiY2pjZmlzNXp3MWJqaDMzdDUxdXMweG15eCJ9.Onu8fH96QnXhOJmqh0bZZA",
        //         projection: 'EPSG:3857',
        //         tileSize: 512,
        //         wrapX: true
        //     })
        // }),
        // new TileLayer({
        //     source: new TileDebug({
        //         projection: 'EPSG:3857',
        //         tileSize: 512,
        //         // tileGrid: tileGrid
        //     })
        // })
    ]
})
window.olmap = map;
// "http://localhost:8080/examples/data/Styles/maptiler/tiles.json"
var url = "http://localhost:8080/examples/data/Styles/maptiler/style.json?key=kogVsxHoUhaRdgNalRJo";
// var url = 'http://localhost:8080/examples/data/Styles/style.json?access_token=pk.eyJ1IjoibW14cWFubnkiLCJhIjoiY2pjZmlzNXp3MWJqaDMzdDUxdXMweG15eCJ9.Onu8fH96QnXhOJmqh0bZZA'
olms(map, url).then(map => {
    const mapboxStyle = map.get('mapbox-style');
    map.getLayers().forEach(function (layer) {
        const mapboxSource = layer.get('mapbox-source');
        if (mapboxSource && mapboxStyle.sources[mapboxSource].type === 'vector') {
            const source = layer.getSource();
            layer.setOpacity(0.5)
            layer.setSource(new VectorTileSource({
                format: new MVT(),
                projection: 'EPSG:4326',
                tileGrid: tileGrid,
                urls: source.getUrls()
            }));

        }
    })
})
//apply('map', 'https://api.mapbox.com/v4/mapbox.mapbox-streets-v7,mapbox.mapbox-terrain-v2.json?secure&access_token=pk.eyJ1IjoibW14cWFubnkiLCJhIjoiY2pjZmlzNXp3MWJqaDMzdDUxdXMweG15eCJ9.Onu8fH96QnXhOJmqh0bZZA')
// apply('map', 'https://api.mapbox.cn/v4/mapbox.china-streets-v1,mapbox.mapbox-streets-v7.json?secure&access_token=pk.eyJ1IjoibmF0aGFuODkxMSIsImEiOiJjamh2aWwyZGMwemphM2pwYXdrNnM5YzllIn0.cMSTMVcdiefqYkZ9X6IClA')