'use strict';

const { debug, info, warn, error } = require('portal-env').Logger('portal-api:dao');
const pgDao = require('./postgres/pg-dao');
const jsonDao = require('./json/json-dao');
const utils = require('../routes/utils');

const dao = () => { };

dao._impl = null;
dao.init = (app) => {
    debug('initialize()');

    // This is defined in the globals.json storage property
    const glob = utils.loadGlobals();
    let storageType = 'json';
    if (glob.storage && glob.storage.type)
        storageType = glob.storage.type;
    if (storageType === 'postgres') {
        // Postgres storage backend
        debug('DAO uses Postgres backing storage');
        pgDao.init(app);
        dao._impl = pgDao;
    } else {
        // JSON backing files
        debug('JSON backing storage');
        jsonDao.init(app);
        dao._impl = jsonDao;
    }
};

dao.meta = {
    getInitChecks: () => { return dao._impl.meta.getInitChecks(); },
    // init:              (glob, callback)                         => { dao._impl.meta.init(glob, callback); }
};

dao.users = {
    getById: (userId, callback) => { dao._impl.users.getById(userId, callback); },
    getByEmail: (email, callback) => { dao._impl.users.getByEmail(email, callback); },
    getByCustomId: (customId, callback) => { dao._impl.users.getByCustomId(customId, callback); },

    getShortInfoByEmail: (email, callback) => { dao._impl.users.getShortInfoByEmail(email, callback); },
    getShortInfoByCustomId: (customId, callback) => { dao._impl.users.getShortInfoByCustomId(customId, callback); },

    create: (userCreateInfo, callback) => { dao._impl.users.create(userCreateInfo, callback); },
    save: (userInfo, savingUserId, callback) => { dao._impl.users.save(userInfo, savingUserId, callback); },
    // patch:             (userId, userInfo, patchingUserId, callback) => { dao._impl.users.patch(userId, userInfo, patchingUserId, callback); },
    delete: (userId, deletingUserId, callback) => { dao._impl.users.delete(userId, deletingUserId, callback); },

    getIndex: (offset, limit, callback) => { dao._impl.users.getIndex(offset, limit, callback); },
    getCount: (callback) => { dao._impl.users.getCount(callback); }
};

dao.applications = {
    getById: (appId, callback) => { dao._impl.applications.getById(appId, callback); },

    create: (appCreateInfo, userInfo, callback) => { dao._impl.applications.create(appCreateInfo, userInfo, callback); },
    save: (appInfo, savingUserId, callback) => { dao._impl.applications.save(appInfo, savingUserId, callback); },
    // patch:             (appInfo, patchingUserId, callback) => { dao._impl.applications.patch(appInfo, patchingUserId, callback); },
    delete: (applicationId, deletingUserId, callback) => { dao._impl.applications.delete(applicationId, deletingUserId, callback); },

    getIndex: (offset, limit, callback) => { dao._impl.applications.getIndex(offset, limit, callback); },
    getCount: (callback) => { dao._impl.applications.getCount(callback); },

    getOwners: (appId, callback) => { dao._impl.applications.getOwners(appId, callback); },
    addOwner: (appId, userInfo, role, addingUserId, callback) => { dao._impl.applications.addOwner(appId, userInfo, role, addingUserId, callback); },
    deleteOwner: (appId, userEmail, deletingUserId, callback) => { dao._impl.applications.deleteOwner(appId, userEmail, deletingUserId, callback); }
};

