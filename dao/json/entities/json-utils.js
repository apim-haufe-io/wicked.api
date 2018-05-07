'use strict';

const { debug, info, warn, error } = require('portal-env').Logger('portal-api:dao:json');
const fs = require('fs');
const path = require('path');

const utils = require('../../../routes/utils');

const jsonUtils = () => { };

// USEFUL THINGS

jsonUtils.pageArray = (array, offset, limit) => {
    debug(`pageArray(..., ${offset}, ${limit})`);
    if (offset === 0 && limit === 0)
        return array;
    return array.slice(offset, offset + limit);
};

jsonUtils.checkCallback = (callback) => {
    if (!callback || typeof(callback) !== 'function') {
        error('Value of callback: ' + callback);
        throw new Error('Parameter "callback" is null or not a function');
    }
};

// LOCKING UTILITY FUNCTIONS

jsonUtils.withLockedUserList = function (userIdList, actionHook) {
    debug('withLockedUserList()');
    debug(userIdList);
    const lockedUsers = [];
    try {
        for (let i = 0; i < userIdList.length; ++i) {
            if (!jsonUtils.lockUser(userIdList[i]))
                throw utils.makeError(423, 'User with id ' + userIdList[i] + ' is locked. Try again later.');
            lockedUsers.push(userIdList[i]);
        }

        const retVal = actionHook();

        debug('withLockedUserList() finished');

        return retVal;
    } finally {
        for (let i = 0; i < lockedUsers.length; ++i) {
            try { jsonUtils.unlockUser(lockedUsers[i]); } catch (err) { debug(err); error(err); }
        }
        debug('withLockedUserList() cleaned up');
    }
};

jsonUtils.withLockedUser = function (userId, actionHook) {
    debug('withLockedUser(): ' + userId);
    return jsonUtils.withLockedUserList([userId], actionHook);
};

jsonUtils.withLockedUserIndex = function (actionHook) {
    debug('withLockedUserIndex()');
    let lockedIndex = false;
    try {
        if (!jsonUtils.lockUserIndex())
            throw utils.makeError(423, 'User index is currently locked. Try again later.');
        lockedIndex = true;

        const retVal = actionHook();

        debug('withLockedUserIndex() finished');

        return retVal;
    } finally {
        if (lockedIndex)
            try { jsonUtils.unlockUserIndex(); } catch (err) { debug(err); error(err); }
        debug('withLockedUserIndex() cleaned up');
    }
};

jsonUtils.withLockedAppsIndex = function (actionHook) {
    debug('withLockedAppsIndex()');
    let lockedIndex = false;
    try {
        if (!jsonUtils.lockAppsIndex())
            throw utils.makeError(423, 'Application index is currently locked. Try again later.');
        lockedIndex = true;

        const retVal = actionHook();

        debug('withLockedAppsIndex() finished');

        return retVal;
    } finally {
        if (lockedIndex)
            try { jsonUtils.unlockAppsIndex(); } catch (err) { debug(err); error(err); }
        debug('withLockedAppsIndex() cleaned up');
    }
};

jsonUtils.withLockedApp = function (appId, actionHook) {
    debug('withLockedApp(): ' + appId);
    let lockedApp = false;
    try {
        if (!jsonUtils.lockApplication(appId))
            throw utils.makeError(423, 'Application is locked. Please try again later.');
        lockedApp = true;

        const retVal = actionHook();

        debug('withLockedApp(): ' + appId + ' finished');

        return retVal;
    } finally {
        if (lockedApp)
            try { jsonUtils.unlockApplication(appId); } catch (err) { debug(err); error(err); }
        debug('withLockedApp(): ' + appId + ' cleaned up');
    }
};

jsonUtils.withLockedSubscriptions = function (appId, actionHook) {
    debug('withLockedSubscriptions(): ' + appId);
    let lockedSubscriptions = false;
    try {
        if (!jsonUtils.lockSubscriptions(appId))
            throw utils.makeError(423, 'Application subscriptions are locked. Try again later.');
        lockedSubscriptions = true;

        const retVal = actionHook();

        debug('withLockedSubscriptions(): ' + appId + ' finished');

        return retVal;
    } finally {
        if (lockedSubscriptions)
            try { jsonUtils.unlockSubscriptions(appId); } catch (err) { debug(err); error(err); }
        debug('withLockedSubscriptions(): ' + appId + ' cleaned up');
    }
};

jsonUtils.withLockedApprovals = function (actionHook) {
    debug('withLockedApprovals()');
    let lockedApprovals = false;
    try {
        if (!jsonUtils.lockApprovals())
            throw utils.makeError(423, 'Approvals index is locked. Try again later.');
        lockedApprovals = true;

        const retVal = actionHook();

        debug('withLockedApprovals() finished');

        return retVal;
    } finally {
        if (lockedApprovals)
            try { jsonUtils.unlockApprovals(); } catch (err) { debug(err); error(err); }
        debug('withLockedApprovals() cleaned up');
    }
};

jsonUtils.withLockedEvents = function (listenerId, actionHook) {
    debug('withLockedEvents(): ' + listenerId);
    let lockedEvents = false;
    try {
        if (!jsonUtils.lockEvents(listenerId))
            throw utils.makeError(423, 'Events for listener are locked. Try again later.');
        lockedEvents = true;

        const retVal = actionHook();

        debug('withLockedEvents(): ' + listenerId + ' finished');

        return retVal;
    } finally {
        if (lockedEvents)
            try { jsonUtils.unlockEvents(listenerId); } catch (err) { }
        debug('withLockedEvents(): ' + listenerId + ' cleaned up');
    }
};

