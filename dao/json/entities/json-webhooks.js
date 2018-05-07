'use strict';

const { debug, info, warn, error } = require('portal-env').Logger('portal-api:dao:json:webhooks');
const fs = require('fs');
const path = require('path');

const utils = require('../../../routes/utils');
const jsonUtils = require('./json-utils');

const jsonWebhooks = () => { };

// =================================================
// DAO contract
// =================================================

jsonWebhooks.listeners = {};

jsonWebhooks.listeners.getAll = (callback) => {
    debug('getAll()');
    jsonUtils.checkCallback(callback);
    let listeners;
    try {
        listeners = jsonWebhooks.loadListeners();
    } catch (err) {
        return callback(err);
    }
    return callback(null, listeners);
};

jsonWebhooks.listeners.getById = (listenerId, callback) => {
    debug(`getById(${listenerId}`);
    jsonUtils.checkCallback(callback);
    let listener;
    try {
        listener = jsonWebhooks.getListener(listenerId);
    } catch (err) {
        return callback(err);
    }
    return callback(null, listener);
};

jsonWebhooks.listeners.upsert = (listenerInfo, callback) => {
    debug('upsert()');
    jsonUtils.checkCallback(callback);
    let upsertedInfo;
    try {
        upsertedInfo = jsonWebhooks.upsertListenerSync(listenerInfo);
    } catch (err) {
        return callback(err);
    }
    return callback(null, upsertedInfo);
};

jsonWebhooks.listeners.delete = (listenerId, callback) => {
    debug(`delete(${listenerId})`);
    jsonUtils.checkCallback(callback);
    let deletedListenerInfo;
    try {
        deletedListenerInfo = jsonWebhooks.deleteListenerSync(listenerId);
    } catch (err) {
        return callback(err);
    }
    return callback(null, deletedListenerInfo);
};

jsonWebhooks.events = {};

jsonWebhooks.events.hookListeners = (dispatchEvents, callback) => {
    // Check if we need to fire hooks from times to times (every 10 seconds)
    const hookInterval = process.env.PORTAL_API_HOOK_INTERVAL || '10000';
    debug('Setting webhook interval to ' + hookInterval);
    setInterval(() => {
        dispatchEvents(() => {});
    }, hookInterval);
};

jsonWebhooks.events.getByListener = (listenerId, callback) => {
    debug(`getByListener(${listenerId})`);
    jsonUtils.checkCallback(callback);
    let events;
    try {
        events = jsonWebhooks.getEventsByListenerSync(listenerId);
    } catch (err) {
        return callback(err);
    }
    return callback(null, events);
};

jsonWebhooks.events.flush = (listenerId, callback) => {
    debug(`flush(${listenerId})`);
    jsonUtils.checkCallback(callback);
    try {
        jsonWebhooks.flushEventsSync(listenerId);
    } catch (err) {
        return callback(err);
    }
    return callback(null);
};

jsonWebhooks.events.create = (eventData, callback) => {
    debug('create()');
    jsonUtils.checkCallback(callback);
    try {
        jsonWebhooks.createLogSync(eventData);
    } catch (err) {
        return callback(err);
    }
    return callback(null);
};

jsonWebhooks.events.delete = (listenerId, eventId, callback) => {
    debug(`delete(${listenerId}, ${eventId})`);
    jsonUtils.checkCallback(callback);
    try {
        jsonWebhooks.deleteEventSync(listenerId, eventId);
    } catch (err) {
        return callback(err);
    }
    return callback(null);
};

// =================================================
// DAO implementation/internal methods
// =================================================

jsonWebhooks.getIndex = function (infos, id) {
    let index = -1;
    for (let i = 0; i < infos.length; ++i) {
        if (id == infos[i].id) {
            index = i;
            break;
        }
    }
    return index;
};

jsonWebhooks._listeners = null;
jsonWebhooks.loadListeners = function () {
    debug('loadListeners()');
    if (!jsonWebhooks._listeners) {
        const webhooksDir = path.join(utils.getDynamicDir(), 'webhooks');
        const listenersFile = path.join(webhooksDir, jsonUtils.LISTENER_FILE);
        if (!fs.existsSync(listenersFile))
            jsonWebhooks._listeners = [];
        else
            jsonWebhooks._listeners = JSON.parse(fs.readFileSync(listenersFile, 'utf8'));
    }
    return jsonWebhooks._listeners;
};

jsonWebhooks.getListener = (listenerId) => {
    debug(`getListener(${listenerId})`);
    const listenerInfos = jsonWebhooks.loadListeners();
    const index = jsonWebhooks.getIndex(listenerInfos, listenerId);
    if (index < 0)
        return null;
    return listenerInfos[index];
};

jsonWebhooks.saveListeners = function (listenerInfos) {
    debug('saveListeners()');
    debug(listenerInfos);
    const webhooksDir = path.join(utils.getDynamicDir(), 'webhooks');
    const listenersFile = path.join(webhooksDir, jsonUtils.LISTENER_FILE);
    fs.writeFileSync(listenersFile, JSON.stringify(listenerInfos, null, 2), 'utf8');
    // Invalidate listeners.
    jsonWebhooks._listeners = null;
};

jsonWebhooks.loadEvents = function (listenerId) {
    debug('loadEvents(): ' + listenerId);
    const webhooksDir = path.join(utils.getDynamicDir(), 'webhooks');
    const eventsFile = path.join(webhooksDir, listenerId + '.json');
    if (!fs.existsSync(eventsFile))
        return [];
    return JSON.parse(fs.readFileSync(eventsFile, 'utf8'));
};

