'use strict';

const debug = require('debug')('portal-api:dao:json:subscriptions');
const fs = require('fs');
const path = require('path');

const utils = require('../../../routes/utils');
const daoUtils = require('../../dao-utils');
const jsonUtils = require('./json-utils');
// const jsonUsers = require('./json-users');
const jsonApprovals = require('./json-approvals');

const jsonSubscriptions = function () { };

// =================================================
// DAO contract
// =================================================

jsonSubscriptions.getByAppId = (appId, callback) => {
    debug('getById()');
    jsonUtils.checkCallback(callback);
    try {
        const subs = jsonSubscriptions.loadSubscriptions(appId);
        return callback(null, subs);
    } catch (err) {
        return callback(err);
    }
};

jsonSubscriptions.getByClientId = (clientId, callback) => {
    debug('getByClientId()');
    jsonUtils.checkCallback(callback);
    try {
        const subsInfo = jsonSubscriptions.getByClientIdSync(clientId);
        return callback(null, subsInfo);
    } catch (err) {
        return callback(err);
    }
};

jsonSubscriptions.getByAppAndApi = (appId, apiId, callback) => {
    debug('getByAppAndApi()');
    jsonUtils.checkCallback(callback);
    try {
        const subsInfo = jsonSubscriptions.getByAppAndApiSync(appId, apiId);
        return callback(null, subsInfo);
    } catch (err) {
        return callback(err);
    }
};

jsonSubscriptions.getByApi = (apiId, offset, limit, callback) => {
    debug('getByApi()');
    jsonUtils.checkCallback(callback);
    try {
        const apiSubs = jsonSubscriptions.getByApiSync(apiId, offset, limit);
        return callback(null, apiSubs);
    } catch (err) {
        return callback(err);
    }
};

jsonSubscriptions.create = (newSubscription, creatingUserId, callback) => {
    debug('create()');
    jsonUtils.checkCallback(callback);
    try {
        const subsInfo = jsonSubscriptions.createSync(newSubscription, creatingUserId);
        return callback(null, subsInfo);
    } catch (err) {
        return callback(err);
    }
};

jsonSubscriptions.delete = (appId, apiId, subscriptionId, callback) => {
    debug('delete()');
    jsonUtils.checkCallback(callback);
    try {
        jsonSubscriptions.deleteSync(appId, apiId, subscriptionId);
        return callback(null);
    } catch (err) {
        return callback(err);
    }
};

jsonSubscriptions.patch = (appId, subsInfo, patchingUserId, callback) => {
    debug('patch()');
    jsonUtils.checkCallback(callback);
    try {
        const updatedSubs = jsonSubscriptions.patchSync(appId, subsInfo, patchingUserId);
        return callback(null, updatedSubs);
    } catch (err) {
        return callback(null);
    }
};

// Legacy functionality which is used in the initializer; it's not possible
// to take this out, but this does not have to be re-implemented for future
// DAOs (actually, MUST not)

jsonSubscriptions.legacyWriteSubsIndex = (thisApp, subs) => {
    const subsIndexDir = jsonSubscriptions.getSubsIndexDir();
    for (let i = 0; i < subs.length; ++i) {
        const thisSub = subs[i];
        // Write subs index by client ID
        if (!thisSub.clientId)
            continue;
        const clientId = thisSub.clientId;
        const fileName = path.join(subsIndexDir, clientId + '.json');
        fs.writeFileSync(fileName, JSON.stringify({
            application: thisSub.application,
            api: thisSub.api
        }, null, 2), 'utf8');
    }
};

jsonSubscriptions.legacySaveSubscriptionApiIndex = (apiId, subs) => {
    jsonSubscriptions.saveSubscriptionApiIndex(apiId, subs);
};

// =================================================
// DAO implementation/internal methods
// =================================================

jsonSubscriptions.getSubsDir = function () {
    return path.join(utils.getDynamicDir(), 'subscriptions');
};

jsonSubscriptions.getSubsIndexDir = function () {
    return path.join(utils.getDynamicDir(), 'subscription_index');
};

jsonSubscriptions.getSubsApiIndexDir = function () {
    return path.join(utils.getDynamicDir(), 'subscription_api_index');
};

jsonSubscriptions.loadSubscriptions = function (appId) {
    debug('loadSubscriptions(): ' + appId);
    const subsDir = jsonSubscriptions.getSubsDir();
    const subsFileName = path.join(subsDir, appId + '.subs.json');
    const subs = JSON.parse(fs.readFileSync(subsFileName, 'utf8'));
    daoUtils.decryptApiCredentials(subs);
    return subs;
};