jsonUtils.withLockedListeners = function (listenerId, actionHook) {
    debug('withLockedListeners()');
    let lockedListeners = false;
    try {
        if (!jsonUtils.lockListeners())
            throw utils.makeError(423, 'Listener index locked. Try again later.');
        lockedListeners = true;

        const retVal = actionHook();

        debug('withLockedListeners() finished');

        return retVal;
    } finally {
        if (lockedListeners)
            try { jsonUtils.unlockListeners(); } catch (err) { debug(err); error(err); }
        debug('withLockedListeners() cleaned up');
    }
};

jsonUtils.withLockedVerifications = function (actionHook) {
    debug('withLockedVerifications()');
    let lockedVerifications = false;
    try {
        if (!jsonUtils.lockVerifications())
            throw utils.makeError(423, 'Verification index locked. Try again later.');
        lockedVerifications = true;

        const retVal = actionHook();

        debug('withLockedVerifications() finished');

        return retVal;
    } finally {
        if (lockedVerifications)
            try { jsonUtils.unlockVerifications(); } catch (err) { debug(err); error(err); }
        debug('withLockedVerifications() cleaned up');
    }
};

jsonUtils.globalLock = function () {
    const globalLockFileName = path.join(utils.getDynamicDir(), 'global.lock');
    if (fs.existsSync(globalLockFileName))
        throw utils.makeError(423, "utils.globalLock - System already is globally locked!");
    fs.writeFileSync(globalLockFileName, '');
    return true;
};

jsonUtils.globalUnlock = function () {
    const globalLockFileName = path.join(utils.getDynamicDir(), 'global.lock');
    if (!fs.existsSync(globalLockFileName))
        throw utils.makeError(423, "utils.globalUnlock - System isn't locked, cannot unlock!");
    fs.unlinkSync(globalLockFileName);
    return true;
};

jsonUtils.hasGlobalLock = function () {
    const globalLockFileName = path.join(utils.getDynamicDir(), 'global.lock');
    return fs.existsSync(globalLockFileName);
};

jsonUtils.lockFile = function (subDir, fileName) {
    debug('lockFile(): ' + subDir + '/' + fileName);
    if (jsonUtils.hasGlobalLock())
        return false;
    const baseDir = path.join(utils.getDynamicDir(), subDir);
    const fullFileName = path.join(baseDir, fileName);
    const lockFileName = fullFileName + '.lock';

    if (!fs.existsSync(fullFileName))
        throw utils.makeError(500, "utils.lockFile - File not found: " + fileName);

    if (fs.existsSync(lockFileName))
        return false;

    fs.writeFileSync(lockFileName, '');
    return true;
};

jsonUtils.unlockFile = function (subDir, fileName) {
    debug('unlockFile(): ' + subDir + '/' + fileName);
    const baseDir = path.join(utils.getDynamicDir(), subDir);
    const lockFileName = path.join(baseDir, fileName + '.lock');

    if (fs.existsSync(lockFileName))
        fs.unlinkSync(lockFileName);
};

// SPECIFIC LOCKS

// USERS

jsonUtils.lockUserIndex = function () {
    return jsonUtils.lockFile('users', '_index.json');
};

jsonUtils.unlockUserIndex = function () {
    jsonUtils.unlockFile('users', '_index.json');
};

jsonUtils.lockUser = function (userId) {
    return jsonUtils.lockFile('users', userId + '.json');
};

jsonUtils.unlockUser = function (userId) {
    jsonUtils.unlockFile('users', userId + '.json');
};

// APPLICATIONS

jsonUtils.lockAppsIndex = function () {
    return jsonUtils.lockFile('applications', '_index.json');
};

jsonUtils.unlockAppsIndex = function () {
    jsonUtils.unlockFile('applications', '_index.json');
};

jsonUtils.lockApplication = function (appId) {
    return jsonUtils.lockFile('applications', appId + '.json');
};

jsonUtils.unlockApplication = function (appId) {
    jsonUtils.unlockFile('applications', appId + '.json');
};

jsonUtils.getAppsDir = function () {
    return path.join(utils.getDynamicDir(), 'applications');
};

// SUBSCRIPTIONS

jsonUtils.lockSubscriptions = function (appId) {
    return jsonUtils.lockFile('subscriptions', appId + '.subs.json');
};

jsonUtils.unlockSubscriptions = function (appId) {
    jsonUtils.unlockFile('subscriptions', appId + '.subs.json');
};

// APPROVALS

jsonUtils.lockApprovals = function () {
    return jsonUtils.lockFile('approvals', '_index.json');
};

jsonUtils.unlockApprovals = function () {
    return jsonUtils.unlockFile('approvals', '_index.json');
};

// WEBHOOKS

jsonUtils.LISTENER_FILE = '_listeners.json';

jsonUtils.lockListeners = function () {
    return jsonUtils.lockFile('webhooks', jsonUtils.LISTENER_FILE);
};

jsonUtils.unlockListeners = function () {
    return jsonUtils.unlockFile('webhooks', jsonUtils.LISTENER_FILE);
};

jsonUtils.lockEvents = function (listenerId) {
    return jsonUtils.lockFile('webhooks', listenerId + '.json');
};

jsonUtils.unlockEvents = function (listenerId) {
    jsonUtils.unlockFile('webhooks', listenerId + '.json');
};

// VERIFICATIONS

jsonUtils.lockVerifications = function () {
    return jsonUtils.lockFile('verifications', '_index.json');
};

jsonUtils.unlockVerifications = function () {
    return jsonUtils.unlockFile('verifications', '_index.json');
};


module.exports = jsonUtils;
