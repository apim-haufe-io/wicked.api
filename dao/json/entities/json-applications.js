'use strict';

const { debug, info, warn, error } = require('portal-env').Logger('portal-api:dao:json:applications');
const fs = require('fs');
const path = require('path');

const utils = require('../../../routes/utils');
const ownerRoles = require('../../../routes/ownerRoles');
const daoUtils = require('../../dao-utils');
const jsonUtils = require('./json-utils');

const jsonUsers = require('./json-users');
const jsonSubscriptions = require('./json-subscriptions');
const jsonApprovals = require('./json-approvals');

const jsonApplications = () => { };

// =================================================
// DAO contract
// =================================================

jsonApplications.getById = (appId, callback) => {
    debug('getById()');
    jsonUtils.checkCallback(callback);
    let appInfo;
    try {
        appInfo = jsonApplications.loadApplication(appId);
    } catch (err) {
        return callback(err);
    }
    return callback(null, appInfo);
};

jsonApplications.create = (appCreateInfo, userInfo, callback) => {
    debug('create()');
    jsonUtils.checkCallback(callback);
    let newApp;
    try {
        newApp = jsonApplications.createSync(appCreateInfo, userInfo);
    } catch (err) {
        return callback(err);
    }
    return callback(null, newApp);
};

jsonApplications.save = (appInfo, savingUserId, callback) => {
    debug('save()');
    jsonUtils.checkCallback(callback);
    try {
        jsonApplications.saveApplication(appInfo, savingUserId);
    } catch (err) {
        return callback(err);
    }
    return callback(null, appInfo);
};

jsonApplications.delete = (appId, deletingUserId, callback) => {
    debug('delete()');
    jsonUtils.checkCallback(callback);
    let deletedAppInfo;
    try {
        deletedAppInfo = jsonApplications.deleteSync(appId, deletingUserId);
    } catch (err) {
        return callback(err);
    }
    return callback(null, deletedAppInfo);
};

jsonApplications.getAll = (filter, orderBy, offset, limit, noCountCache, callback) => {
    debug('getAll()');
    // noCountCache not used here, it doesn't have any impact
    jsonUtils.checkCallback(callback);
    let allApps;
    try {
        allApps = jsonApplications.getAllSync(filter, orderBy, offset, limit);
    } catch (err) {
        return callback(err);
    }
    return callback(null, allApps.rows, { count: allApps.count, cached: false });
};

jsonApplications.getIndex = (offset, limit, callback) => {
    debug('getIndex()');
    jsonUtils.checkCallback(callback);
    let appsIndex;
    try {
        appsIndex = jsonApplications.getIndexSync(offset, limit);
    } catch (err) {
        return callback(err);
    }
    return callback(null, appsIndex.rows, { count: appsIndex.count, cached: false });
};

jsonApplications.getCount = (callback) => {
    debug('getCount()');
    jsonUtils.checkCallback(callback);
    let appCount;
    try {
        appCount = jsonApplications.getCountSync();
    } catch (err) {
        return callback(err);
    }
    return callback(null, appCount);
};

jsonApplications.getOwners = (appId, callback) => {
    debug('getOwners()');
    jsonUtils.checkCallback(callback);
    let ownerList;
    try {
        ownerList = jsonApplications.getOwnersSync(appId);
    } catch (err) {
        return callback(err);
    }
    return callback(null, ownerList);
};


jsonApplications.addOwner = (appId, userInfo, role, addingUserId, callback) => {
    debug('addOwner()');
    jsonUtils.checkCallback(callback);
    let updatedAppInfo;
    try {
        updatedAppInfo = jsonApplications.addOwnerSync(appId, userInfo, role, addingUserId);
    } catch (err) {
        return callback(err);
    }
    return callback(null, updatedAppInfo);
};

