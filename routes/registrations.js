'use strict';

const utils = require('./utils');
const { debug, info, warn, error } = require('portal-env').Logger('portal-api:verifications');
const dao = require('../dao/dao');

const webhooks = require('./webhooks');
const users = require('./users');

const registrations = require('express').Router();

// ===== ENDPOINTS =====

registrations.get('/pools/:poolId', function (req, res, next) {
    // These may be undefined
    const namespace = req.query.namespace;
    const nameFilter = req.query.name_filter;
    const { offset, limit } = utils.getOffsetLimit(req);
    registrations.getByPoolAndNamespace(req.app, res, req.apiUserId, req.params.poolId, namespace, nameFilter, offset, limit);
});

registrations.get('/pools/:poolId/users/:userId', function (req, res, next) {
    registrations.getByPoolAndUser(req.app, res, req.apiUserId, req.params.poolId, req.params.userId);
});

registrations.put('/pools/:poolId/users/:userId', function (req, res, next) {
    registrations.upsert(req.app, res, req.apiUserId, req.params.poolId, req.params.userId, req.body);
});

registrations.delete('/pools/:poolId/users/:userId', function (req, res, next) {
    registrations.delete(req.app, res, req.apiUserId, req.params.poolId, req.params.userId);
});

registrations.get('/users/:userId', function (req, res, next) {
    const { offset, limit } = utils.getOffsetLimit(req);
    registrations.getByUser(req.app, res, req.apiUserId, req.params.userId, offset, limit);
});

// ===== IMPLEMENTATION =====

function verifyAccess(app, loggedInUserId, userId, onlyAdmin, callback) {
    debug(`verifyAccess(${loggedInUserId}, ${userId}, ${onlyAdmin})`);
    if (!loggedInUserId)
        return callback(utils.makeError(403, 'Registrations: Must be making call on behalf of a user (must be logged in).'));
    users.loadUser(app, loggedInUserId, (err, loggedInUserInfo) => {
        if (err)
            return callback(utils.makeError(500, 'Registrations: Could not load user.', err));
        if (!loggedInUserInfo)
            return callback(utils.makeError(403, 'Registrations: Not allowed.'));
        // Admins are allowed access
        if (!loggedInUserInfo.admin) {
            // We have a non-admin here
            if (onlyAdmin)
                return callback(utils.makeError(403, 'Registrations: Not allowed. This is admin land.'));
            if (!userId)
                return callback(utils.makeError(500, 'Registrations: Invalid state - need user reference if not user is admin'));
            // Logged in user, and checking data for a user - they have to match
            if (loggedInUserId !== userId)
                return callback(utils.makeError(403, 'Registrations: Not allowed (user mismatch).'));
        }
        // Looks fine so far, do we have a user context? If so, that user
        // also has to exist for this to make sense.
        if (!userId) // No, then we're already OK!
            return callback(null);
        users.loadUser(app, userId, (err, userInfo) => {
            if (err)
                return callback(utils.makeError(500, 'Registrations: Could not load context user', err));
            if (!userInfo)
                return callback(utils.makeError(404, 'Registration: Context user not found.'));
            // OK, user exists, we'll be fine
            return callback(null);
        });
    });
}

registrations.getByPoolAndNamespace = (app, res, loggedInUserId, poolId, namespace, nameFilter, offset, limit) => {
    debug(`getByPoolAndNamespace(${poolId}, ${namespace}, ${nameFilter})`);

    if (!isPoolIdValid(poolId))
        return utils.fail(res, 400, validationErrorMessage('Pool ID'));
    if (!isNamespaceValid(namespace))
        return utils.fail(res, 400, validationErrorMessage('Namespace'));

    verifyAccess(app, loggedInUserId, null, true, (err) => {
        if (err)
            return utils.failError(res, err);

        dao.registrations.getByPoolAndNamespace(poolId, namespace, nameFilter, offset, limit, (err, regList) => {
            if (err)
                return utils.fail(res, 500, 'Registrations: Could not retrieve registrations by pool/namespace.', err);
            // TODO: _links for paging?
            return res.json({
                items: regList
            });
        });
    });
};

registrations.getByPoolAndUser = (app, res, loggedInUserId, poolId, userId) => {
    debug(`getByPoolAndUser(${poolId}, ${userId})`);

    if (!isPoolIdValid(poolId))
        return utils.fail(res, 400, validationErrorMessage('Pool ID'));

    verifyAccess(app, loggedInUserId, userId, false, (err) => {
        if (err)
            return utils.failError(res, err);

        dao.registrations.getByPoolAndUser(poolId, userId, (err, reg) => {
            if (err)
                return utils.fail(res, 500, `Registrations: Could not retrieve registration for user ${userId} and pool ${poolId}.`);
            return res.json(reg);
        });
    });
};

registrations.getByUser = (app, res, loggedInUserId, userId, offset, limit) => {
    debug(`getByUser(${userId})`);

    verifyAccess(app, loggedInUserId, userId, false, (err) => {
        if (err)
            return utils.failError(res, err);

        dao.registrations.getByUser(userId, offset, limit, (err, regMap) => {
            if (err)
                return utils.fail(res, 500, 'Registrations: Could not retrieve registrations for user.', err);
            // TODO: _links for paging?
            return res.json(regMap);
        });
    });
};

const validationRegex = /^[a-z0-9_-]+$/;
function isNamespaceValid(namespace) {
    // Empty or null namespaces are valid
    if (!namespace)
        return true;
    if (namespace.match(validationRegex))
        return true;
    return false;
}

function isPoolIdValid(poolId) {
    if (!poolId)
        return false;
    if (poolId.match(validationRegex))
        return true;
    return false;
}

function validationErrorMessage(entity) {
    return `Registrations: ${entity} is invalid, must contain a-z, 0-9, _ and - only.`;
}

registrations.upsert = (app, res, loggedInUserId, poolId, userId, reg) => {
    debug(`upsert(${poolId}, ${userId})`);

    if (!reg)
        return utils.fail(res, 400, 'Missing request body');
    if (!isPoolIdValid(poolId))
        return utils.fail(res, 400, validationErrorMessage('Pool ID'));
    if (!isNamespaceValid(reg.namespace))
        return utils.fail(res, 400, validationErrorMessage('Namespace'));

    verifyAccess(app, loggedInUserId, userId, false, (err) => {
        if (err)
            return utils.failError(res, err);

        if (!reg.name)
            return utils.fail(res, 400, 'Registrations: Must contain a "name" property.');

        dao.registrations.upsert(poolId, userId, reg, (err) => {
            if (err)
                return utils.fail(res, 500, 'Registrations: Failed to upsert.', err);

            res.status(204).json({ code: 204, message: 'Upserted registration.' });
        });
    });
};

registrations.delete = (app, res, loggedInUserId, poolId, userId) => {
    debug(`upsert(${poolId}, ${userId})`);

    if (!isPoolIdValid(poolId))
        return utils.fail(res, 400, validationErrorMessage('Pool ID'));

    verifyAccess(app, loggedInUserId, userId, false, (err) => {
        if (err)
            return utils.failError(res, err);

        dao.registrations.delete(poolId, userId, (err) => {
            if (err)
                return utils.fail(res, 500, 'Registrations: Could not delete registration.', err);

            return res.status(204).json({ code: 204, message: 'Deleted' });
        });
    });
};

module.exports = registrations;
