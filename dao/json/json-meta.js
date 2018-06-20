'use strict';

const { debug, info, warn, error } = require('portal-env').Logger('portal-api:dao:json:meta');
const fs = require('fs');
const path = require('path');
const rimraf = require('rimraf');

class JsonMeta {

    constructor(jsonUtils) {
        this.jsonUtils = jsonUtils;
    }

    // =================================================
    // DAO contract
    // =================================================

    getInitChecks() {
        const instance = this;
        return [
            (glob, callback) => instance.cleanupSubscriptionIndex(glob, callback),
            (glob, callback) => instance.cleanupSubscriptionApiIndex(glob, callback),
            (glob, callback) => instance.checkDynamicConfigDir(glob, callback),
            (glob, callback) => instance.cleanupLockFiles(glob, callback),
            (glob, callback) => instance.runMigrations(glob, callback),
        ];
    }

    wipe(callback) {
        debug('wipe()');
        return this.wipeImpl(callback);
    }

    // =================================================
    // DAO implementation/internal methods
    // =================================================

    wipeImpl(callback) {
        debug('wipeImpl()');
        const basePath = this.jsonUtils.getDynamicDir();
        rimraf(basePath, callback);
    }

    cleanupDir(dir) {
        debug('cleanupDir(): ' + dir);
        var fileList = [];
        this.gatherLockFiles(dir, fileList);

        for (var i = 0; i < fileList.length; ++i) {
            debug('cleanupDir: Deleting ' + fileList[i]);
            fs.unlinkSync(fileList[i]);
        }
    }

    gatherLockFiles(dir, fileList) {
        var fileNames = fs.readdirSync(dir);
        for (var i = 0; i < fileNames.length; ++i) {
            var fileName = path.join(dir, fileNames[i]);
            var stat = fs.statSync(fileName);
            if (stat.isDirectory())
                this.gatherLockFiles(fileName, fileList);
            if (stat.isFile()) {
                if (fileName.endsWith('.lock') &&
                    !fileName.endsWith('global.lock')) {
                    debug("Found lock file " + fileName);
                    fileList.push(fileName);
                }
            }
        }
    }

    cleanupLockFiles(glob, callback) {
        debug('cleanupLockFiles()');
        let error = null;
        try {
            const dynDir = this.jsonUtils.getDynamicDir();
            this.cleanupDir(dynDir);
            if (this.jsonUtils.hasGlobalLock())
                this.jsonUtils.globalUnlock();
            debug("checkForLocks() Done.");
        } catch (err) {
            error(err);
            error(err.stack);
            error = err;
        }
        callback(error);
    }

    isExistingDir(dirPath) {
        if (!fs.existsSync(dirPath))
            return false;
        let dirStat = fs.statSync(dirPath);
        return dirStat.isDirectory();
    }

    cleanupDirectory(dirName, callback) {
        debug('cleanupDirectory(): ' + dirName);
        try {
            let dynamicDir = this.jsonUtils.getDynamicDir();
            if (!this.isExistingDir(dynamicDir))
                return callback(null); // We don't even have a dynamic dir yet; fine.
            let subIndexDir = path.join(dynamicDir, dirName);
            if (!this.isExistingDir(subIndexDir))
                return callback(null); // We don't have that directory yet, that's fine

            // Now we know we have a dirName directory.
            // Let's kill all files in there, as we'll rebuild this index anyway.
            let filenameList = fs.readdirSync(subIndexDir);
            for (let i = 0; i < filenameList.length; ++i) {
                const filename = path.join(subIndexDir, filenameList[i]);
                fs.unlinkSync(filename);
            }
            callback(null);
        } catch (err) {
            callback(err);
        }
    }

    cleanupSubscriptionIndex(glob, callback) {
        debug('cleanupSubscriptionIndex()');
        this.cleanupDirectory('subscription_index', callback);
    }

    cleanupSubscriptionApiIndex(glob, callback) {
        debug('cleanupSubscriptionApiIndex()');
        this.cleanupDirectory('subscription_api_index', callback);
    }

