'use strict';

const utils = require('./utils');
const users = require('./users');

const { debug, info, warn, error } = require('portal-env').Logger('portal-api:kill');
const kill = require('express').Router();

const verifyKillScope = utils.verifyScope('restart_api');

// ===== ENDPOINTS =====

kill.post('/', verifyKillScope, function (req, res, next) {
    kill.killApi(req.app, res, req.apiUserId);
});

// ===== IMPLEMENTATION =====

kill.killApi = function (app, res, loggedInUserId) {
    debug('killApi()');
    users.loadUser(app, loggedInUserId, (err, userInfo) => {
        if (err)
            return utils.fail(res, 500, 'getApplications: Could not load user.', err);
        if (!userInfo)
            return utils.fail(res, 403, 'Not allowed.');
        if (!userInfo.admin && !userInfo.approver)
            return utils.fail(res, 403, 'Not allowed. This is admin land.');
        res.status(204).json({});
        setTimeout(function() {
            process.exit(0);
        }, 1000);
    });
};

module.exports = kill;
