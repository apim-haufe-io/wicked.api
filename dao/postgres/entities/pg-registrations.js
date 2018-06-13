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

pgRegistrations.getByPoolAndNamespace = (poolId, namespace, nameFilter, offset, limit, noCountCache, callback) => {
    debug(`getByPoolAndNamespace(${poolId}, ${namespace}, ${nameFilter}, ${offset}, ${limit})`);
    pgUtils.checkCallback(callback);
    return getByPoolAndNamespaceImpl(poolId, namespace, nameFilter, offset, limit, noCountCache, callback);
};

pgRegistrations.getByUser = (userId, callback) => {
    debug(`getByUser(${userId})`);
    pgUtils.checkCallback(callback);
    return getByUserImpl(userId, callback);
};

pgRegistrations.upsert = (poolId, userId, upsertingUserId, userData, callback) => {
    debug(`upsert(${poolId}, ${userId}, ${userData})`);
    pgUtils.checkCallback(callback);
    return upsertImpl(poolId, userId, upsertingUserId, userData, callback);
};

pgRegistrations.delete = (poolId, userId, deletingUserId, callback) => {
    debug(`delete(${poolId}, ${userId})`);
    pgUtils.checkCallback(callback);
    return deleteImpl(poolId, userId, deletingUserId, callback);
};

// =================================================
// DAO implementation/internal methods
// =================================================

function getByPoolAndUserImpl(poolId, userId, callback) {
    debug(`getByPoolAndUserImpl(${poolId}, ${userId})`);
    pgUtils.getSingleBy('registrations', ['pool_id', 'users_id'], [poolId, userId], (err, data) => {
        if (err)
            return callback(err);
        if (!data) {
            warn(`Registration record for user ${userId} in pool ${poolId} not found.`);
            return callback(utils.makeError(404, 'Registration not found'));
        }
        return callback(null, data);
    });
}

function getByPoolAndNamespaceImpl(poolId, namespace, nameFilter, offset, limit, noCountCache, callback) {
    debug(`getByPoolAndNamespaceImpl(${poolId}, ${namespace}, ${nameFilter}, ${offset}, ${limit}, ${noCountCache})`);
    const options = {
        limit: limit,
        offset: offset,
        orderBy: 'name ASC',
        noCountCache: noCountCache
    };
    if (namespace && nameFilter) {
        options.operators = ['=', '=', 'ILIKE'];
        return pgUtils.getBy('registrations', ['pool_id', 'namespace', 'name'], [poolId, namespace, `%${nameFilter}%`], options, callback);
    } else if (!namespace && nameFilter) {
        options.operators = ['=', 'ILIKE'];
        return pgUtils.getBy('registrations', ['pool_id', 'name'], [poolId, `%${nameFilter}%`], options, callback);
    } else if (namespace && !nameFilter) {
        return pgUtils.getBy('registrations', ['pool_id', 'namespace'], [poolId, namespace], options, callback);
    }
    // Neither nameFilter nor namespace filter
    return pgUtils.getBy('registrations', 'pool_id', poolId, options, callback);
}

function getByUserImpl(userId, callback) {
    debug(`getByUserImpl(${userId})`);
    return pgUtils.getBy('registrations', 'users_id', userId, {
        orderBy: 'pool_id ASC'
    }, (err, data, countResult) => {
        if (err)
            return callback(err);
        const tmp = {
            pools: {}
        };
        data.forEach(r => tmp.pools[r.poolId] = r);
        return callback(null, tmp, countResult);
    });
}

function upsertImpl(poolId, userId, upsertingUserId, userData, callback) {
    debug(`upsertImpl(${poolId}, ${userId}, ${userData})`);
    pgUtils.getBy('registrations', ['pool_id', 'users_id'], [poolId, userId], {}, (err, data) => {
        if (err)
            return callback(err);
        if (data.length > 1)
            return callback(utils.makeError(500, `More than one entry in registrations for pool ${poolId} and user ${userId}`));
        // Add the id of the previous record; it's needed here
        if (data.length === 1)
            userData.id = data[0].id;
        else // new record
            userData.id = utils.createRandomId();
        return pgUtils.upsert('registrations', userData, upsertingUserId, callback);
    });
}

function deleteImpl(poolId, userId, deletingUserId, callback) {
    debug(`deleteImpl(${poolId}, ${userId})`);
    return pgUtils.deleteBy('registrations', ['pool_id', 'users_id'], [poolId, userId], callback);
}

module.exports = pgRegistrations;
