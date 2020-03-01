/**
 * @module ol/source/WMTS
 */

import {expandUrl, createFromTileUrlFunctions, nullTileUrlFunction} from '../tileurlfunction.js';
import {find, findIndex, includes} from '../array.js';
import {containsExtent} from '../extent.js';
import {assign} from '../obj.js';
import {get as getProjection, equivalent, transformExtent} from '../proj.js';
import TileImage from './TileImage.js';
import WMTSRequestEncoding from './WMTSRequestEncoding.js';
import {createFromCapabilitiesMatrixSet} from '../tilegrid/WMTS.js';
import {appendParams} from '../uri.js';

/**
 * @typedef {Object} Options
 * @property {import("./Source.js").AttributionLike} [attributions] Attributions.
 * @property {number} [cacheSize] Tile cache size. The default depends on the screen size. Will be ignored if too small.
 * @property {null|string} [crossOrigin] The `crossOrigin` attribute for loaded images.  Note that
 * you must provide a `crossOrigin` value if you want to access pixel data with the Canvas renderer.
 * See https://developer.mozilla.org/en-US/docs/Web/HTML/CORS_enabled_image for more detail.
 * @property {import("../tilegrid/WMTS.js").default} tileGrid Tile grid.
 * @property {import("../proj.js").ProjectionLike} [projection] Projection. Default is the view projection.
 * @property {number} [reprojectionErrorThreshold=0.5] Maximum allowed reprojection error (in pixels).
 * Higher values can increase reprojection performance, but decrease precision.
 * @property {import("./WMTSRequestEncoding.js").default|string} [requestEncoding='KVP'] Request encoding.
 * @property {string} layer Layer name as advertised in the WMTS capabilities.
 * @property {string} style Style name as advertised in the WMTS capabilities.
 * @property {typeof import("../ImageTile.js").default} [tileClass]  Class used to instantiate image tiles. Default is {@link module:ol/ImageTile~ImageTile}.
 * @property {number} [tilePixelRatio=1] The pixel ratio used by the tile service.
 * For example, if the tile service advertizes 256px by 256px tiles but actually sends 512px
 * by 512px images (for retina/hidpi devices) then `tilePixelRatio`
 * should be set to `2`.
 * @property {string} [format='image/jpeg'] Image format. Only used when `requestEncoding` is `'KVP'`.
 * @property {string} [version='1.0.0'] WMTS version.
 * @property {string} matrixSet Matrix set.
 * @property {!Object} [dimensions] Additional "dimensions" for tile requests.
 * This is an object with properties named like the advertised WMTS dimensions.
 * @property {string} [url]  A URL for the service.
 * For the RESTful request encoding, this is a URL
 * template.  For KVP encoding, it is normal URL. A `{?-?}` template pattern,
 * for example `subdomain{a-f}.domain.com`, may be used instead of defining
 * each one separately in the `urls` option.
 * @property {import("../Tile.js").LoadFunction} [tileLoadFunction] Optional function to load a tile given a URL. The default is
 * ```js
 * function(imageTile, src) {
 *   imageTile.getImage().src = src;
 * };
 * ```
 * @property {Array<string>} [urls] An array of URLs.
 * Requests will be distributed among the URLs in this array.
 * @property {boolean} [wrapX=false] Whether to wrap the world horizontally.
 * @property {number} [transition] Duration of the opacity transition for rendering.
 * To disable the opacity transition, pass `transition: 0`.
 */


/**
 * @classdesc
 * Layer source for tile data from WMTS servers.
 * @api
 */
