'use strict';

var systemhealth = require('./systemhealth');
var users = require('./users');
var healthApi = require('express').Router();

// ===== MIDDLEWARE =====

healthApi.use(function (req, res, next) {
    if (!req.get('x-consumer-id'))
        return res.status(403).json({ message: 'Not Allowed.' });
    var customId = req.get('x-consumer-custom-id');
    if (customId) {
        var userInfo = users.loadUser(req.app, customId);
        if (userInfo)
            return res.status(404).json({ message: 'Not found.' });
    }
    next();
});

// ===== ENDPOINTS =====

healthApi.get('/systemhealth', function (req, res, next) {
    res.json(systemhealth.getSystemHealthInternal(req.app));
});

healthApi.get('/ping', function (req, res, next) {
    res.json({ message: 'OK' });
});

module.exports = healthApi;