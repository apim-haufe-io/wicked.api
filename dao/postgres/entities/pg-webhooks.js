'use strict';

const async = require('async');
const debug = require('debug')('portal-api:dao:pg:webhooks');

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

module.exports = pgWebhooks;