class WMTS extends TileImage {
  /**
   * @param {Options} options WMTS options.
   */
  constructor(options) {

    // TODO: add support for TileMatrixLimits

    const requestEncoding = options.requestEncoding !== undefined ?
      /** @type {import("./WMTSRequestEncoding.js").default} */ (options.requestEncoding) :
      WMTSRequestEncoding.KVP;

    // FIXME: should we create a default tileGrid?
    // we could issue a getCapabilities xhr to retrieve missing configuration
    const tileGrid = options.tileGrid;

    let urls = options.urls;
    if (urls === undefined && options.url !== undefined) {
      urls = expandUrl(options.url);
    }

    super({
      attributions: options.attributions,
      cacheSize: options.cacheSize,
      crossOrigin: options.crossOrigin,
      projection: options.projection,
      reprojectionErrorThreshold: options.reprojectionErrorThreshold,
      tileClass: options.tileClass,
      tileGrid: tileGrid,
      tileLoadFunction: options.tileLoadFunction,
      tilePixelRatio: options.tilePixelRatio,
      tileUrlFunction: nullTileUrlFunction,
      urls: urls,
      wrapX: options.wrapX !== undefined ? options.wrapX : false,
      transition: options.transition
    });

    /**
     * @private
     * @type {string}
     */
    this.version_ = options.version !== undefined ? options.version : '1.0.0';

    /**
     * @private
     * @type {string}
     */
    this.format_ = options.format !== undefined ? options.format : 'image/jpeg';

    /**
     * @private
     * @type {!Object}
     */
    this.dimensions_ = options.dimensions !== undefined ? options.dimensions : {};

    /**
     * @private
     * @type {string}
     */
    this.layer_ = options.layer;

    /**
     * @private
     * @type {string}
     */
    this.matrixSet_ = options.matrixSet;

    /**
     * @private
     * @type {string}
     */
    this.style_ = options.style;

    // FIXME: should we guess this requestEncoding from options.url(s)
    //        structure? that would mean KVP only if a template is not provided.

    /**
     * @private
     * @type {import("./WMTSRequestEncoding.js").default}
     */
    this.requestEncoding_ = requestEncoding;

    this.setKey(this.getKeyForDimensions_());

    if (urls && urls.length > 0) {
      this.tileUrlFunction = createFromTileUrlFunctions(urls.map(createFromWMTSTemplate.bind(this)));
    }

  }

  /**
   * Set the URLs to use for requests.
   * URLs may contain OGC conform URL Template Variables: {TileMatrix}, {TileRow}, {TileCol}.
   * @override
   */
  setUrls(urls) {
    this.urls = urls;
    const key = urls.join('\n');
    this.setTileUrlFunction(createFromTileUrlFunctions(urls.map(createFromWMTSTemplate.bind(this))), key);
  }

  /**
   * Get the dimensions, i.e. those passed to the constructor through the
   * "dimensions" option, and possibly updated using the updateDimensions
   * method.
   * @return {!Object} Dimensions.
   * @api
   */
  getDimensions() {
    return this.dimensions_;
  }


  /**
   * Return the image format of the WMTS source.
   * @return {string} Format.
   * @api
   */
  getFormat() {
    return this.format_;
  }


  /**
   * Return the layer of the WMTS source.
   * @return {string} Layer.
   * @api
   */
  getLayer() {
    return this.layer_;
  }


  /**
   * Return the matrix set of the WMTS source.
   * @return {string} MatrixSet.
   * @api
   */
  getMatrixSet() {
    return this.matrixSet_;
  }


  /**
   * Return the request encoding, either "KVP" or "REST".
   * @return {import("./WMTSRequestEncoding.js").default} Request encoding.
   * @api
   */
  getRequestEncoding() {
    return this.requestEncoding_;
  }


  /**
   * Return the style of the WMTS source.
   * @return {string} Style.
   * @api
   */
  getStyle() {
    return this.style_;
  }


  /**
   * Return the version of the WMTS source.
   * @return {string} Version.
   * @api
   */
  getVersion() {
    return this.version_;
  }


  /**
   * @private
   * @return {string} The key for the current dimensions.
   */
  getKeyForDimensions_() {
    let i = 0;
    const res = [];
    for (const key in this.dimensions_) {
      res[i++] = key + '-' + this.dimensions_[key];
    }
    return res.join('/');
  }


  /**
   * Update the dimensions.
   * @param {Object} dimensions Dimensions.
   * @api
   */
  updateDimensions(dimensions) {
    assign(this.dimensions_, dimensions);
    this.setKey(this.getKeyForDimensions_());
  }

}

export default WMTS;

