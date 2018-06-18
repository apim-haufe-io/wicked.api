'use strict';

const { debug, info, warn, error } = require('portal-env').Logger('portal-api:dao:json:meta');
const fs = require('fs');
const path = require('path');

const utils = require('../../routes/utils');
const jsonUtils = require('./entities/json-utils');

const jsonMeta = function () { };

// =================================================
// DAO contract
// =================================================

jsonMeta.getInitChecks = () => {
    return [
        cleanupSubscriptionIndex,
        cleanupSubscriptionApiIndex,
        checkDynamicConfigDir,
        cleanupLockFiles,
        runMigrations,
    ];
};

// =================================================
// DAO implementation/internal methods
// =================================================

function cleanupDir(dir) {
    debug('cleanupDir(): ' + dir);
    var fileList = [];
    gatherLockFiles(dir, fileList);

    for (var i = 0; i < fileList.length; ++i) {
        debug('cleanupDir: Deleting ' + fileList[i]);
        fs.unlinkSync(fileList[i]);
    }
}

function gatherLockFiles(dir, fileList) {
    var fileNames = fs.readdirSync(dir);
    for (var i = 0; i < fileNames.length; ++i) {
        var fileName = path.join(dir, fileNames[i]);
        var stat = fs.statSync(fileName);
        if (stat.isDirectory())
            gatherLockFiles(fileName, fileList);
        if (stat.isFile()) {
            if (fileName.endsWith('.lock') &&
                !fileName.endsWith('global.lock')) {
                debug("Found lock file " + fileName);
                fileList.push(fileName);
            }
        }
    }
}

function cleanupLockFiles(glob, callback) {
    debug('cleanupLockFiles()');
    let error = null;
    try {
        const dynDir = jsonUtils.getDynamicDir();
        cleanupDir(dynDir);
        if (jsonUtils.hasGlobalLock())
            jsonUtils.globalUnlock();
        debug("checkForLocks() Done.");
    } catch (err) {
        error(err);
        error(err.stack);
        error = err;
    }
    callback(error);
}

// function hasLockFiles(app) {
//     debug('hasLockFiles()');
//     var fileList = [];
//     gatherLockFiles(app.get('dynamic_config'), fileList);
//     return (fileList.length > 0);
// };

function isExistingDir(dirPath) {
    if (!fs.existsSync(dirPath))
        return false;
    let dirStat = fs.statSync(dirPath);
    return dirStat.isDirectory();
}

function getSubscriptionIndexDir() {
    const dynamicDir = jsonUtils.getDynamicDir();
    return path.join(dynamicDir, 'subscription_index');
}

function cleanupDirectory(dirName, callback) {
    debug('cleanupDirectory(): ' + dirName);
    try {
        let dynamicDir = jsonUtils.getDynamicDir();
        if (!isExistingDir(dynamicDir))
            return callback(null); // We don't even have a dynamic dir yet; fine.
        let subIndexDir = path.join(dynamicDir, dirName);
        if (!isExistingDir(subIndexDir))
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

function cleanupSubscriptionIndex(glob, callback) {
    debug('cleanupSubscriptionIndex()');
    cleanupDirectory('subscription_index', callback);
}

function cleanupSubscriptionApiIndex(glob, callback) {
    debug('cleanupSubscriptionApiIndex()');
    cleanupDirectory('subscription_api_index', callback);
}

function checkDynamicConfigDir(glob, callback) {
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
        let dynamicDir = jsonUtils.getDynamicDir();
        if (!isExistingDir(dynamicDir)) {
            debug('Creating dynamic base directory ' + dynamicDir);
            fs.mkdirSync(dynamicDir);
        }

        for (let fileDescIndex in neededFiles) {
            let fileDesc = neededFiles[fileDescIndex];
            let subDir = path.join(dynamicDir, fileDesc.dir);
            if (!isExistingDir(subDir)) {
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

function getMetaFileName() {
    debug(`getMetaFileName()`);
    const dynamicDir = jsonUtils.getDynamicDir();
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

function loadMetaJson() {
    debug(`loadMetaJson()`);
    const metaFile = getMetaFileName();
    try {
        const metaJson = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
        return metaJson;
    } catch (err) {
        error(`loadMetaJson(): File ${metaFile} could either not be loaded or not be parsed as JSON.`);
        throw err;
    }
}

function saveMetaJson(metaJson) {
    debug(`saveMetaJson()`);
    debug(metaJson);
    const metaFile = getMetaFileName();
    fs.writeFileSync(metaFile, JSON.stringify(metaJson, null, 2), 'utf8');
}

function getDynamicVersion() {
    debug(`getDynamicVersion()`);

    const metaJson = loadMetaJson();
    if (metaJson.hasOwnProperty('dynamicVersion')) {
        const dynamicVersion = metaJson.dynamicVersion;
        debug(`getDynamicVersion(): Returns ${dynamicVersion}`);
        return dynamicVersion;
    }
    warn(`getDynamicVersion(): File meta/meta.json did not contain a "dynamicVersion" property.`);
    return 0;
}

function setDynamicVersion(newDynamicVersion) {
    debug(`setDynamicVersion(${newDynamicVersion})`);
    const metaJson = loadMetaJson();
    metaJson.dynamicVersion = newDynamicVersion;
    saveMetaJson(metaJson);
    return;
}

function findMaxIndex(o) {
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

function runMigrations(glob, callback) {
    debug('runMigrations()');

    const migrations = {
        1: nullMigration,
        // 2: migrateUsersToRegistrations_wicked1_0_0
    };

    const targetDynamicVersion = findMaxIndex(migrations);

    const currentVersion = getDynamicVersion();
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

function nullMigration() {
    debug(`nullMigration()`);
    return null;
}

function migrateUsersToRegistrations_wicked1_0_0() {
    debug(`migrateUsersToRegistrations_wicked1_0_0()`);
    return new Error('Not implemented');
}

module.exports = jsonMeta;