'use strict';

const async = require('async');
const { debug, info, warn, error } = require('portal-env').Logger('portal-api:dao:pg:webhooks');

const utils = require('../../../routes/utils');
const daoUtils = require('../../dao-utils');
const pgUtils = require('../pg-utils');

const pgWebhooks = () => { };

// =================================================
// DAO contract
// =================================================

pgWebhooks.listeners = {};

pgWebhooks.listeners.getAll = (callback) => {
    debug('getAll()');
    pgUtils.checkCallback(callback);
    return getAllListenersImpl(callback);
};

pgWebhooks.listeners.getById = (listenerId, callback) => {
    debug(`getById(${listenerId})`);
    pgUtils.checkCallback(callback);
    return pgUtils.getById('webhook_listeners', listenerId, callback);
};

pgWebhooks.listeners.upsert = (listenerInfo, callback) => {
    debug('upsert()');
    pgUtils.checkCallback(callback);
    return pgUtils.upsert('webhook_listeners', listenerInfo, null, callback);
};

pgWebhooks.listeners.delete = (listenerId, callback) => {
    debug(`delete(${listenerId})`);
    pgUtils.checkCallback(callback);
    return pgUtils.deleteById('webhook_listeners', listenerId, callback);
};

pgWebhooks.events = {};

pgWebhooks.events.hookListeners = (dispatchEvents, callback) => {
    debug('hookListeners()');
    return hookListenersImpl(dispatchEvents, callback);
};

pgWebhooks.events.getByListener = (listenerId, callback) => {
    debug(`getByListener(${listenerId})`);
    pgUtils.checkCallback(callback);
    return pgUtils.getBy('webhook_events', 'webhook_listeners_id', listenerId, callback);
};

pgWebhooks.events.flush = (listenerId, callback) => {
    debug(`flush(${listenerId})`);
    pgUtils.checkCallback(callback);
    return pgUtils.deleteBy('webhook_events', 'webhook_listeners_id', listenerId, callback);
};

pgWebhooks.events.create = (eventData, callback) => {
    debug(`create()`);
    pgUtils.checkCallback(callback);
    return createImpl(eventData, callback);
};

pgWebhooks.events.delete = (listenerId, eventId, callback) => {
    debug(`delete(${listenerId}, ${eventId})`);
    pgUtils.checkCallback(callback);
    return pgUtils.deleteById('webhook_events', eventId, callback);
};


// =================================================
// DAO implementation/internal methods
// =================================================

function getAllListenersImpl(callback) {
    debug('getAllListenersImpl()');
    return pgUtils.getBy('webhook_listeners', [], [], callback);    
}

function createImpl(eventData, callback) {
    debug('createImpl()');
    pgUtils.withTransaction((err, client, callback) => {
        getAllListenersImpl((err, listenerList) => {
            if (err)
                return callback(err);
            async.forEach(listenerList, (listenerInfo, callback) => {
                const tmpEvent = Object.assign({}, eventData);
                // Each record needs its own ID, not like in the JSON implementation where
                // the ID is reused across the listeners.
                tmpEvent.id = utils.createRandomId();
                tmpEvent.listenerId = listenerInfo.id;
                pgUtils.upsert('webhook_events', tmpEvent, null, callback);
            }, (err) => {
                if (err)
                    return callback(err);
                debug('Successfully upserted events for all listeners.');
                return callback(null);
            });
        });
    }, callback);
}

let _eventsPending = false;
let _lastDispatch = 0;
function hookListenersImpl(dispatchEvents, callback) {
    debug('hookListenersImpl()');
    pgUtils.listenToChannel('webhook_insert', (data) => {
        debug('Received a pending event, queueing...');
        _eventsPending = true;
    });
    setInterval(() => {
        let safetyDispatch = false;
        if (Date.now() - _lastDispatch > 10000) {
            debug('safety dispatch of webhook events');
            // Safety check, every ten seconds dispatch anyway.
            safetyDispatch = true;
        }
        if (_eventsPending || safetyDispatch) {
            if (_eventsPending)
                debug('detected pending webhook events, firing dispatcher');
            _lastDispatch = Date.now();
            _eventsPending = false;
            dispatchEvents((err) => {
                if (err) {
                    error('ERROR dispatching webhook events');
                    error(err);
                    return;
                }
            });
        }
    }, 250);
    if (callback)
        return callback(null);
}

module.exports = pgWebhooks;
