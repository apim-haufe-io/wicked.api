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
    pgUtils.checkCallback(callback);
    return getByUserApplicationAndApiImpl(userId, applicationId, apiId, callback);
};

pgGrants.getByUser = (userId, callback) => {
    debug(`getByUser(${userId})`);
    pgUtils.checkCallback(callback);
    return getByUserImpl(userId, callback);
};

pgGrants.deleteByUser = (userId, deletingUserId, callback) => {
    debug(`deleteByUser(${userId})`);
    pgUtils.checkCallback(callback);
    return deleteByUserImpl(userId, deletingUserId, callback);
};

pgGrants.upsert = (userId, applicationId, apiId, upsertingUserId, grantsInfo, callback) => {
    debug(`upsert(${userId}, ${applicationId}, ${apiId})`);
    pgUtils.checkCallback(callback);
    return upsertImpl(userId, applicationId, apiId, upsertingUserId, grantsInfo, callback);
};

pgGrants.delete = (userId, applicationId, apiId, deletingUserId, callback) => {
    debug(`delete(${userId}, ${applicationId}, ${apiId})`);
    pgUtils.checkCallback(callback);
    return deleteImpl(userId, applicationId, apiId, deletingUserId, callback);
};

// =================================================
// DAO implementation/internal methods
// =================================================

function getByUserApplicationAndApiImpl(userId, applicationId, apiId, callback) {
    debug(`getByUserApplicationAndApiImpl(${userId}, ${applicationId}, ${apiId})`);
    pgUtils.getSingleBy('grants', ['userId', 'applicationId', 'apiId'], [userId, applicationId, apiId], (err, data) => {
        if (err)
            return callback(err);
        if (!data)
            return callback(utils.makeError(404, `User ${userId} does not have a grants record for API ${apiId} for application ${applicationId}`));
        return callback(null, data);
    });
}

function getByUserImpl(userId, callback) {
    debug(`getByUserImpl(${userId})`);
    const options = {
        orderBy: 'applicationId ASC'
    };
    pgUtils.getBy('grants', 'userId', userId, options, callback);
}

function deleteByUserImpl(userId, deletingUserId, callback) {
    debug(`deleteByUserImpl(${userId})`);
    pgUtils.deleteBy('grants', 'userId', userId, callback);
}

function upsertImpl(userId, applicationId, apiId, upsertingUserId, grantsInfo, callback) {
    debug(`upsertImpl(${userId}, ${applicationId}, ${apiId})`);

    // getSingleBy returns either exactly one record, or null (if there is no matching record)
    pgUtils.getSingleBy('grants', ['userId', 'applicationId', 'apiId'], [userId, applicationId, apiId], (err, prevGrants) => {
        if (err)
            return callback(err);
        let nextGrants = {
            userId: userId,
            applicationId: applicationId,
            apiId: apiId,
            grants: grantsInfo.grants
        };
        if (prevGrants) {
            nextGrants.id = prevGrants.id;
        } else {
            nextGrants.id = utils.createRandomId();
        }
        daoUtils.mergeGrantData(prevGrants, nextGrants);

        return pgUtils.upsert('grants', nextGrants, upsertingUserId, callback);
    });
}

function deleteImpl(userId, applicationId, apiId, deletingUserId, callback) {
    debug(`deleteImpl(${userId}, ${applicationId}, ${apiId})`);
    getByUserApplicationAndApiImpl(userId, applicationId, apiId, (err, data) => {
        if (err) // This can be a 404 for example
            return callback(err);
        pgUtils.deleteBy('grants', ['userId', 'applicationId', 'apiId'], [userId, applicationId, apiId], callback);
    });
}


module.exports = pgGrants;