jsonApplications.deleteOwner = (appId, deleteUserId, deletingUserId, callback) => {
    debug('deleteOwner()');
    jsonUtils.checkCallback(callback);
    let updatedAppInfo;
    try {
        updatedAppInfo = jsonApplications.deleteOwnerSync(appId, deleteUserId, deletingUserId);
    } catch (err) {
        return callback(err);
    }
    return callback(null, updatedAppInfo);
};


// =================================================
// DAO implementation/internal methods
// =================================================

function findOwner(appInfo) {
    if (!appInfo.owners || appInfo.owners.length === 0)
        return null;

    for (let i = 0; i < appInfo.owners.length; ++i) {
        const owner = appInfo.owners[i];
        if (owner.role === 'owner')
            return owner;
    }

    warn(`Application ${appInfo.id} does not have an owner with role 'owner'.`);
    return appInfo.owners[0];
}

jsonApplications.getAllSync = (filter, orderBy, offset, limit) => {
    debug('getAllSync()');
    // Meh. This is super expensive, but you shouldn't use the JSON
    // backend for production anyway. Plus, this is only for admins.
    // So it's not that bad.
    const appsIndex = jsonApplications.loadAppsIndex();
    const appInfoList = [];
    for (let i = 0; i < appsIndex.length; ++i) {
        const appId = appsIndex[i].id;
        const appInfo = jsonApplications.loadApplication(appId);
        if (!appInfo) {
            warn(`getAllSync: Could not load application with id ${appId}`);
            continue;
        }
        const owner = findOwner(appInfo);
        if (owner) {
            appInfo.ownerUserId = owner.userId;
            appInfo.ownerEmail = owner.email;
        }
        delete appInfo.owners;
        appInfoList.push(appInfo);
    }

    if (!orderBy)
        orderBy = 'id ASC';

    const filterResult = jsonUtils.filterAndPage(appInfoList, filter, orderBy, offset, limit);

    return {
        rows: filterResult.list,
        count: filterResult.filterCount
    };
};

jsonApplications.getIndexSync = (offset, limit) => {
    debug('getIndexSync()');
    const appsIndex = jsonApplications.loadAppsIndex();
    return {
        rows: jsonUtils.pageArray(appsIndex, offset, limit),
        count: appsIndex.length
    };
};

jsonApplications.getCountSync = () => {
    debug('getCountSync()');
    const appsIndex = jsonApplications.loadAppsIndex();
    return appsIndex.length;
};

jsonApplications.createSync = (appCreateInfo, userInfo) => {
    debug('createSync()');
    const appId = appCreateInfo.id.trim();
    const redirectUri = appCreateInfo.redirectUri;
    return jsonUtils.withLockedAppsIndex(function () {
        const appsIndex = jsonApplications.loadAppsIndex();
        return jsonUtils.withLockedUser(userInfo.id, function () {
            // Check for dupes
            for (let i = 0; i < appsIndex.length; ++i) {
                const appInfo = appsIndex[i];
                if (appInfo.id === appId)
                    throw utils.makeError(409, 'Application ID "' + appId + '" already exists.');
            }

            // Now we can add the application
            const newApp = {
                id: appId,
                name: appCreateInfo.name.substring(0, 128),
                redirectUri: appCreateInfo.redirectUri,
                confidential: !!appCreateInfo.confidential,
                mainUrl: appCreateInfo.mainUrl,
                owners: [
                    {
                        userId: userInfo.id,
                        email: userInfo.email,
                        role: ownerRoles.OWNER,
                        _links: {
                            user: { href: '/users/' + userInfo.id }
                        }
                    }
                ],
                _links: {
                    self: { href: '/applications/' + appId }
                }
            };

            // Push new application to user
            userInfo.applications.push({
                id: appId,
                _links: {
                    application: { href: '/applications/' + appId }
                }
            });

            // Push to index
            appsIndex.push({ id: appId });
            // Persist application
            jsonApplications.saveApplication(newApp, userInfo.id);
            // Persist application subscriptions (empty)
            jsonSubscriptions.saveSubscriptions(appId, []);
            // Persist index
            jsonApplications.saveAppsIndex(appsIndex);
            // Persist user
            delete userInfo.name;
            jsonUsers.saveUser(userInfo, userInfo.id);

            return newApp;
        });
    });
};

