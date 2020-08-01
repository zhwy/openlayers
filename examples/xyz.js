import Map from '../src/ol/Map.js';
import TileLayer from '../src/ol/layer/Tile.js';
import View from '../src/ol/View.js';
import XYZ from '../src/ol/source/XYZ.js';

const map = new Map({
  target: 'map',
  layers: [
    new TileLayer({
      source: new XYZ({
        // url: 'https://{a-c}.tile.thunderforest.com/cycle/{z}/{x}/{y}.png' +
        //   '?apikey=0e6fc415256d4fbb9b5166a718591d71',
        url: 'https://api.mapbox.com/styles/v1/mmxqanny/cjcfiuux653bj2rr48yk6hs7g/tiles/256/{z}/{x}/{y}?access_token=pk.eyJ1IjoibW14cWFubnkiLCJhIjoiY2pjZmlzNXp3MWJqaDMzdDUxdXMweG15eCJ9.Onu8fH96QnXhOJmqh0bZZA'
      })
    })
  ],
  view: new View({
    center: [-472202, 7530279],
    zoom: 12,
  }),
});
