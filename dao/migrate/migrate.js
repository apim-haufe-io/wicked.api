'use strict';

const async = require('async');
const ncp = require('ncp');
const rimraf = require('rimraf');
const fs = require('fs');

const { debug, info, warn, error } = require('portal-env').Logger('portal-api:dao:migrate');
const utils = require('../../routes/utils');
const JsonDao = require('../json/json-dao');
const PgDao = require('../postgres/pg-dao');

/*
{
    "wipeTarget": true,
    "source": {
        "type": "json"
        "config": {
            "basePath": "/Users/someuser/whatever/dynamic"
        }
    },
    "target": {
        "type": "postgres",
        "config": {
            "host": "localhost",
            "port": 5432,
            "user": "kong",
            "password": "kong"
        }
    }
}
*/

class DaoMigrator {

    constructor(migrationConfig) {
        debug('constructor()');
        this._config = migrationConfig;
        this.sanityCheckConfig();
        this._cleanupHooks = [];
        this._warnings = [];
        this._skippedSubscriptions = new Set();
    }

    // PUBLIC method

    migrate(callback) {
        debug('migrate()');
        const instance = this;
        this.migrateImpl((err) => {
            instance.cleanup(err, callback);
            instance.printWarnings();
        });
    }

    // IMPLEMENTATION DETAILS

    migrateImpl(callback) {
        debug('migrateImpl()');
        info('Starting Migration');
        utils.setMigrationMode(true);
        async.series({
            source: callback => this.createDao(this._config.source, false, callback),
            target: callback => this.createDao(this._config.target, this._config.wipeTarget, callback)
        }, (err, results) => {
            if (err)
                return callback(err);

            const sourceDao = results.source;
            const targetDao = results.target;

            return this.migrateEntities(sourceDao, targetDao, callback);
        });
    }

    cleanup(passthroughErr, callback) {
        debug('cleanup()');
        info('Cleaning up');
        async.eachSeries(this._cleanupHooks, (hook, callback) => hook(callback), (err) => {
            if (err)
                error(err);
            return callback(passthroughErr);
        });
    }

    hookCleanup(cleanupFunction) {
        this._cleanupHooks.push(cleanupFunction);
    }

    addSevereWarning(message, description, payload) {
        this._warnings.push({
            message,
            description,
            payload
        });
    }

    printWarnings() {
        for (let i = 0; i < this._warnings.length; ++i) {
            const w = this._warnings[i];
            error(`WARNING: ${w.message}`);
            error(w.description);
            if (w.payload)
                error(w.payload);
        }
    }

    migrateEntities(source, target, callback) {
        debug('migrateEntities()');

        const steps = [
            DaoMigrator.migrateUsers,
            DaoMigrator.migrateRegistrations,
            // DaoMigrator.migrateVerifications,
            DaoMigrator.migrateApplications,
            DaoMigrator.migrateSubscriptions,
            DaoMigrator.migrateApprovals
        ];

        const instance = this;
        buildDupeAppsSet(source, (err, dupeAppsSet) => {
            if (err)
                return callback(err);
            this._dupeAppsSet = dupeAppsSet;
            async.eachSeries(steps, (step, callback) => setImmediate(step, instance, source, target, callback), callback);
        });
    }

    static migrateUsers(instance, source, target, callback) {
        debug('migrateUsers()');
        info('Migrating Users');
        pagePerUser(source, (userId, callback) => DaoMigrator.migrateUser(source, target, userId, callback), callback);
    }

    static migrateUser(source, target, userId, callback) {
        debug(`migrateUser(${userId})`);
        source.users.getById(userId, (err, userInfo) => {
            if (err)
                return callback(err);
            info(`Migrating user ${userInfo.id}`);
            target.users.create(userInfo, callback);
        });
    }

    static migrateRegistrations(instance, source, target, callback) {
        debug('migrateRegistrations()');
        // We'll have to go by user here; no way of retrieving ALL registrations currently.
        pagePerUser(source, (userId, callback) => DaoMigrator.migrateRegistrationsForUser(source, target, userId, callback), callback);
    }

    static migrateRegistrationsForUser(source, target, userId, callback) {
        debug(`migrateRegistrationsForUser(${userId})`);
        info(`Migrating registrations for user ${userId}`);
        source.registrations.getByUser(userId, (err, userRegs) => {
            if (err)
                return callback(err);
            const poolArray = [];
            for (let poolId in userRegs.pools)
                poolArray.push(poolId);
            async.eachSeries(poolArray, (poolId, callback) => {
                const regInfo = userRegs.pools[poolId];
                debug(`Migrating registration for pool ${poolId} for user "${regInfo.name}" (${regInfo.userId})`);
                target.registrations.upsert(poolId, regInfo.userId, null, regInfo, callback);
            }, callback);
        });
    }

    // I don't think it really makes sense to migrate verifications; they expire
    // within one hour anyway.

    // static migrateVerifications(source, target, callback) {
    //     debug('migrateVerifications()');

    //     return callback(null);
    // }