jsonSubscriptions.saveSubscriptions = function (appId, subsList) {
    debug('saveSubscriptions(): ' + appId);
    debug(subsList);

    const subsDir = jsonSubscriptions.getSubsDir();
    const subsFileName = path.join(subsDir, appId + '.subs.json');
    daoUtils.encryptApiCredentials(subsList);
    fs.writeFileSync(subsFileName, JSON.stringify(subsList, null, 2), 'utf8');
};

jsonSubscriptions.loadSubscriptionIndexEntry = function (clientId) {
    debug('loadSubscriptionIndexEntry()');
    const indexDir = jsonSubscriptions.getSubsIndexDir();
    const fileName = path.join(indexDir, clientId + '.json');
    debug('Trying to load ' + fileName);
    if (!fs.existsSync(fileName))
        return null;
    return JSON.parse(fs.readFileSync(fileName, 'utf8'));
};

jsonSubscriptions.saveSubscriptionIndexEntry = function (clientId, subsInfo) {
    debug('saveSubscriptionIndexEntry()');
    const indexDir = jsonSubscriptions.getSubsIndexDir();
    const fileName = path.join(indexDir, clientId + '.json');
    const data = {
        application: subsInfo.application,
        api: subsInfo.api
    };
    debug('Writing to ' + fileName);
    debug(data);
    fs.writeFileSync(fileName, JSON.stringify(data, null, 2), 'utf8');
};

jsonSubscriptions.deleteSubscriptionIndexEntry = function (clientId) {
    debug('loadSubscriptionIndexEntry()');
    const indexDir = jsonSubscriptions.getSubsIndexDir();
    const fileName = path.join(indexDir, clientId + '.json');
    if (fs.existsSync(fileName))
        fs.unlinkSync(fileName);
};

jsonSubscriptions.loadSubscriptionApiIndex = function (apiId) {
    debug('loadSubscriptionApiIndex(): ' + apiId);
    const indexDir = jsonSubscriptions.getSubsApiIndexDir();
    const fileName = path.join(indexDir, apiId + '.json');
    if (!fs.existsSync(fileName))
        return null;
    return JSON.parse(fs.readFileSync(fileName, 'utf8'));
};

jsonSubscriptions.saveSubscriptionApiIndex = function (apiId, apiIndex) {
    debug('saveSubscriptionApiIndex(): ' + apiId);
    const indexDir = jsonSubscriptions.getSubsApiIndexDir();
    const fileName = path.join(indexDir, apiId + '.json');
    return fs.writeFileSync(fileName, JSON.stringify(apiIndex, null, 2), 'utf8');
};

jsonSubscriptions.addSubscriptionApiIndexEntry = function (subsInfo) {
    debug('addSubscriptionApiIndexEntry(): ' + subsInfo.application + ', plan: ' + subsInfo.plan);
    const appId = subsInfo.application;
    const planId = subsInfo.plan;
    const apiId = subsInfo.api;
    let apiIndex = jsonSubscriptions.loadSubscriptionApiIndex(apiId);
    if (!apiIndex) {
        console.error('*** addSubscriptionApiIndexEntry: Could not find index; recreating.');
        apiIndex = [];
    }

    const indexEntry = apiIndex.find(ie => ie.application === appId);
    if (indexEntry) {
        console.error('*** addSubscriptionApiIndexEntry() was called with an application which already has a subscription.');
        // This is strange, and shouldn't happen.
        indexEntry.plan = planId;
    } else {
        apiIndex.push({
            application: appId,
            plan: planId
        });
    }
    jsonSubscriptions.saveSubscriptionApiIndex(apiId, apiIndex);
};

jsonSubscriptions.deleteSubscriptionApiIndexEntry = function (subsInfo) {
    debug('deleteSubscriptionApiIndexEntry(): ' + subsInfo.api + ', application: ' + subsInfo.application);
    const apiId = subsInfo.api;
    const appId = subsInfo.application;

    let apiIndex = jsonSubscriptions.loadSubscriptionApiIndex(apiId);
    if (!apiIndex) {
        console.error('*** deleteSubscriptionApiIndexEntry: Could not find index; recreating.');
        apiIndex = [];
    }
    let indexOfApp = -1;
    for (let i = 0; i < apiIndex.length; ++i) {
        const entry = apiIndex[i];
        if (entry.application == appId) {
            indexOfApp = i;
            break;
        }
    }
    if (indexOfApp >= 0) {
        // remove from index
        // debug(apiIndex);
        apiIndex.splice(indexOfApp, 1);
        // debug(apiIndex);
        jsonSubscriptions.saveSubscriptionApiIndex(apiId, apiIndex);
    } else {
        console.error('*** deleteSubscriptionApiIndexEntry called to remove entry for ' + appId + ' which is not present for API ' + apiId);
    }
};

