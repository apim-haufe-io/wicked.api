'use strict';

var utils = require('./utils');
var debug = require('debug')('portal-api:kill');

var kill = require('express').Router();

// ===== MIDDLEWARE =====

kill.use(function (req, res, next) {
    if (!process.env.ALLOW_KILL) {
        return res.status(403).json({});
    }
    next();
});

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