    static migrateApplications(instance, source, target, callback) {
        debug('migrateApplications()');
        info('Migrating Applications');
        pagePerApplication(source, (appId, callback) => {
            info(`Migration application ${appId}`);
            DaoMigrator.migrateApplication(instance, source, target, appId, callback);
        }, callback);
    }

    static migrateApplication(instance, source, target, appId, callback) {
        source.applications.getById(appId, (err, appInfo) => {
            if (err)
                return callback(err);
            if (!appInfo) {
                warn(`migrateApplication: Could not load application with id ${appId}`);
                return callback(null);
            }
            debug(appInfo);
            // This thing also contains the owners, so let's add those as well afterwards.
            const ownerList = appInfo.owners;
            // But first add the app without owners
            appInfo.owners = [];
            if (instance._dupeAppsSet.has(appInfo.id)) {
                warn(`migrationApplication: Skipping migration of duplicate application ${appInfo.id}`);
                instance.addSevereWarning(`APPLICATION: Migration of "${appInfo.id}" was skipped, as it is duplicate.`,
                    'Such applications are not migrated at all, as the subscriptions may under certain circumstances have been mixed up. This requires action from your side; you will need to contact the owner of the application (see owner list)',
                    ownerList);
            }
            appInfo.id = appInfo.id.toLowerCase();
            target.applications.create(appInfo, null, (err, _) => {
                if (err)
                    return callback(err);

                // And now we add the owners
                async.eachSeries(ownerList, (ownerInfo, callback) => {
                    if (err)
                        return callback(err);
                    target.applications.addOwner(appInfo.id, ownerInfo.userId, ownerInfo.role, appInfo.changedBy, callback);
                }, callback);
            });
        });
    }

    static migrateSubscriptions(instance, source, target, callback) {
        debug('migrateSubscriptions()');
        info('Migrating Subscriptions');
        pagePerApplication(source, (appId, callback) => DaoMigrator.migrateSubscriptionsForApplication(instance, source, target, appId, callback), callback);
    }

    static migrateSubscriptionsForApplication(instance, source, target, appId, callback) {
        debug(`migrateSubscriptionsForApplication(${appId})`);
        source.subscriptions.getByAppId(appId, (err, subsInfoList) => {
            debug(subsInfoList);
            async.eachSeries(subsInfoList, (subsInfo, callback) => {
                if (instance._dupeAppsSet.has(subsInfo.application)) {
                    warn(`migrateSubscriptionsForApplication: Skipping dupe application ${subsInfo.application}`);
                    instance.addSevereWarning(`SUBSCRIPTIONS: Skipping subscription to API ${subsInfo.api} for application ${subsInfo.application}`,
                        'The migration has detected a subscription to an API for an application which is duplicate. These subscriptions will NOT have been migrated. See above for a list of duplicate applications.');
                    instance._skippedSubscriptions.add(subsInfo.id);
                    return callback(null);
                }
                subsInfo.application = subsInfo.application.toLowerCase();
                info(`Migrating subscription to API ${subsInfo.api} for application ${subsInfo.application}`);
                if (err)
                    return callback(err);
                target.subscriptions.create(subsInfo, subsInfo.changedBy, callback);
            }, callback);
        });
    }

    static migrateApprovals(instance, source, target, callback) {
        debug('migrateApprovals()');
        info('Migrating Approvals');
        // The approvals endpoint does not support paging
        source.approvals.getAll((err, approvalList) => {
            if (err)
                return callback(err);

            async.eachSeries(approvalList, (approvalInfo, callback) => {
                if (instance._skippedSubscriptions.has(approvalInfo.subscriptionId)) {
                    warn(`Skipped approval records for subscription ${approvalInfo.subscriptionId} (application ${approvalInfo.application.id})`);
                    return callback(null);
                }
                target.approvals.create(approvalInfo, callback);
            }, callback);
        });
    }

    sanityCheckConfig() {
        debug('sanityCheckConfig()');
        const c = this._config;
        if (!c.source)
            throw new Error('configuration does not contain a "source" property.');
        if (!c.target)
            throw new Error('configuration does not contain a "target" property.');
        this.validateDaoConfig(c.source);
        this.validateDaoConfig(c.target);
    }

    validateDaoConfig(c) {
        debug('validateDaoConfig()');
        if (c.type === 'json')
            return this.validateJsonConfig(c);
        else if (c.type === 'postgres')
            return this.validatePostgresConfig(c);
        throw new Error(`validateDaoConfig: unknown DAO type ${c.type}`);
    }

    validateJsonConfig(c) {
        debug('validateJsonConfig()');
        if (!c.config || !c.config.basePath)
            throw new Error('JSON configuration does not contain a "config" or "config.basePath" property.');
    }

    validatePostgresConfig(c) {
        debug('validatePostgresConfig()');
        if (!c.config)
            throw new Error('Postgres configuration does not contain a "config" property.');
        if (!c.config.host)
            throw new Error('Postgres configuration does not contain a "config.host" property.');
        if (!c.config.port)
            throw new Error('Postgres configuration does not contain a "config.port" property.');
        if (!c.config.user)
            throw new Error('Postgres configuration does not contain a "config.user" property.');
        if (!c.config.password)
            throw new Error('Postgres configuration does not contain a "config.password" property.');
    }

