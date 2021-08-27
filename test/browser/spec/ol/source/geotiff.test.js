import GeoTIFFSource from '../../../../../src/ol/source/GeoTIFF.js';
import State from '../../../../../src/ol/source/State.js';
import TileState from '../../../../../src/ol/TileState.js';

describe('ol.source.GeoTIFF', function () {
  /** @type {GeoTIFFSource} */
  let source;
  beforeEach(function () {
    source = new GeoTIFFSource({
      sources: [
        {
          url: 'spec/ol/source/images/0-0-0.tif',
        },
      ],
    });
  });

  it('manages load states', function (done) {
    expect(source.getState()).to.be(State.LOADING);
    source.on('change', () => {
      expect(source.getState()).to.be(State.READY);
      done();
    });
  });

  it('configures itself from source metadata', function (done) {
    source.on('change', () => {
      expect(source.addAlpha_).to.be(true);
      expect(source.bandCount).to.be(4);
      expect(source.nodataValues_).to.eql([[0]]);
      expect(source.getTileGrid().getResolutions().length).to.be(1);
      expect(source.projection.getCode()).to.be('EPSG:4326');
      done();
    });
  });

  it('loads tiles', function (done) {
    source.on('change', () => {
      const tile = source.getTile(0, 0, 0);
      source.on('tileloadend', () => {
        expect(tile.getState()).to.be(TileState.LOADED);
        done();
      });
      tile.load();
    });
  });
});
