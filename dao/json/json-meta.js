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
        const dynDir = utils.getDynamicDir();
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
    const dynamicDir = utils.getDynamicDir();
    return path.join(dynamicDir, 'subscription_index');
}

function cleanupDirectory(dirName, callback) {
    debug('cleanupDirectory(): ' + dirName);
    try {
        let dynamicDir = utils.getDynamicDir();
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
        }
    ];
    try {
        let dynamicDir = utils.getDynamicDir();
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
                debug('Creating file ' + fileName + ' with empty array.');
                fs.writeFileSync(fileName, JSON.stringify([], null, 2), 'utf8');
            }
        }

        callback(null);
    } catch (err) {
        callback(err);
    }
}

function runMigrations(glob, callback) {
    debug('runMigrations()');
    return callback(null);


}

function getDynamicVersion(glob) {
    debug('getDynamicVersion()');
    
}

module.exports = jsonMeta;