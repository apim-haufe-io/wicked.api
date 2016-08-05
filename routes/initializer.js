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

initializer.cleanupLockFiles = function (app) {
    debug('cleanupLockFiles()');
    var dynDir = app.get('dynamic_config');
    cleanupDir(dynDir);
    if (utils.hasGlobalLock(app))
        utils.globalUnlock(app);
    debug("checkForLocks() Done.");
};

initializer.hasLockFiles = function (app) {
    debug('hasLockFiles()');
    var fileList = [];
    gatherLockFiles(app.get('dynamic_config'), fileList);
    return (fileList.length > 0);
};

initializer.checkDynamicConfig = function (app, callback) {
    debug('checkDynamicConfig()');
    // Check for locked files
    initializer.cleanupLockFiles(app);
    
    var glob = utils.loadGlobals(app);

    var checks = [
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
            userIndex.push({
                id: thisUser.id,
                name: thisUser.firstName + ' ' + thisUser.lastName,
                email: thisUser.email.toLowerCase()
            });

            thisUser.password = bcrypt.hashSync(thisUser.password);
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
    var error = null;
    var messages = [];
    try {
        var apis = utils.loadApis(app);
        var plans = utils.loadPlans(app);

        var apiMap = buildApiMap(apis);
        var planMap = buildPlanMap(plans);

        var apps = applications.loadAppsIndex(app);

        // Closures are perversly useful.
        var check = function (subsCheck, subs) {
            for (var i = 0; i < subs.length; ++i) {
                var msg = subsCheck(apiMap, planMap, subs[i]);
                if (msg)
                    messages.push(msg);
            }
        };

        for (var i = 0; i < apps.length; ++i) {
            var thisApp = apps[i];
            var subs = subscriptions.loadSubscriptions(app, thisApp.id);
            check(thatPlanIsValid, subs);
            check(thatApiIsValid, subs);
            check(thatApiPlanIsValid, subs);
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

module.exports = initializer;