    createDaoByType(config, callback) {
        if (config.type === 'json')
            return this.createJsonDao(config, callback);
        else if (config.type === 'postgres')
            return this.createPostgresDao(config, callback);
        return callback(new Error(`Unknown DAO type ${config.type}`));
    }

    createDao(config, wipeDao, callback) {
        debug('createDao()');
        this.createDaoByType(config, (err, dao) => {
            if (err)
                return callback(err);

            const wipeIfNecessary = (_, callback) => {
                debug('wipeIfNecessary()');
                if (wipeDao)
                    return dao.meta.wipe(callback);
                debug('wipeIfNecessary(): Not necessary');
                return callback(null);
            };

            const initChecks = dao.meta.getInitChecks();
            const checks = [wipeIfNecessary, ...initChecks];

            async.eachSeries(checks, (check, callback) => check(null, callback), (err) => {
                if (err)
                    return callback(err);
                info(`Successfully created ${config.type} DAO.`);
                return callback(null, dao);
            });
        });
    }

    createJsonDao(daoConfig, callback) {
        debug('createJsonDao()');
        // Make a copy of the original first, and then work off that; clean up the copy post-fact
        const tmpDir = fs.mkdtempSync('wicked_migration');
        debug(`createJsonDao(): Using tmp dir ${tmpDir}`);
        this.hookCleanup((callback) => {
            debug(`cleanupJsonDao(): Cleaning up ${tmpDir}`);
            rimraf(tmpDir, callback);
        });
        ncp(daoConfig.config.basePath, tmpDir, (err) => {
            if (err)
                return callback(err);
            debug(`createJsonDao(): Successfully copied files to ${tmpDir}`);
            return callback(null, new JsonDao(tmpDir));
        });
    }

    createPostgresDao(daoConfig, callback) {
        return callback(null, new PgDao(daoConfig.config));
    }
}

const LIMIT = 5;

function page(count, iterator, callback) {
    debug(`page(${count})`);
    const iterations = Math.ceil(count / LIMIT);
    debug(`page() will call iterator ${iterations} times.`);
    async.timesSeries(iterations, (n, callback) => {
        const offset = n * LIMIT;
        let limit = LIMIT;
        if (count - offset < LIMIT)
            limit = count - offset;
        debug(`page(offset: ${offset}, limit: ${limit})`);
        return iterator(offset, limit, callback);
    }, callback);
}

function pagePerUser(source, iterator, callback) {
    debug(`pagePerUser()`);
    source.users.getCount((err, userCount) => {
        if (err)
            return callback(null);
        debug(`User count: ${userCount}`);

        const dupeMap = new Set();

        page(userCount, (offset, limit, callback) => {
            source.users.getIndex(offset, limit, (err, userIndex) => {
                if (err)
                    return callback(err);
                async.eachSeries(userIndex, (userInfo, callback) => {
                    if (dupeMap.has(userInfo.id)) {
                        warn(`pagePerUser(): Detected duplicate user id ${userInfo.id} in index, skipping.`);
                        return callback(null);
                    }
                    dupeMap.add(userInfo.id);
                    return iterator(userInfo.id, callback);
                }, callback);
            });
        }, callback);
    });
}

function pagePerApplication(source, iterator, callback) {
    debug(`pagePerApplication()`);
    source.applications.getCount((err, appCount) => {
        if (err)
            return callback(err);
        debug(`Application count: ${appCount}`);

        const dupeMap = new Set();
        page(appCount, (offset, limit, callback) => {
            source.applications.getIndex(offset, limit, (err, appIndex) => {
                if (err)
                    return callback(err);
                async.eachSeries(appIndex, (appInfo, callback) => {
                    const lowerAppId = appInfo.id.toLowerCase();
                    if (dupeMap.has(lowerAppId)) {
                        warn(`Detected duplicate Application id ${appInfo.id} in index, skipping`);
                        return callback(null);
                    }
                    dupeMap.add(lowerAppId);
                    return iterator(appInfo.id, callback);
                }, callback);
            });
        }, callback);
    });
}

function buildDupeAppsSet(source, callback) {
    source.applications.getCount((err, appCount) => {
        if (err)
            return callback(err);
        debug(`Application count: ${appCount}`);

        const appMap = new Map();
        const dupeMap = new Set();
        page(appCount, (offset, limit, callback) => {
            source.applications.getIndex(offset, limit, (err, appIndex) => {
                if (err)
                    return callback(err);
                for (let i = 0; i < appIndex.length; ++i) {
                    const appId = appIndex[i].id;
                    const a = appIndex[i].id.toLowerCase();
                    if (appMap.has(a)) {
                        const aa = appMap.get(a);
                        warn(`buildDupeMap: Found duplicate application ID ${appId} (also as ${aa})`);
                        dupeMap.add(appId);
                        dupeMap.add(aa);
                        continue;
                    }
                    appMap.set(a, appId);
                }
                return callback(null);
            });
        }, (err) => {
            if (err)
                return callback(err);
            return callback(null, dupeMap);
        });
    });
}

module.exports = DaoMigrator;