/**
 * Generate source options from a capabilities object.
 * @param {Object} wmtsCap An object representing the capabilities document.
 * @param {!Object} config Configuration properties for the layer.  Defaults for
 *                  the layer will apply if not provided.
 *
 * Required config properties:
 *  - layer - {string} The layer identifier.
 *
 * Optional config properties:
 *  - matrixSet - {string} The matrix set identifier, required if there is
 *       more than one matrix set in the layer capabilities.
 *  - projection - {string} The desired CRS when no matrixSet is specified.
 *       eg: "EPSG:3857". If the desired projection is not available,
 *       an error is thrown.
 *  - requestEncoding - {string} url encoding format for the layer. Default is
 *       the first tile url format found in the GetCapabilities response.
 *  - style - {string} The name of the style
 *  - format - {string} Image format for the layer. Default is the first
 *       format returned in the GetCapabilities response.
 *  - crossOrigin - {string|null|undefined} Cross origin. Default is `undefined`.
 * @return {?Options} WMTS source options object or `null` if the layer was not found.
 * @api
 */
export function optionsFromCapabilities(wmtsCap, config) {
  const layers = wmtsCap['Contents']['Layer'];
  const l = find(layers, function(elt, index, array) {
    return elt['Identifier'] == config['layer'];
  });
  if (l === null) {
    return null;
  }
  const tileMatrixSets = wmtsCap['Contents']['TileMatrixSet'];
  let idx;
  if (l['TileMatrixSetLink'].length > 1) {
    if ('projection' in config) {
      idx = findIndex(l['TileMatrixSetLink'],
        function(elt, index, array) {
          const tileMatrixSet = find(tileMatrixSets, function(el) {
            return el['Identifier'] == elt['TileMatrixSet'];
          });
          const supportedCRS = tileMatrixSet['SupportedCRS'];
          const proj1 = getProjection(supportedCRS.replace(/urn:ogc:def:crs:(\w+):(.*:)?(\w+)$/, '$1:$3')) ||
                getProjection(supportedCRS);
          const proj2 = getProjection(config['projection']);
          if (proj1 && proj2) {
            return equivalent(proj1, proj2);
          } else {
            return supportedCRS == config['projection'];
          }
        });
    } else {
      idx = findIndex(l['TileMatrixSetLink'],
        function(elt, index, array) {
          return elt['TileMatrixSet'] == config['matrixSet'];
        });
    }
  } else {
    idx = 0;
  }
  if (idx < 0) {
    idx = 0;
  }
  const matrixSet = /** @type {string} */
    (l['TileMatrixSetLink'][idx]['TileMatrixSet']);
  const matrixLimits = /** @type {Array<Object>} */
    (l['TileMatrixSetLink'][idx]['TileMatrixSetLimits']);

  let format = /** @type {string} */ (l['Format'][0]);
  if ('format' in config) {
    format = config['format'];
  }
  idx = findIndex(l['Style'], function(elt, index, array) {
    if ('style' in config) {
      return elt['Title'] == config['style'];
    } else {
      return elt['isDefault'];
    }
  });
  if (idx < 0) {
    idx = 0;
  }
  const style = /** @type {string} */ (l['Style'][idx]['Identifier']);

  const dimensions = {};
  if ('Dimension' in l) {
    l['Dimension'].forEach(function(elt, index, array) {
      const key = elt['Identifier'];
      let value = elt['Default'];
      if (value === undefined) {
        value = elt['Value'][0];
      }
      dimensions[key] = value;
    });
  }

  const matrixSets = wmtsCap['Contents']['TileMatrixSet'];
  const matrixSetObj = find(matrixSets, function(elt, index, array) {
    return elt['Identifier'] == matrixSet;
  });

  let projection;
  const code = matrixSetObj['SupportedCRS'];
  if (code) {
    projection = getProjection(code.replace(/urn:ogc:def:crs:(\w+):(.*:)?(\w+)$/, '$1:$3')) ||
        getProjection(code);
  }
  if ('projection' in config) {
    const projConfig = getProjection(config['projection']);
    if (projConfig) {
      if (!projection || equivalent(projConfig, projection)) {
        projection = projConfig;
      }
    }
  }

  const wgs84BoundingBox = l['WGS84BoundingBox'];
  let extent, wrapX;
  if (wgs84BoundingBox !== undefined) {
    const wgs84ProjectionExtent = getProjection('EPSG:4326').getExtent();
    wrapX = (wgs84BoundingBox[0] == wgs84ProjectionExtent[0] &&
        wgs84BoundingBox[2] == wgs84ProjectionExtent[2]);
    extent = transformExtent(
      wgs84BoundingBox, 'EPSG:4326', projection);
    const projectionExtent = projection.getExtent();
    if (projectionExtent) {
      // If possible, do a sanity check on the extent - it should never be
      // bigger than the validity extent of the projection of a matrix set.
      if (!containsExtent(projectionExtent, extent)) {
        extent = undefined;
      }
    }
  }

  const tileGrid = createFromCapabilitiesMatrixSet(matrixSetObj, extent, matrixLimits);

  /** @type {!Array<string>} */
  const urls = [];
  let requestEncoding = config['requestEncoding'];
  requestEncoding = requestEncoding !== undefined ? requestEncoding : '';

  if ('OperationsMetadata' in wmtsCap && 'GetTile' in wmtsCap['OperationsMetadata']) {
    const gets = wmtsCap['OperationsMetadata']['GetTile']['DCP']['HTTP']['Get'];

    for (let i = 0, ii = gets.length; i < ii; ++i) {
      if (gets[i]['Constraint']) {
        const constraint = find(gets[i]['Constraint'], function(element) {
          return element['name'] == 'GetEncoding';
        });
        const encodings = constraint['AllowedValues']['Value'];

        if (requestEncoding === '') {
          // requestEncoding not provided, use the first encoding from the list
          requestEncoding = encodings[0];
        }
        if (requestEncoding === WMTSRequestEncoding.KVP) {
          if (includes(encodings, WMTSRequestEncoding.KVP)) {
            urls.push(/** @type {string} */ (gets[i]['href']));
          }
        } else {
          break;
        }
      } else if (gets[i]['href']) {
        requestEncoding = WMTSRequestEncoding.KVP;
        urls.push(/** @type {string} */ (gets[i]['href']));
      }
    }
  }
  if (urls.length === 0) {
    requestEncoding = WMTSRequestEncoding.REST;
    l['ResourceURL'].forEach(function(element) {
      if (element['resourceType'] === 'tile') {
        format = element['format'];
        urls.push(/** @type {string} */ (element['template']));
      }
    });
  }

  return {
    urls: urls,
    layer: config['layer'],
    matrixSet: matrixSet,
    format: format,
    projection: projection,
    requestEncoding: requestEncoding,
    tileGrid: tileGrid,
    style: style,
    dimensions: dimensions,
    wrapX: wrapX,
    crossOrigin: config['crossOrigin']
  };
}

