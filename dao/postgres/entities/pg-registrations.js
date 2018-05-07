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
    return callback(utils.makeError(500, 'Not implemented'));
};

pgRegistrations.getByPoolAndNamespace = (poolId, namespace, offset, limit, callback) => {
    return callback(utils.makeError(500, 'Not implemented'));
};

pgRegistrations.upsert = (poolId, userId, userData, callback) => {
    return callback(utils.makeError(500, 'Not implemented'));
};

pgRegistrations.delete = (poolId, userId, callback) => {
    return callback(utils.makeError(500, 'Not implemented'));
};

// =================================================
// DAO implementation/internal methods
// =================================================

module.exports = pgRegistrations;
