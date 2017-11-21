'use strict';

const debug = require('debug')('portal-api:dao:json:applications');
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
    try {
        const appInfo = jsonApplications.loadApplication(appId);
        return callback(null, appInfo);
    } catch (err) {
        return callback(err);
    }
};

jsonApplications.create = (appCreateInfo, userInfo, callback) => {
    debug('create()');
    jsonUtils.checkCallback(callback);
    try {
        const newApp = jsonApplications.createSync(appCreateInfo, userInfo);
        return callback(null, newApp);
    } catch (err) {
        return callback(err);
    }
};

jsonApplications.save = (appInfo, savingUserId, callback) => {
    debug('save()');
    jsonUtils.checkCallback(callback);
    try {
        jsonApplications.saveApplication(appInfo, savingUserId);
        return callback(null, appInfo);
    } catch (err) {
        return callback(err);
    }
};

jsonApplications.delete = (appId, deletingUserId, callback) => {
    debug('delete()');
    jsonUtils.checkCallback(callback);
    try {
        const deletedAppInfo = jsonApplications.deleteSync(appId, deletingUserId);
        return callback(null, deletedAppInfo);
    } catch (err) {
        return callback(err);
    }
};

jsonApplications.getIndex = (offset, limit, callback) => {
    debug('getIndex()');
    jsonUtils.checkCallback(callback);
    try {
        const appsIndex = jsonApplications.getIndexSync(offset, limit);
        return callback(null, appsIndex);
    } catch (err) {
        return callback(err);
    }
};

jsonApplications.getCount = (callback) => {
    debug('getCount()');
    jsonUtils.checkCallback(callback);
    try {
        const appCount = jsonApplications.getCountSync();
        return callback(null, appCount);
    } catch (err) {
        return callback(err);
    }
};


jsonApplications.addOwner = (appId, userInfo, role, addingUserId, callback) => {
    debug('addOwner()');
    jsonUtils.checkCallback(callback);
    try {
        const updatedAppInfo = jsonApplications.addOwnerSync(appId, userInfo, role, addingUserId);
        return callback(null, updatedAppInfo);
    } catch (err) {
        return callback(err);
    }
};

jsonApplications.deleteOwner = (appId, deleteUserId, deletingUserId, callback) => {
    debug('deleteOwner()');
    jsonUtils.checkCallback(callback);
    try {
        const updatedAppInfo = jsonApplications.deleteOwnerSync(appId, deleteUserId, deletingUserId);
        return callback(null, updatedAppInfo);
    } catch (err) {
        return callback(err);
    }
};


// =================================================
// DAO implementation/internal methods
// =================================================

jsonApplications.getIndexSync = (offset, limit) => {
    debug('getIndexSync()');
    const appsIndex = jsonApplications.loadAppsIndex();
    return jsonUtils.pageArray(appsIndex, offset, limit);
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
    const ownerIdList = [];
    for (let i = 0; i < appInfo.owners.length; ++i)
        ownerIdList.push(appInfo.owners[i].userId);

    // TODO: This needs a major overhaul --> DAO. E.g. with Postgres,
    // this is just a DELETE on the applications table; all other entities
    // will be deleted via ON CASCADE deletions on foreign key relations.
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
                            debug(err);
                            console.error('Caught exception saving user ' + ownerInfo.id);
                            console.error(err);
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