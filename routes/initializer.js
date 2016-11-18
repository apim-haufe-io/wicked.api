'use strict';

var fs = require('fs');
var path = require('path');
var debug = require('debug')('portal-api:initializer');
var bcrypt = require('bcrypt-nodejs');
var async = require('async');

var utils = require('./utils');
var users = require('./users');
var applications = require('./applications');
var subscriptions = require('./subscriptions');

var initializer = function () { };

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

function cleanupLockFiles(app, glob, callback) {
    debug('cleanupLockFiles()');
    let error = null;
    try {
        const dynDir = app.get('dynamic_config');
        cleanupDir(dynDir);
        if (utils.hasGlobalLock(app))
            utils.globalUnlock(app);
        debug("checkForLocks() Done.");
    } catch (err) {
        console.error(err);
        console.error(err.stack);
        error = err;
    }
    callback(error);
}

initializer.hasLockFiles = function (app) {
    debug('hasLockFiles()');
    var fileList = [];
    gatherLockFiles(app.get('dynamic_config'), fileList);
    return (fileList.length > 0);
};

initializer.checkDynamicConfig = function (app, callback) {
    debug('checkDynamicConfig()');

    var glob = utils.loadGlobals(app);

    var checks = [
        cleanupSubscriptionIndex,
        cleanupSubscriptionApiIndex,
        checkDynamicConfigDir,
        cleanupLockFiles,
        addInitialUsers,
        checkApiPlans,
        checkSubscriptions
    ];

    async.mapSeries(checks,
        function (checkFunction, callback) {
            // Make sure we're async.
            process.nextTick(function () {
                checkFunction(app, glob, callback);
            });
        },
        function (err, results) {
            var checkResults = [];
            for (var i = 0; i < results.length; ++i) {
                if (results[i]) {
                    for (var j = 0; j < results[i].length; ++j)
                        checkResults.push(results[i][j]);
                }
            }
            if (checkResults.length === 0)
                checkResults = null;
            callback(err, checkResults);
        });
};

function isExistingDir(dirPath) {
    if (!fs.existsSync(dirPath))
        return false;
    let dirStat = fs.statSync(dirPath);
    return dirStat.isDirectory();
}

function getSubscriptionIndexDir(app) {
    const dynamicDir = utils.getDynamicDir(app);
    return path.join(dynamicDir, 'subscription_index');
}

