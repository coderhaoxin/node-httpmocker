
var url = require('url');
var http = require('http');
var https = require('https');
var stream = require('stream');
var util = require('util');

var originHttpRequest = http.request;
var originHttpsRequest = https.request;
var mockconfigSource = {};

util.inherits(OutgoingMessage, stream.Readable);
function OutgoingMessage () {
  if (!(this instanceof OutgoingMessage))
    return new OutgoingMessage();
  stream.Readable.call(this);
  http.OutgoingMessage.call(this);
}

//
// nothing
//
function noop () {}

//
// resolves option and then generate corresponding response object
//
function resolveResponse (options, callback) {
  var resp = new OutgoingMessage();
  resp.statusCode = 200;
  resp.headers = {};
  resp._read = noop;
  resp.write = noop;

  if ((options.port === 80 && options.protocol === 'http')
    || (options.port === 443 && options.protocol === 'https'))
    options.port = false;

  options.pathname = options.path;
  var requesturl = url.format(options);
  var configSource;
  for (var prefix in mockconfigSource) {
    if (requesturl.search(prefix) !== -1)
      configSource = mockconfigSource[prefix];
  }

  if (!configSource)
    return false;
  
  resp.setTimeout = function () {
    // For now, this function will never be called because of in test environment,
    // but TODO: support timeout in config
  };
  
  resp.end = function () {
    var err = configSource.error || null;
    configSource.statusCode = configSource.statusCode || configSource.status;
    if (configSource.statusCode)
      resp.statusCode = configSource.statusCode;
    if (configSource.headers)
      for (var key in configSource.headers)
        resp.headers[key] = configSource.headers[key];
    if (configSource.body) {
      var body = JSON.stringify(configSource.body);
      resp.push(body);
      resp.push(null);
      resp.headers['content-length'] = body.length;
    }

    if (typeof callback === 'function')
      callback(resp);
    if (err)
      resp.emit('error', err);
    else
      resp.emit('response', resp);
  };
  return resp;
}

//
// create request function for http/https
//
function requestor (type) {
  return function (options, callback) {
    var ret;
    options.protocol = type;
    if (process.env.NODE_ENV === 'test' 
      && (ret = resolveResponse(options, callback))) {
      return ret;
    } else if (type === 'https') {
      delete options.protocol;
      return originHttpsRequest.call(https, options, callback);
    } else {
      delete options.protocol;
      return originHttpRequest.call(http, options, callback);
    }
  }
}

// config mocks
function configMock (config) {
  if (config)
    for (var url in config)
      mockconfigSource[url] = config[url];
}

// clear configs
function clear (url) {
  if (url)
    delete mockconfigSource[url];
  else
    mockconfigSource = {};
}

// inject on http/https
http.request = requestor('http');
https.request = requestor('https');

// exports
exports.config = configMock;
exports.clear = clear;