jsonApplications.deleteSync = (appId, deletingUserId) => {
    debug('deleteSync()');

    const appInfo = jsonApplications.loadApplication(appId);
    // This shouldn't happen, as it's checked in the generic code as well
    if (!appInfo)
        throw utils.makeError(404, `Application ${appId} not found.`);
    const ownerIdList = [];
    for (let i = 0; i < appInfo.owners.length; ++i)
        ownerIdList.push(appInfo.owners[i].userId);

    // Ohhh, this is really bad, but deleting an application triggers
    // a whole lot of things, like removing the application from its
    // owners, removing subscriptions, and such things. On Postgres, this
    // is a lot easier, as the DELETE just cascades to tables having foreign
    // keys on the applications entity, but here we have to do it by hand...
    return jsonUtils.withLockedAppsIndex(function () {
        return jsonUtils.withLockedApp(appId, function () {
            return jsonUtils.withLockedUserList(ownerIdList, function () {
                return jsonUtils.withLockedApprovals(function () {
                    const appsIndex = jsonApplications.loadAppsIndex();
                    let index = -1;
                    for (let i = 0; i < appsIndex.length; ++i) {
                        if (appId == appsIndex[i].id) {
                            index = i;
                            break;
                        }
                    }

                    if (index < 0)
                        throw "Application with id " + appId + " was not found in index.";
                    appsIndex.splice(index, 1);

                    for (let i = 0; i < ownerIdList.length; ++i) {
                        const ownerInfo = jsonUsers.loadUser(ownerIdList[i]);
                        if (!ownerInfo)
                            throw utils.makeError(500, "In DELETE applications: Could not find owner " + ownerIdList[i]);
                        // Remove application from applications list
                        let found = true;
                        while (found) {
                            let index = -1;
                            for (let j = 0; j < ownerInfo.applications.length; ++j) {
                                if (ownerInfo.applications[j].id == appId) {
                                    index = j;
                                    break;
                                }
                            }
                            if (index >= 0)
                                ownerInfo.applications.splice(index, 1);
                            else
                                found = false;
                        }
                        try {
                            delete ownerInfo.name;
                            jsonUsers.saveUser(ownerInfo, deletingUserId);
                        } catch (err) {
                            error('Caught exception saving user ' + ownerInfo.id);
                            error(err);
                        }
                    }

                    // Now persist the index
                    jsonApplications.saveAppsIndex(appsIndex);

                    // And delete the application
                    const appsDir = jsonUtils.getAppsDir();
                    const appsFileName = path.join(appsDir, appId + '.json');

                    if (fs.existsSync(appsFileName))
                        fs.unlinkSync(appsFileName);

                    // And its subcriptions
                    // Delete all subscriptions from the subscription indexes (if applicable)
                    const appSubs = jsonSubscriptions.loadSubscriptions(appId);
                    for (let i = 0; i < appSubs.length; ++i) {
                        const appSub = appSubs[i];
                        if (appSub.clientId)
                            jsonSubscriptions.deleteSubscriptionIndexEntry(appSub.clientId);
                        jsonSubscriptions.deleteSubscriptionApiIndexEntry(appSub);
                    }
                    // And now delete the subscription file
                    const subsFileName = path.join(appsDir, appId + '.subs.json');
                    if (fs.existsSync(subsFileName))
                        fs.unlinkSync(subsFileName);

                    // Now we'll try to clean up the approvals, if needed
                    jsonApprovals.deleteByAppSync(appId);

                    //////////////////////////////

                    return appInfo;
                });
            });
        });
    });
};