jsonSubscriptions.createSync = (newSubscription) => {
    debug('createSync()');

    const appId = newSubscription.application;
    return jsonUtils.withLockedSubscriptions(appId, function () {
        const appSubs = jsonSubscriptions.loadSubscriptions(appId);

        // Push new subscription
        appSubs.push(newSubscription);

        // Remember the client ID for writing the index
        const newClientId = newSubscription.clientId;
        // Persist subscriptions; this will encrypt clientId and clientSecret
        jsonSubscriptions.saveSubscriptions(appId, appSubs);

        // Add to subscription index, if it has a clientId
        if (newSubscription.clientId) {
            jsonSubscriptions.saveSubscriptionIndexEntry(newClientId, newSubscription);
        }
        // Add API index for subscription
        jsonSubscriptions.addSubscriptionApiIndexEntry(newSubscription);

        return newSubscription;
    });
};

jsonSubscriptions.deleteSync = (appId, apiId, subscriptionId) => {
    debug('deleteSync()');

    return jsonUtils.withLockedSubscriptions(appId, function () {
        const appSubs = jsonSubscriptions.loadSubscriptions(appId);
        const subsIndex = appSubs.findIndex(s => s.id === subscriptionId);
        if (subsIndex < 0)
            throw utils.makeError(404, 'Not found. Subscription to API "' + apiId + '" does not exist: ' + appId);
        const subscriptionData = appSubs[subsIndex];
        // We need to remove the subscription from the index, if necessary
        const clientId = subscriptionData.clientId;

        jsonApprovals.deleteByAppAndApiSync(appId, apiId);
        appSubs.splice(subsIndex, 1);

        // Persist again
        jsonSubscriptions.saveSubscriptions(appId, appSubs);

        // Now check the clientId
        if (clientId)
            jsonSubscriptions.deleteSubscriptionIndexEntry(clientId);
        // Delete the subscription from the API index
        jsonSubscriptions.deleteSubscriptionApiIndexEntry(subscriptionData);
    });
};

function findSubsIndex(appSubs, apiId) {
    let subsIndex = -1;
    for (let i = 0; i < appSubs.length; ++i) {
        if (appSubs[i].api == apiId) {
            subsIndex = i;
            break;
        }
    }
    return subsIndex;
}

jsonSubscriptions.patchSync = (appId, subsInfo, patchingUserId) => {
    debug('patchSync()');
    return jsonUtils.withLockedSubscriptions(appId, function () {
        const appSubs = jsonSubscriptions.loadSubscriptions(appId);
        const subsIndex = appSubs.findIndex(s => s.id == subsInfo.id);
        if (subsIndex < 0)
            return utils.makeError(404, 'Not found. Subscription does not exist');

        appSubs[subsIndex] = subsInfo;
        const tempClientId = subsInfo.clientId;

        jsonSubscriptions.saveSubscriptions(appId, appSubs);

        // In case we have a client ID, update the susbcription index
        if (tempClientId) {
            jsonSubscriptions.saveSubscriptionIndexEntry(tempClientId, subsInfo);
        }
        return subsInfo;
    });
};

function loadAndFindSubscription(appId, apiId, callback) {
    debug(`loadAndFindSubscription(${appId}, ${apiId})`);

    const appSubs = jsonSubscriptions.loadSubscriptions(appId);
    let subsIndex = -1;
    for (let i = 0; i < appSubs.length; ++i) {
        if (appSubs[i].api == apiId) {
            subsIndex = i;
            break;
        }
    }
    if (subsIndex < 0)
        return null;
    return appSubs[subsIndex];
}

jsonSubscriptions.getByAppAndApiSync = (appId, apiId) => {
    debug(`getByAppAndApi(${appId}, ${apiId})`);
    const subsInfo = loadAndFindSubscription(appId, apiId);
    return subsInfo;
};

jsonSubscriptions.getByClientIdSync = (clientId) => {
    debug(`getByClientIdSync(${clientId})`);
    const indexEntry = jsonSubscriptions.loadSubscriptionIndexEntry(clientId);
    if (!indexEntry)
        return null; // Not found

    const appSub = loadAndFindSubscription(indexEntry.application, indexEntry.api);
    if (!appSub) {
        const errorMessage = 'Inconsistent state. Please notify operator: Subscription for app ' + indexEntry.application + ' to API ' + indexEntry.api + ' not found.';
        console.error("getSubscriptionByClientId(): " + errorMessage);
        throw utils.makeError(500, errorMessage);
    }
    return appSub;
};

jsonSubscriptions.getByApiSync = (apiId, offset, limit) => {
    debug(`getByApi(${apiId})`);
    const apiSubs = jsonSubscriptions.loadSubscriptionApiIndex(apiId);
    return apiSubs;
};

module.exports = jsonSubscriptions;
