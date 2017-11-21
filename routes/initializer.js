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

var dao = require('../dao/dao');

var initializer = function () { };

initializer.checkDynamicConfig = (callback) => {
    debug('checkDynamicConfig()');

    var glob = utils.loadGlobals();

    // Get checking functions from the DAO
    const daoChecks = dao.meta.getInitChecks();

    const checks = [];
    for (let i = 0; i < daoChecks.length; ++i)
        checks.push(daoChecks[i]);

    checks.push(addInitialUsers);
    checks.push(checkApiPlans);
    checks.push(checkSubscriptions);

    async.mapSeries(checks,
        function (checkFunction, callback) {
            // Make sure we're async.
            process.nextTick(function () {
                checkFunction(glob, callback);
            });
        },
        function (err, results) {
            if (err) {
                console.error(err);
            }

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

function addInitialUsers(glob, callback) {
    debug('addInitialUsers()');
    var error = null;
    if (!glob.initialUsers) {
        debug('Global config does not contain initial users.');
        return;
    }

    async.mapSeries(glob.initialUsers, (thisUser, callback) => {
        dao.users.getById(thisUser.id, (err, userInfo) => {
            if (err)
                return callback(err);
            if (userInfo) {
                debug('User "' + thisUser.email + "' already exists.");
                return callback(null);
            }

            if (thisUser.password && thisUser.customId) {
                console.error('Initial user with ID ' + thisUser.id + ' has both password and customId; password NOT added.');
                delete thisUser.password;
            }
            thisUser.applications = [];
            thisUser.validated = true;

            dao.users.create(thisUser, callback);
        });
    }, (err) => {
        // This does not generate any messages; it either fails,
        // or it succeeds.
        return callback(err);
    });
}

function checkApiPlans(glob, callback) {
    debug('checkApiPlans()');
    var error = null;
    var messages = [];
    try {
        var apis = utils.loadApis();
        var plans = utils.loadPlans();

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

// I think this is one of the worst functions I have ever written.
// No, seriously, it's horrible. It's full of side effects and bad
// hacks. It does some very useful checks, like ensuring that all
// subscriptions are pointing to (a) an API and (b) a plan which is
// still present.
//
// As a side effect, if you're using the JSON DAO, it rebuilds the
// index of subscriptions. And that's really really hacky.
function checkSubscriptions(glob, callback) {
    debug('checkSubscriptions()');

    const messages = [];

    const apis = utils.loadApis();
    const plans = utils.loadPlans();

    const apiMap = buildApiMap(apis);
    const planMap = buildPlanMap(plans);

    // Work on 100 applications at once
    const PAGE = 100;
    dao.applications.getCount((err, appCount) => {
        if (err)
            return callback(err);

        // Closures are perversly useful.
        const check = function (subsCheck, subs) {
            for (var i = 0; i < subs.length; ++i) {
                var msg = subsCheck(apiMap, planMap, subs[i]);
                if (msg)
                    messages.push(msg);
            }
        };

        const loops = Math.ceil(appCount / PAGE);
        async.timesSeries(loops, (loop, callback) => {
            const offset = loop * PAGE;
            dao.applications.getIndex(offset, PAGE, (err, apps) => {
                if (err)
                    return callback(err);
                async.map(apps, (thisApp, callback) => {
                    debug(thisApp);
                    dao.subscriptions.getByAppId(thisApp.id, (err, subs) => {
                        if (err)
                            return callback(err);
                        check(thatPlanIsValid, subs);
                        check(thatApiIsValid, subs);
                        check(thatApiPlanIsValid, subs);
                        // Waaa, thisApi.subscriptions is filled here by side-effect
                        check(thatApiIndexIsWritten, subs);
                        // This is only necessary for the JSON DAO, and
                        // it is synchronous.
                        dao.subscriptions.legacyWriteSubsIndex(thisApp, subs);

                        // Yay
                        callback(null);
                    });
                }, callback);
            });
        }, (err) => {
            if (err) {
                console.error(err);
                console.error(err.stack);
            }
            var resultMessages = null;
            if (messages.length > 0)
                resultMessages = messages;

            // This is legacy functionality which is not necessary for future DAOs,
            // but we will need to keep it in for now.
            // Finish by writing the API to Application index
            for (let i = 0; i < apis.apis.length; ++i) {
                const thisApi = apis.apis[i];
                dao.subscriptions.legacySaveSubscriptionApiIndex(thisApi.id, thisApi.subscriptions);
                delete thisApi.subscriptions;
            }

            callback(err, resultMessages); // err may be null, hopefully is, actually
        });
    });
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

module.exports = initializer;