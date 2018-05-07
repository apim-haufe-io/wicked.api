'use strict';

const { debug, info, warn, error } = require('portal-env').Logger('portal-api:dao:pg:subscriptions');

const utils = require('../../../routes/utils');
const daoUtils = require('../../dao-utils');
const pgUtils = require('../pg-utils');

const pgSubscriptions = () => { };

// =================================================
// DAO contract
// =================================================

pgSubscriptions.getByAppId = (appId, callback) => {
    debug(`getByAppId(${appId})`);
    pgUtils.checkCallback(callback);
    return getByAppIdImpl(appId, callback);
};

pgSubscriptions.getByClientId = (clientId, callback) => {
    debug(`getByClientId(${clientId})`);
    pgUtils.checkCallback(callback);
    return getByClientIdImpl(clientId, callback);
};

pgSubscriptions.getByAppAndApi = (appId, apiId, callback) => {
    debug(`getByAppAndApi(${appId}, ${apiId})`);
    pgUtils.checkCallback(callback);
    return getByAppAndApiImpl(appId, apiId, callback);
};

pgSubscriptions.getByApi = (apiId, offset, limit, callback) => {
    debug(`getByApi(${apiId}, offset: ${offset}, limit: ${limit})`);
    pgUtils.checkCallback(callback);
    return getByApiImpl(apiId, offset, limit, callback);
};

pgSubscriptions.create = (newSubscription, creatingUserId, callback) => {
    debug(`create(${newSubscription.id})`);
    pgUtils.checkCallback(callback);
    return createImpl(newSubscription, creatingUserId, callback);
};

pgSubscriptions.delete = (appId, apiId, subscriptionId, callback) => {
    debug(`delete(${appId}, ${apiId}, ${subscriptionId})`);
    // Note: appId and apiId aren't used for this DAO, as the subscription ID
    // is already unique.
    pgUtils.checkCallback(callback);
    return pgUtils.deleteById('subscriptions', subscriptionId, callback);
};

pgSubscriptions.patch = (appId, subsInfo, patchingUserId, callback) => {
    debug(`patch(${appId}, ${subsInfo.id})`);
    pgUtils.checkCallback(callback);
    return patchImpl(appId, subsInfo, patchingUserId, callback);
};

// Legacy functionality which is used in the initializer; it's not possible
// to take this out, but this does not have to be re-implemented for future
// DAOs (actually, MUST not)

pgSubscriptions.legacyWriteSubsIndex = (thisApp, subs) => { };
pgSubscriptions.legacySaveSubscriptionApiIndex = (apiId, subs) => { };

// =================================================
// DAO implementation/internal methods
// =================================================

function getByAppIdImpl(appId, callback) {
    debug('getByAppIdImpl()');
    pgUtils.getBy('subscriptions', ['applications_id'], [appId], (err, subsList) => {
        if (err)
            return callback(err);
        daoUtils.decryptApiCredentials(subsList);
        return callback(null, subsList);
    });
}

function getByApiImpl(apiId, offset, limit, callback) {
    debug('getByApiImpl()');
    pgUtils.getBy('subscriptions', ['api_id'], [apiId], { offset: offset, limit: limit }, (err, subsList) => {
        if (err)
            return callback(err);
        daoUtils.decryptApiCredentials(subsList);
        return callback(null, subsList);
    });
}

function returnSingleSubs(callback) {
    return function (err, subsInfo) {
        if (err)
            return callback(err);
        if (!subsInfo)
            return callback(null, null);
        daoUtils.decryptApiCredentials([subsInfo]);
        return callback(null, subsInfo);
    };
}

function getByClientIdImpl(clientId, callback) {
    debug('getByClientIdImpl()');
    pgUtils.getSingleBy(
        'subscriptions',
        'client_id',
        clientId, 
        returnSingleSubs(callback));
}

function getByAppAndApiImpl(appId, apiId, callback) {
    debug('getByAppAndApiImpl()');
    pgUtils.getSingleBy(
        'subscriptions',
        ['applications_id', 'api_id'],
        [appId, apiId],
        returnSingleSubs(callback));
}

function createImpl(newSubscription, creatingUserId, callback) {
    debug('createImpl()');
    daoUtils.encryptApiCredentials([newSubscription]);
    pgUtils.upsert('subscriptions', newSubscription, creatingUserId, (err) => {
        if (err)
            return callback(err);
        return callback(null, newSubscription);
    });
}

function patchImpl(appId, subsInfo, patchingUserId, callback) {
    debug('patchSync()');
    // This is actually just save...
    daoUtils.encryptApiCredentials([subsInfo]);
    pgUtils.upsert('subscriptions', subsInfo, patchingUserId, (err) => {
        if (err)
            return callback(err);
        return callback(null, subsInfo);
    });
}

module.exports = pgSubscriptions;
