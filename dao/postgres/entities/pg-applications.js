'use strict';

const async = require('async');
const { debug, info, warn, error } = require('portal-env').Logger('portal-api:dao:pg:applications');

const utils = require('../../../routes/utils');
const ownerRoles = require('../../../routes/ownerRoles');
const daoUtils = require('../../dao-utils');
const pgUtils = require('../pg-utils');

const pgApplications = function () { };

// =================================================
// DAO contract
// =================================================

pgApplications.getById = (appId, callback) => {
    debug('getById()');
    pgUtils.checkCallback(callback);
    return getByIdImpl(appId, null, callback);
};

pgApplications.create = (appCreateInfo, userInfo, callback) => {
    debug('create()');
    pgUtils.checkCallback(callback);
    return createImpl(appCreateInfo, userInfo, callback);
};

pgApplications.save = (appInfo, savingUserId, callback) => {
    debug('save()');
    pgUtils.checkCallback(callback);
    return saveImpl(appInfo, savingUserId, callback);
};

pgApplications.delete = (appId, deletingUserId, callback) => {
    debug(`delete(${appId})`);
    pgUtils.checkCallback(callback);
    // Postgres will do all the cascading deleting on owners, and the index
    // is of course also managed by Postgres.
    return pgUtils.deleteById('applications', appId, callback);
};

pgApplications.getIndex = (offset, limit, callback) => {
    debug('getIndex()');
    pgUtils.checkCallback(callback);
    return getIndexImpl(offset, limit, callback);
};

pgApplications.getCount = (callback) => {
    debug('getCount()');
    pgUtils.checkCallback(callback);
    return pgUtils.count('applications', callback);
};

pgApplications.getOwners = (appId, callback) => {
    debug('getOwners()');
    pgUtils.checkCallback(callback);
    return getOwnersImpl(appId, null, callback);
};

pgApplications.addOwner = (appId, userInfo, role, addingUserId, callback) => {
    debug('addOwner()');
    pgUtils.checkCallback(callback);
    return addOwnerImpl(appId, userInfo, role, addingUserId, callback);
};

pgApplications.deleteOwner = (appId, deleteUserId, deletingUserId, callback) => {
    debug('deleteOwner()');
    pgUtils.checkCallback(callback);
    return deleteOwnerImpl(appId, deleteUserId, deletingUserId, callback);
};

// =================================================
// DAO implementation/internal methods
// =================================================

function getByIdImpl(appId, client, callback) {
    debug(`getByIdImpl(${appId})`);
    const options = client ? { client: client } : null;
    // First load the basic app information
    pgUtils.getById('applications', appId, options, (err, appInfo) => {
        if (err)
            return callback(err);
        if (!appInfo)
            return callback(null, null);
        // Then load the owners, so that we can add them
        getOwnersImpl(appId, client, (err, ownerList) => {
            if (err)
                return callback(err);
            appInfo.owners = ownerList;
            return callback(null, appInfo);
        });
    });
}

function createImpl(appCreateInfo, userInfo, callback) {
    debug('createImpl()');
    const appId = appCreateInfo.id.trim();
    const redirectUri = appCreateInfo.redirectUri;

    // Check for Dupe
    pgUtils.getById('applications', appId, (err, existingApp) => {
        if (err)
            return callback(err);
        if (existingApp)
            return callback(utils.makeError(409, 'Application ID "' + appId + '" already exists.'));
        // Now we can add the application
        const newApp = {
            id: appId,
            name: appCreateInfo.name.substring(0, 128),
            redirectUri: appCreateInfo.redirectUri,
            confidential: !!appCreateInfo.confidential,
        };
        const ownerInfo = makeOwnerInfo(appId, userInfo, ownerRoles.OWNER);

        let createdAppInfo = null;
        // Use a transaction so that the state will remain consistent
        pgUtils.withTransaction((err, client, callback) => {
            if (err)
                return callback(err);
            async.series({
                // Create the application
                createApp: callback => pgUtils.upsert('applications', newApp, userInfo.id, client, callback),
                // ... and add an owner record for the current user for it
                createOwner: callback => pgUtils.upsert('owners', ownerInfo, userInfo.id, client, callback),
                // And reload the structure to get what the DAO contract wants
                getApp: callback => getByIdImpl(appId, client, callback)
            }, (err, results) => {
                if (err)
                    return callback(err);
                debug('createImpl: Successfully created application');
                // We want to return this, so we need to save it from here and pass it
                // back to the calling function from below. This callback is the callback
                // from the withTransaction function, which swallows any return results.
                createdAppInfo = results.getApp;
                return callback(null);
            });
        }, (err) => {
            if (err)
                return callback(err);
            debug('Created application info:');
            debug(createdAppInfo);
            return callback(null, createdAppInfo);
        });
    });
}

function saveImpl(appInfo, savingUserId, callback) {
    debug('saveImpl()');
    const tempApp = Object.assign({}, appInfo);
    if (tempApp.owners)
        delete tempApp.owners;
    pgUtils.upsert('applications', appInfo, savingUserId, (err) => {
        if (err)
            return callback(err);
        return callback(null, appInfo);
    });
}

function getIndexImpl(offset, limit, callback) {
    debug(`getIndex(offset: ${offset}, limit: ${limit})`);
    pgUtils.getBy('applications', [], [], { orderBy: 'id ASC' }, (err, appList, countResult) => {
        if (err)
            return callback(err);
        const appIdList = appList.map(app => { return { id: app.id }; });
        return callback(null, appIdList, countResult);
    });
}

function getOwnersImpl(appId, client, callback) {
    debug(`getOwners(${appId})`);
    const options = client ? { client: client } : null;
    pgUtils.getBy('owners', ['applications_id'], [appId], options, (err, ownerList) => {
        if (err)
            return callback(err);
        const owners = ownerList.map(owner => {
            // Strip the index fields, not needed here
            return {
                userId: owner.userId,
                role: owner.role,
                email: owner.email
            };
        });
        debug(ownerList);
        debug(owners);
        return callback(null, owners);
    });
}

function addOwnerImpl(appId, userInfo, role, addingUserId, callback) {
    debug(`addOwnerImpl(${appId}, ${userInfo.id}, role: ${role})`);
    const ownerInfo = makeOwnerInfo(appId, userInfo, role);
    pgUtils.upsert('owners', ownerInfo, addingUserId, (err) => {
        if (err)
            return callback(err);
        // Return the appInfo as a result
        return getByIdImpl(appId, null, callback);
    });
}

function deleteOwnerImpl(appId, deleteUserId, deletingUserId, callback) {
    debug(`deleteOwnerImpl(${appId}, ${deleteUserId}`);
    pgUtils.deleteBy('owners', ['applications_id', 'users_id'], [appId, deleteUserId], (err) => {
        if (err)
            return callback(err);
        // Return the updated appInfo as a result
        return getByIdImpl(appId, null, callback);
    });
}

function makeOwnerInfo(appId, userInfo, role) {
    return {
        id: utils.createRandomId(),
        appId: appId,
        userId: userInfo.id,
        role: role,
        email: userInfo.email
    };
}

module.exports = pgApplications;