    checkDynamicConfigDir(glob, callback) {
        debug('checkDynamicConfigDir()');

        const neededFiles = [
            {
                dir: 'applications',
                file: '_index.json'
            },
            {
                dir: 'approvals',
                file: '_index.json'
            },
            {
                dir: 'subscriptions',
                file: 'dummy'
            },
            {
                dir: 'subscription_index',
                file: 'dummy'
            },
            {
                dir: 'subscription_api_index',
                file: 'dummy'
            },
            {
                dir: 'users',
                file: '_index.json'
            },
            {
                dir: 'registrations',
                file: 'dummy'
            },
            {
                dir: 'verifications',
                file: '_index.json'
            },
            {
                dir: 'webhooks',
                file: '_listeners.json'
            },
            {
                dir: 'grants',
                file: 'dummy'
            },
            {
                dir: 'meta',
                file: 'meta.json',
                content: { dynamicVersion: 0 }
            }
        ];
        try {
            let dynamicDir = this.jsonUtils.getDynamicDir();
            if (!this.isExistingDir(dynamicDir)) {
                debug('Creating dynamic base directory ' + dynamicDir);
                fs.mkdirSync(dynamicDir);
            }

            for (let fileDescIndex in neededFiles) {
                let fileDesc = neededFiles[fileDescIndex];
                let subDir = path.join(dynamicDir, fileDesc.dir);
                if (!this.isExistingDir(subDir)) {
                    debug('Creating dynamic directory ' + fileDesc.dir);
                    fs.mkdirSync(subDir);
                }
                let fileName = path.join(subDir, fileDesc.file);
                if (!fs.existsSync(fileName)) {
                    if (!fileDesc.content) {
                        debug('Creating file ' + fileName + ' with empty array.');
                        fs.writeFileSync(fileName, JSON.stringify([], null, 2), 'utf8');
                    } else {
                        debug('Creating file ' + fileName + ' with predefined content.');
                        fs.writeFileSync(fileName, JSON.stringify(fileDesc.content, null, 2), 'utf8');
                    }
                }
            }

            callback(null);
        } catch (err) {
            callback(err);
        }
    }

    getMetaFileName() {
        debug(`getMetaFileName()`);
        const dynamicDir = this.jsonUtils.getDynamicDir();
        const metaDir = path.join(dynamicDir, 'meta');
        const metaFile = path.join(metaDir, 'meta.json');
        if (!fs.existsSync(metaDir)) {
            throw new Error(`JSON DAO: Directory "meta" does not exist, expected ${metaDir}`);
        }
        if (!fs.existsSync(metaFile)) {
            throw new Error(`JSON DAO: File "meta.json" does not exist, expected ${metaFile}`);
        }

        return metaFile;
    }

    loadMetaJson() {
        debug(`loadMetaJson()`);
        const metaFile = this.getMetaFileName();
        try {
            const metaJson = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
            return metaJson;
        } catch (err) {
            error(`loadMetaJson(): File ${metaFile} could either not be loaded or not be parsed as JSON.`);
            throw err;
        }
    }

    saveMetaJson(metaJson) {
        debug(`saveMetaJson()`);
        debug(metaJson);
        const metaFile = this.getMetaFileName();
        fs.writeFileSync(metaFile, JSON.stringify(metaJson, null, 2), 'utf8');
    }

    getDynamicVersion() {
        debug(`getDynamicVersion()`);

        const metaJson = this.loadMetaJson();
        if (metaJson.hasOwnProperty('dynamicVersion')) {
            const dynamicVersion = metaJson.dynamicVersion;
            debug(`getDynamicVersion(): Returns ${dynamicVersion}`);
            return dynamicVersion;
        }
        warn(`getDynamicVersion(): File meta/meta.json did not contain a "dynamicVersion" property.`);
        return 0;
    }

    setDynamicVersion(newDynamicVersion) {
        debug(`setDynamicVersion(${newDynamicVersion})`);
        const metaJson = this.loadMetaJson();
        metaJson.dynamicVersion = newDynamicVersion;
        this.saveMetaJson(metaJson);
        return;
    }

    static findMaxIndex(o) {
        let maxIndex = -1;
        for (let key in o) {
            let thisIndex = -1;
            try {
                thisIndex = Number.parseInt(key);
            } catch (err) {
                error(`findMaxIndex(): Key ${key} could not be parsed as an int (Number.parseInt())`);
                throw err;
            }
            if (thisIndex === 0)
                throw new Error(`findMaxIndex(): Key ${key} was parsed to int value 0; this must not be correct.`);
            if (thisIndex > maxIndex)
                maxIndex = thisIndex;
        }
        if (maxIndex === -1)
            throw new Error('findMaxIndex: Given object does not contain any valid indexes');
        return maxIndex;
    }

    // ==============================================

    runMigrations(glob, callback) {
        debug('runMigrations()');

        const instance = this;
        const migrations = {
            1: () => instance.nullMigration(),
            // 2: migrateUsersToRegistrations_wicked1_0_0
        };

        const targetDynamicVersion = JsonMeta.findMaxIndex(migrations);

        const currentVersion = this.getDynamicVersion();
        if (currentVersion < targetDynamicVersion) {
            info(`Current dynamic data version is ${currentVersion}, target is ${targetDynamicVersion}. Attempting to run migrations.`);

            for (let v = currentVersion + 1; v <= targetDynamicVersion; ++v) {
                info(`Running dynamic migration to version ${v}`);

                if (!migrations[v])
                    throw new Error(`Dynamic version migration step ${v} was not found.`);

                const err = migrations[v]();
                if (!err) {
                    info(`Dynamic migration to version ${v} succeeded.`);
                } else {
                    error(`Dynamic migration to version ${v} FAILED.`);
                    error(err);
                    throw err;
                }
            }
        }

        return callback(null);
    }

    nullMigration() {
        debug(`nullMigration()`);
        return null;
    }

    migrateUsersToRegistrations_wicked1_0_0() {
        debug(`migrateUsersToRegistrations_wicked1_0_0()`);
        return new Error('Not implemented');
    }
}

module.exports = JsonMeta;