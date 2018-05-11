'use strict';

const { debug, info, warn, error } = require('portal-env').Logger('portal-api:dao:pg:grants');

const utils = require('../../../routes/utils');
const daoUtils = require('../../dao-utils');
const pgUtils = require('../pg-utils');

const pgGrants = () => { };

// =================================================
// DAO contract
// =================================================

pgGrants.getByUserApplicationAndApi = (userId, applicationId, apiId, callback) => {
    debug(`getByUserApplicationAndApi(${userId}, ${applicationId}, ${apiId})`);
    return callback(utils.makeError(500, 'Not implemented'));
};

pgGrants.getByUser = (userId, offset, limit, callback) => {
    debug(`getByUser(${userId}, ${offset}, ${limit})`);
    return callback(utils.makeError(500, 'Not implemented'));
};

pgGrants.upsert = (userId, applicationId, apiId, callback) => {
    debug(`upsert(${userId}, ${applicationId}, ${apiId})`);
    return callback(utils.makeError(500, 'Not implemented'));
};

pgGrants.delete = (userId, applicationId, apiId, callback) => {
    debug(`delete(${userId}, ${applicationId}, ${apiId})`);
    return callback(utils.makeError(500, 'Not implemented'));
};

// =================================================
// DAO implementation/internal methods
// =================================================

module.exports = pgGrants;