dao.subscriptions = {
    getByAppId: (appId, callback) => { dao._impl.subscriptions.getByAppId(appId, callback); },
    getByClientId: (clientId, callback) => { dao._impl.subscriptions.getByClientId(clientId, callback); },
    getByAppAndApi: (appId, apiId, callback) => { dao._impl.subscriptions.getByAppAndApi(appId, apiId, callback); },
    getByApi: (apiId, offset, limit, callback) => { dao._impl.subscriptions.getByApi(apiId, offset, limit, callback); },

    create: (newSubscription, creatingUserId, callback) => { dao._impl.subscriptions.create(newSubscription, creatingUserId, callback); },
    delete: (appId, apiId, subscriptionId, callback) => { dao._impl.subscriptions.delete(appId, apiId, subscriptionId, callback); },
    patch: (appId, subsInfo, patchingUserId, callback) => { dao._impl.subscriptions.patch(appId, subsInfo, patchingUserId, callback); },

    // Legacy functionality
    legacyWriteSubsIndex: (app, subs) => { dao._impl.subscriptions.legacyWriteSubsIndex(app, subs); },
    legacySaveSubscriptionApiIndex: (apiId, subs) => { dao._impl.subscriptions.legacySaveSubscriptionApiIndex(apiId, subs); }
};

dao.approvals = {
    getAll: (callback) => { dao._impl.approvals.getAll(callback); },
    create: (approvalInfo, callback) => { dao._impl.approvals.create(approvalInfo, callback); },
    // This is only needed inside the JSON DAO, not for all DAOs.
    // deleteByApp: (appId, callback) => { dao._impl.approvals.deleteByApp(appId, callback); },
    deleteByAppAndApi: (appId, apiId, callback) => { dao._impl.approvals.deleteByAppAndApi(appId, apiId, callback); }
};

dao.verifications = {
    getAll: (callback) => { dao._impl.verifications.getAll(callback); },
    getById: (verificationId, callback) => { dao._impl.verifications.getById(verificationId, callback); },

    create: (verifInfo, callback) => { dao._impl.verifications.create(verifInfo, callback); },
    delete: (verificationId, callback) => { dao._impl.verifications.delete(verificationId, callback); },

    reconcile: (expirySeconds, callback) => { dao._impl.verifications.reconcile(expirySeconds, callback); },
};

dao.webhooks = {
    listeners: {
        getAll: (callback) => { dao._impl.webhooks.listeners.getAll(callback); },
        getById: (listenerId, callback) => { dao._impl.webhooks.listeners.getById(listenerId, callback); },

        upsert: (listenerInfo, callback) => { dao._impl.webhooks.listeners.upsert(listenerInfo, callback); },
        delete: (listenerId, callback) => { dao._impl.webhooks.listeners.delete(listenerId, callback); },
    },

    events: {
        hookListeners: (dispatchEvents, callback) => { dao._impl.webhooks.events.hookListeners(dispatchEvents, callback); },

        getByListener: (listenerId, callback) => { dao._impl.webhooks.events.getByListener(listenerId, callback); },
        getTotalCount: (callback) => { dao._impl.webhooks.events.getTotalCount(callback); },

        create: (eventData, callback) => { dao._impl.webhooks.events.create(eventData, callback); },
        delete: (listenerId, eventId, callback) => { dao._impl.webhooks.events.delete(listenerId, eventId, callback); },

        flush: (listenerId, callback) => { dao._impl.webhooks.events.flush(listenerId, callback); },
    }
};

dao.registrations = {
    getByPoolAndUser: (poolId, userId, callback) => { dao._impl.registrations.getByPoolAndUser(poolId, userId, callback); },
    getByPoolAndNamespace: (poolId, namespace, nameFilter, offset, limit, callback) => { dao._impl.registrations.getByPoolAndNamespace(poolId, namespace, nameFilter, offset, limit, callback); },
    getByUser: (userId, offset, limit, callback) => { dao._impl.registrations.getByUser(userId, offset, limit, callback); },

    upsert: (poolId, userId, userData, callback) => { dao._impl.registrations.upsert(poolId, userId, userData, callback); },
    delete: (poolId, userId, callback) => { dao._impl.registrations.delete(poolId, userId, callback); }
};

dao.grants = {
    getByApiAndUser: (apiId, userId, callback) => { dao._impl.grants.getByApiAndUser(apiId, userId, callback); },

    upsert: (apiId, userId, grants, callback) => { dao._impl.grant.upsert(apiId, userId, grants, callback); },
    delete: (apiId, userId, callback) => { dao._impl.grant.delete(apiId, userId, callback); }
};

module.exports = dao;
