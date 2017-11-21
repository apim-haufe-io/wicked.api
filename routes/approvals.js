'use strict';

var fs = require('fs');
var path = require('path');
var debug = require('debug')('portal-api:approvals');
var utils = require('./utils');
var users = require('./users');

var dao = require('../dao/dao');

var approvals = require('express').Router();

// ===== ENDPOINTS =====

approvals.get('/', function (req, res, next) {
    approvals.getApprovals(req.app, res, req.apiUserId);
});

// ===== IMPLEMENTATION =====

approvals.getApprovals = function (app, res, loggedInUserId) {
    debug('getApprovals()');
    if (!loggedInUserId)
        return utils.fail(res, 403, 'Not allowed');
    users.loadUser(app, loggedInUserId, (err, userInfo) => {
        if (err)
            return utils.fail(res, 500, 'getApprovals: loadUser failed', err);
        if (!userInfo)
            return utils.fail(res, 403, 'Not allowed');
        if (!userInfo.admin)
            return utils.fail(res, 403, 'Not allowed');

        dao.approvals.getAll((err, approvalInfos) => {
            if (err)
                return utils.fail(res, 500, 'getApprovals: DAO load approvals failed', err);
            res.json(approvalInfos);
        });
    });
};

module.exports = approvals;