jsonApplications.getOwnersSync = (appId) => {
    debug('getOwnersSync()');
    const appInfo = jsonApplications.loadApplication(appId);
    if (!appInfo)
        throw utils.makeError(404, 'Unknown application, cannot return owners.');
    return appInfo.owners;
};

jsonApplications.addOwnerSync = (appId, userToAdd, role, addingUserId) => {
    debug('addOwnerSync()');
    return jsonUtils.withLockedApp(appId, function () {
        return jsonUtils.withLockedUser(userToAdd.id, function () {
            userToAdd.applications.push({
                id: appId,
                _links: {
                    application: { href: '/applications/' + appId }
                }
            });

            const appInfo = jsonApplications.loadApplication(appId);

            appInfo.owners.push({
                userId: userToAdd.id,
                email: userToAdd.email,
                role: role,
                _links: {
                    user: { href: '/users/' + userToAdd.id }
                }
            });

            // Persist application
            jsonApplications.saveApplication(appInfo, addingUserId);

            // Persist user
            jsonUsers.saveUser(userToAdd, addingUserId);

            return appInfo;
        });
    });
};

jsonApplications.deleteOwnerSync = (appId, deleteUserId, deletingUserId) => {
    debug('deleteOwnerSync()');
    // Do da locking
    return jsonUtils.withLockedApp(appId, function () {
        return jsonUtils.withLockedUser(deleteUserId, function () {
            const userToDelete = jsonUsers.loadUser(deleteUserId);
            const appInfo = jsonApplications.loadApplication(appId);

            let found = true;
            while (found) {
                let index = -1;
                for (let i = 0; i < appInfo.owners.length; ++i) {
                    if (appInfo.owners[i].userId == userToDelete.id) {
                        index = i;
                        break;
                    }
                }
                if (index >= 0)
                    appInfo.owners.splice(index, 1);
                else
                    found = false;
            }
            found = true;
            while (found) {
                let index = -1;
                for (let i = 0; i < userToDelete.applications.length; ++i) {
                    if (userToDelete.applications[i].id == appId) {
                        index = i;
                        break;
                    }
                }
                if (index >= 0)
                    userToDelete.applications.splice(index, 1);
                else
                    found = false;
            }

            // Persist user
            jsonUsers.saveUser(userToDelete, deletingUserId);
            // Persist application
            jsonApplications.saveApplication(appInfo, deletingUserId);

            // return the updated application info object
            return appInfo;
        });
    });
};

jsonApplications.loadAppsIndex = function () {
    debug('loadAppsIndex()');
    const appsDir = jsonUtils.getAppsDir();
    const appIndexFileName = path.join(appsDir, '_index.json');
    return JSON.parse(fs.readFileSync(appIndexFileName, 'utf8'));
};

jsonApplications.saveAppsIndex = function (appsIndex) {
    debug('saveAppsIndex()');
    const appsDir = jsonUtils.getAppsDir();
    const appIndexFileName = path.join(appsDir, '_index.json');
    fs.writeFileSync(appIndexFileName, JSON.stringify(appsIndex, null, 2), 'utf8');
};

jsonApplications.loadApplication = function (appId) {
    debug('loadApplication(): ' + appId);
    const appsDir = jsonUtils.getAppsDir();
    const appsFileName = path.join(appsDir, appId + '.json');
    if (!fs.existsSync(appsFileName))
        return null;
    //throw "applications.loadApplication - Application not found: " + appId;
    return JSON.parse(fs.readFileSync(appsFileName, 'utf8'));
};

jsonApplications.saveApplication = function (appInfo, userId) {
    debug('saveApplication()');
    debug(appInfo);
    const appsDir = jsonUtils.getAppsDir();
    const appsFileName = path.join(appsDir, appInfo.id + '.json');
    appInfo.changedBy = userId;
    appInfo.changedDate = utils.getUtc();
    fs.writeFileSync(appsFileName, JSON.stringify(appInfo, null, 2), 'utf8');
};


module.exports = jsonApplications;