function cleanupDirectory(app, dirName, callback) {
    debug('cleanupDirectory(): ' + dirName);
    try {
        let dynamicDir = utils.getDynamicDir(app);
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

function cleanupSubscriptionIndex(app, glob, callback) {
    debug('cleanupSubscriptionIndex()');
    cleanupDirectory(app, 'subscription_index', callback);
}

function cleanupSubscriptionApiIndex(app, glob, callback) {
    debug('cleanupSubscriptionApiIndex()');
    cleanupDirectory(app, 'subscription_api_index', callback);
}

function checkDynamicConfigDir(app, glob, callback) {
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
            dir: 'verifications',
            file: '_index.json'
        },
        {
            dir: 'webhooks',
            file: '_listeners.json'
        }
    ];
    try {
        let dynamicDir = utils.getDynamicDir(app);
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

function addInitialUsers(app, glob, callback) {
    debug('addInitialUsers()');
    var error = null;
    try {
        if (!glob.initialUsers) {
            debug('Global config does not contain initial users.');
            return;
        }

        var userIndex = users.loadUserIndex(app);
        var doneSomething = false;
        for (var i = 0; i < glob.initialUsers.length; ++i) {
            var thisUser = glob.initialUsers[i];
            var userInfo = users.loadUser(app, glob.initialUsers[i].id);
            if (userInfo) {
                debug('User "' + thisUser.email + "' already exists.");
                continue;
            }
            doneSomething = true;
            debug('Creating user "' + thisUser.email + '".');
            const indexEntry = {
                id: thisUser.id,
                name: thisUser.firstName + ' ' + thisUser.lastName,
                email: thisUser.email.toLowerCase()
            };
            // Allow predefined custom IDs, e.g. for immediate GitHub user admins
            if (thisUser.customId)
                indexEntry.customId = thisUser.customId;

            userIndex.push(indexEntry);

            if (thisUser.password) {
                if (!thisUser.customId)
                    thisUser.password = bcrypt.hashSync(thisUser.password);
                else
                    console.error('Initial user with ID ' + thisUser.id + ' has both password and customId; password NOT added.');
            }
            thisUser.applications = [];
            thisUser.validated = true;

            users.saveUser(app, thisUser, '1');
        }
        if (doneSomething)
            users.saveUserIndex(app, userIndex);
    } catch (err) {
        console.error(err);
        console.error(err.stack);
        error = err;
    }

    callback(error);
}

function checkApiPlans(app, glob, callback) {
    debug('checkApiPlans()');
    var error = null;
    var messages = [];
    try {
        var apis = utils.loadApis(app);
        var plans = utils.loadPlans(app);

        var planMap = buildPlanMap(plans);

        for (var i = 0; i < apis.apis.length; ++i) {
            var api = apis.apis[i];
            for (var p = 0; p < api.plans.length; ++p) {
                if (!planMap[api.plans[p]])
                    messages.push('checkApiPlans: API "' + api.id + '" refers to an unknown plan: "' + api.plans[i] + '".');
            }
        }
    } catch (err) {
        console.error(err);
        console.error(err.stack);
        error = err;
    }

    var resultMessages = null;
    if (messages.length > 0)
        resultMessages = messages;
    callback(error, resultMessages);
}

function checkSubscriptions(app, glob, callback) {
    debug('checkSubscriptions()');
    let error = null;
    const messages = [];
    try {
        const apis = utils.loadApis(app);
        const plans = utils.loadPlans(app);

        const apiMap = buildApiMap(apis);
        const planMap = buildPlanMap(plans);

        const apps = applications.loadAppsIndex(app);

        // Closures are perversly useful.
        const check = function (subsCheck, subs) {
            for (var i = 0; i < subs.length; ++i) {
                var msg = subsCheck(apiMap, planMap, subs[i]);
                if (msg)
                    messages.push(msg);
            }
        };

        const subsIndexDir = getSubscriptionIndexDir(app);

        for (let i = 0; i < apps.length; ++i) {
            const thisApp = apps[i];
            const subs = subscriptions.loadSubscriptions(app, thisApp.id);
            check(thatPlanIsValid, subs);
            check(thatApiIsValid, subs);
            check(thatApiPlanIsValid, subs);
            check(thatApiIndexIsWritten, subs);
            writeSubsIndex(app, subsIndexDir, thisApp, subs);
        }

        // Finish by writing the API to Application index
        for (let i = 0; i < apis.apis.length; ++i) {
            const thisApi = apis.apis[i];
            subscriptions.saveSubscriptionApiIndex(app, thisApi.id, thisApi.subscriptions);
            delete thisApi.subscriptions;
        }
    } catch (err) {
        console.error(err);
        console.error(err.stack);
        error = err;
    }

    var resultMessages = null;
    if (messages.length > 0)
        resultMessages = messages;
    callback(error, resultMessages);
}

function buildApiMap(apis) {
    var apiMap = {};
    for (var i = 0; i < apis.apis.length; ++i) {
        var api = apis.apis[i];
        // We'll fill this below.
        api.subscriptions = [];
        apiMap[api.id] = api;
    }
    return apiMap;
}

function buildPlanMap(plans) {
    var planMap = {};
    for (var i = 0; i < plans.plans.length; ++i) {
        var plan = plans.plans[i];
        planMap[plan.id] = plan;
    }
    return planMap;
}

function thatPlanIsValid(apis, plans, sub) {
    if (plans[sub.plan])
        return null;
    return 'PlanIsValid: Application "' + sub.application + '" has a subscription to invalid plan "' + sub.plan + '" for API "' + sub.api + '".';
}

function thatApiIsValid(apis, plans, sub) {
    if (apis[sub.api])
        return null;
    return 'ApiIsValid: Application "' + sub.application + '" has a subscription to invalid API "' + sub.api + '".';
}

function thatApiPlanIsValid(apis, plans, sub) {
    if (!apis[sub.api] || !plans[sub.plan])
        return null; // This is covered by the above two
    var found = false;
    var api = apis[sub.api];
    for (var i = 0; i < api.plans.length; ++i) {
        if (api.plans[i] == sub.plan)
            found = true;
    }
    if (found)
        return null;
    return 'ApiPlanIsValid: Application "' + sub.application + '" has a subscription to an invalid API Plan (plan not part of API "' + sub.api + '"): "' + sub.plan + '".';
}

function thatApiIndexIsWritten(apis, plans, sub) {
    if (!apis[sub.api] || !plans[sub.plan])
        return null; // Shouldn't be possible
    const api = apis[sub.api];
    api.subscriptions.push({
        application: sub.application,
        plan: sub.plan
    });
    return null;
}

function writeSubsIndex(app, subsIndexDir, thisApp, subs) {
    for (var i = 0; i < subs.length; ++i) {
        const thisSub = subs[i];
        // Write subs index by client ID
        if (!thisSub.clientId)
            continue;
        const clientId = thisSub.clientId;
        const fileName = path.join(subsIndexDir, clientId + '.json');
        fs.writeFileSync(fileName, JSON.stringify({
            application: thisSub.application,
            api: thisSub.api
        }, null, 2), 'utf8');
    }
}

module.exports = initializer;