/**
 * @param {string} template Template.
 * @return {import("../Tile.js").UrlFunction} Tile URL function.
 * @this {WMTS}
 */
function createFromWMTSTemplate(template) {
  const requestEncoding = this.requestEncoding_;

  // context property names are lower case to allow for a case insensitive
  // replacement as some services use different naming conventions
  const context = {
    'layer': this.layer_,
    'style': this.style_,
    'tilematrixset': this.matrixSet_
  };

  if (requestEncoding == WMTSRequestEncoding.KVP) {
    assign(context, {
      'Service': 'WMTS',
      'Request': 'GetTile',
      'Version': this.version_,
      'Format': this.format_
    });
  }

  // TODO: we may want to create our own appendParams function so that params
  // order conforms to wmts spec guidance, and so that we can avoid to escape
  // special template params

  template = (requestEncoding == WMTSRequestEncoding.KVP) ?
    appendParams(template, context) :
    template.replace(/\{(\w+?)\}/g, function(m, p) {
      return (p.toLowerCase() in context) ? context[p.toLowerCase()] : m;
    });

  const tileGrid = /** @type {import("../tilegrid/WMTS.js").default} */ (
    this.tileGrid);
  const dimensions = this.dimensions_;

  return (
    /**
     * @param {import("../tilecoord.js").TileCoord} tileCoord Tile coordinate.
     * @param {number} pixelRatio Pixel ratio.
     * @param {import("../proj/Projection.js").default} projection Projection.
     * @return {string|undefined} Tile URL.
     */
    function(tileCoord, pixelRatio, projection) {
      if (!tileCoord) {
        return undefined;
      } else {
        const localContext = {
          'TileMatrix': tileGrid.getMatrixId(tileCoord[0]),
          'TileCol': tileCoord[1],
          'TileRow': tileCoord[2]
        };
        assign(localContext, dimensions);
        let url = template;
        if (requestEncoding == WMTSRequestEncoding.KVP) {
          url = appendParams(url, localContext);
        } else {
          url = url.replace(/\{(\w+?)\}/g, function(m, p) {
            return localContext[p];
          });
        }
        return url;
      }
    }
  );
}
