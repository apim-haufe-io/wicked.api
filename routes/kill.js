'use strict';

var utils = require('./utils');
var debug = require('debug')('portal-api:kill');
var authMiddleware = require('../auth-middleware');

var kill = require('express').Router();

// ===== MIDDLEWARE =====

// All /deploy end points need an "Authorization" header which has to contain the deployment
// key which is used for decrypting/encrypting env variables and such.
// This may change in the future.
kill.use(authMiddleware.verifyConfigKey);

// ===== ENDPOINTS =====

kill.post('/', function (req, res, next) {
    kill.killApi(req.app, res);
});

// ===== IMPLEMENTATION =====

kill.killApi = function (app, res) {
    debug('killApi()');
    res.status(204).json({});
    setTimeout(function() {
        process.exit(0);
    }, 1000);
};

module.exports = kill;