jsonWebhooks.saveEvents = function (listenerId, eventList) {
    debug('saveEvents(): ' + listenerId);
    const webhooksDir = path.join(utils.getDynamicDir(), 'webhooks');
    const eventsFile = path.join(webhooksDir, listenerId + '.json');
    fs.writeFileSync(eventsFile, JSON.stringify(eventList, null, 2), 'utf8');
};

// ===== UTILITIES =====

// // Currently not used
// jsonWebhooks.pendingEventsCount = function () {
//     var listeners = jsonWebhooks.loadListeners();
//     var eventCount = 0;
//     for (var i = 0; i < listeners.length; ++i) {
//         var events = jsonWebhooks.loadEvents(listeners[i].id);
//         eventCount = eventCount + events.length;
//     }
//     debug('pendingEventsCount() == ' + eventCount);
//     return eventCount;
// };

jsonWebhooks.lockAll = function () {
    debug('lockAll()');

    if (jsonUtils.hasGlobalLock()) {
        debug('global lock already set!');
        return false;
    }
    const lockList = [];
    const listenerList = jsonWebhooks.loadListeners();
    let success = true;
    let internalError = null;
    try {
        for (let i = 0; i < listenerList.length; ++i) {
            let listenerId = listenerList[i].id;
            if (!jsonUtils.lockEvents(listenerId)) {
                success = false;
                break;
            }
            lockList.push(listenerId);
        }
    } catch (err) {
        internalError = err;
        success = false;
    }
    if (!success) {
        for (let i = 0; i < lockList.length; ++i) {
            try { jsonUtils.unlockEvents(lockList[i]); } catch (err2) { debug(err2); error(err2); }
        }
    }
    if (internalError)
        throw internalError;

    return success;
};

jsonWebhooks.unlockAll = function () {
    debug('unlockAll()');
    const listenerList = jsonWebhooks.loadListeners();
    for (let i = 0; i < listenerList.length; ++i) {
        try { jsonUtils.unlockEvents(listenerList[i].id); } catch (err) { debug(err); error('webhooks.unlockAll: ' + err); }
    }
};

jsonWebhooks.upsertListenerSync = (listenerInfo) => {
    debug('upsertListenerSync()');
    const listenerId = listenerInfo.id;

    return jsonUtils.withLockedListeners(listenerId, function () {
        const listenerInfos = jsonWebhooks.loadListeners();

        const index = jsonWebhooks.getIndex(listenerInfos, listenerId);
        if (index < 0) {
            listenerInfos.push(listenerInfo);
            // Initialize to empty list
            jsonWebhooks.saveEvents(listenerId, []);
        } else {
            listenerInfos[index] = listenerInfo;
        }

        jsonWebhooks.saveListeners(listenerInfos);

        return listenerInfo;
    });
};

jsonWebhooks.deleteListenerSync = (listenerId) => {
    debug('deleteListenerSync()');
    return jsonUtils.withLockedListeners(listenerId, function () {
        const listenerInfos = jsonWebhooks.loadListeners();
        const index = jsonWebhooks.getIndex(listenerInfos, listenerId);
        if (index < 0)
            throw utils.makeError(404, 'Listener not found: ' + listenerId);
        const deletedListenerInfo = listenerInfos[index];
        listenerInfos.splice(index, 1);

        jsonWebhooks.saveListeners(listenerInfos);
        return deletedListenerInfo;
    });
};

jsonWebhooks.getEventsByListenerSync = (listenerId) => {
    debug('getEventsByListenerSync()');
    const listener = jsonWebhooks.getListener(listenerId);
    if (!listener)
        throw utils.makeError(404, 'Listener not found: ' + listenerId);
    const events = jsonWebhooks.loadEvents(listenerId);
    return events;
};

jsonWebhooks.flushEventsSync = (listenerId) => {
    debug('flushEventsSync()');
    const listener = jsonWebhooks.getListener(listenerId);
    if (!listener)
        throw utils.makeError(404, 'Listener not found: ' + listenerId);

    return jsonUtils.withLockedEvents(listenerId, function () {
        // Write empty event list
        jsonWebhooks.saveEvents(listenerId, []);
    });
};

jsonWebhooks.deleteEventSync = (listenerId, eventId) => {
    debug('deleteEventSync()');
    const listener = jsonWebhooks.getListener(listenerId);
    if (!listener)
        throw utils.makeError(404, 'Listener not found: ' + listenerId);

    return jsonUtils.withLockedEvents(listenerId, function () {
        const events = jsonWebhooks.loadEvents(listenerId);
        const index = jsonWebhooks.getIndex(events, eventId);
        if (index < 0)
            throw utils.makeError(404, 'Event not found: ' + eventId);

        events.splice(index, 1);

        jsonWebhooks.saveEvents(listenerId, events);
    });
};

jsonWebhooks.createLogSync = (eventData) => {
    debug('createLogSync()');
    const listenerList = jsonWebhooks.loadListeners();
    if (listenerList.length === 0)
        return; // Nothing to do

    let lockedAll = false;
    let err = null;
    try {
        if (!jsonWebhooks.lockAll()) {
            throw utils.makeError(423, 'webhooks.retryLog - lockAll failed.');
        }

        lockedAll = true;

        for (let i = 0; i < listenerList.length; ++i) {
            try {
                const listenerId = listenerList[i].id;
                const events = jsonWebhooks.loadEvents(listenerId);
                events.push(eventData);
                jsonWebhooks.saveEvents(listenerId, events);
            } catch (internalErr) {
                debug(internalErr);
                error('webhooks.logEvent: ' + internalErr);
                err = internalErr;
            }
        }
    } finally {
        if (lockedAll)
            jsonWebhooks.unlockAll();
    }
    if (err)
        throw err;
};

module.exports = jsonWebhooks;
