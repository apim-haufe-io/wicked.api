'use strict';

const { debug, info, warn, error } = require('portal-env').Logger('portal-api:dao:pg:registrations');

const utils = require('../../../routes/utils');
const daoUtils = require('../../dao-utils');
const pgUtils = require('../pg-utils');

const pgRegistrations = () => { };

// =================================================
// DAO contract
// =================================================

pgRegistrations.getByPoolAndUser = (poolId, userId, callback) => {
    debug(`getByPoolAndUser(${poolId}, ${userId})`);
    pgUtils.checkCallback(callback);
    return getByPoolAndUserImpl(poolId, userId, callback);
};

pgRegistrations.getByPoolAndNamespace = (poolId, namespace, nameFilter, offset, limit, callback) => {
    debug(`getByPoolAndNamespace(${poolId}, ${namespace}, ${nameFilter}, ${offset}, ${limit})`);
    pgUtils.checkCallback(callback);
    return getByPoolAndNamespaceImpl(poolId, namespace, nameFilter, offset, limit, callback);
};

pgRegistrations.getByUser = (userId, offset, limit, callback) => {
    debug(`getByUser(${userId}, ${offset}, ${limit})`);
    pgUtils.checkCallback(callback);
    return getByUserImpl(userId, offset, limit, callback);
};

pgRegistrations.upsert = (poolId, userId, userData, callback) => {
    debug(`upsert(${poolId}, ${userId}, ${userData})`);
    pgUtils.checkCallback(callback);
    return upsertImpl(poolId, userId, userData, callback);
};

pgRegistrations.delete = (poolId, userId, callback) => {
    debug(`delete(${poolId}, ${userId})`);
    pgUtils.checkCallback(callback);
    return deleteImpl(poolId, userId, callback);
};

// =================================================
// DAO implementation/internal methods
// =================================================

function getByPoolAndUserImpl(poolId, userId, callback) {
    debug(`getByPoolAndUserImpl(${poolId}, ${userId})`);
    return callback(utils.makeError(500, 'Not implemented'));
}

function getByPoolAndNamespaceImpl(poolId, namespace, nameFilter, offset, limit, callback) {
    debug(`getByPoolAndNamespaceImpl(${poolId}, ${namespace}, ${nameFilter}, ${offset}, ${limit})`);
    return callback(utils.makeError(500, 'Not implemented'));
}

function getByUserImpl(userId, offset, limit, callback) {
    debug(`getByUserImpl(${userId}, ${offset}, ${limit})`);
    return callback(utils.makeError(500, 'Not implemented'));
}

function upsertImpl(poolId, userId, userData, callback) {
    debug(`upsertImpl(${poolId}, ${userId}, ${userData})`);
    return callback(utils.makeError(500, 'Not implemented'));
}

function deleteImpl(poolId, userId, callback) {
    debug(`deleteImpl(${poolId}, ${userId})`);
    return callback(utils.makeError(500, 'Not implemented'));
}

module.exports = pgRegistrations;
