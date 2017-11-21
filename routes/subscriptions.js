'use strict';

var fs = require('fs');
var path = require('path');
var debug = require('debug')('portal-api:subscriptions');
var utils = require('./utils');
var users = require('./users');
var ownerRoles = require('./ownerRoles');
var approvals = require('./approvals');
var webhooks = require('./webhooks');

var dao = require('../dao/dao');
var daoUtils = require('../dao/dao-utils');

var subscriptions = function () { };

subscriptions.getOwnerRole = function (appInfo, userInfo) {
    debug('getOwnerRole()');
    for (var i = 0; i < appInfo.owners.length; ++i) {
        if (appInfo.owners[i].userId == userInfo.id)
            return appInfo.owners[i].role;
    }
    // Unknown
    return null;
};

subscriptions.getSubscriptions = function (app, res, applications, loggedInUserId, appId) {
    debug('getSubscriptions(): ' + appId);
    dao.applications.getById(appId, (err, appInfo) => {
        if (err)
            return utils.fail(res, 500, 'getSubscriptions: Loading app failed', err);
        if (!appInfo)
            return utils.fail(res, 404, 'Not found: ' + appId);
        users.loadUser(app, loggedInUserId, (err, userInfo) => {
            if (err)
                return utils.fail(res, 500, 'getSubscriptions: loadUser failed.', err);
            if (!userInfo)
                return utils.fail(res, 403, 'Not allowed. User invalid.');

            var isAllowed = false;
            var adminOrCollab = false;
            if (userInfo.admin) {
                isAllowed = true;
                adminOrCollab = true;
            }
            if (!isAllowed) {
                // Check for App rights
                var access = subscriptions.getOwnerRole(appInfo, userInfo);
                if (access) // Any role will do for GET
                    isAllowed = true;
                if (ownerRoles.OWNER == access ||
                    ownerRoles.COLLABORATOR == access)
                    adminOrCollab = true;
            }

            if (!isAllowed)
                return utils.fail(res, 403, 'Not allowed. User does not own application.');
            dao.subscriptions.getByAppId(appId, (err, subs) => {
                if (err)
                    return utils.fail(res, 500, 'getSubscriptions: DAO get subscription failed', err);
                // Add some links if admin or collaborator
                if (adminOrCollab) {
                    for (var i = 0; i < subs.length; ++i) {
                        if (!subs[i]._links)
                            subs[i]._links = {};
                        subs[i]._links.deleteSubscription = {
                            href: '/applications/' + appId + '/subscriptions/' + subs[i].api,
                            method: 'DELETE'
                        };
                    }
                }
                return res.json(subs);
            });
        });
    });
};

subscriptions.addSubscription = function (app, res, applications, loggedInUserId, appId, subsCreateInfo) {
    debug('addSubscription(): ' + appId);
    debug(subsCreateInfo);
    dao.applications.getById(appId, (err, appInfo) => {
        if (err)
            return utils.fail(res, 500, 'addSubscription: Loading app failed', err);
        if (!appInfo)
            return utils.fail(res, 404, 'Not found: ' + appId);
        users.loadUser(app, loggedInUserId, (err, userInfo) => {
            if (err)
                return utils.fail(res, '500', 'addSubscription: loadUser failed', err);
            if (!userInfo)
                return utils.fail(res, 403, 'Not allowed. User invalid.');
            if (!userInfo.validated)
                return utils.fail(res, 403, 'Not allowed. Email address not validated.');

            var isAllowed = false;
            var isAdmin = false;
            if (userInfo.admin) {
                isAllowed = true;
                isAdmin = true;
            }
            if (!isAllowed) {
                // Check for App rights
                var access = subscriptions.getOwnerRole(appInfo, userInfo);
                // OWNERs and COLLABORATORs may do this.
                if (access &&
                    ((access == ownerRoles.OWNER) ||
                        (access == ownerRoles.COLLABORATOR)))
                    isAllowed = true;
            }

            if (!isAllowed)
                return utils.fail(res, 403, 'Not allowed. Only owners and collaborators may add a subscription.');

            if (appId != subsCreateInfo.application)
                return utils.fail(res, 400, 'Bad request. App ID in body must match App ID in path.');

            debug('Adding Subscription allowed.');

            var apis = utils.loadApis(app);
            // Valid api name?
            var apiIndex = -1;
            for (let i = 0; i < apis.apis.length; ++i) {
                if (apis.apis[i].id == subsCreateInfo.api) {
                    apiIndex = i;
                    break;
                }
            }
            if (apiIndex < 0)
                return utils.fail(res, 400, 'Bad request. Unknown API "' + subsCreateInfo.api + '".');

            // API deprecated? 
            var selectedApi = apis.apis[apiIndex];
            if (selectedApi.deprecated)
                return utils.fail(res, 400, 'API is deprecated. Subscribing not possible.');

            // Valid plan?
            var foundPlan = false;
            for (let i = 0; i < selectedApi.plans.length; ++i) {
                if (selectedApi.plans[i] == subsCreateInfo.plan) {
                    foundPlan = true;
                    break;
                }
            }
            if (!foundPlan)
                return utils.fail(res, 400, 'Bad request. Invalid plan "' + subsCreateInfo.plan + '".');

            debug('Subscription plan and API known.');

            var apiPlans = utils.loadPlans(app).plans;
            var apiPlanIndex = -1;
            for (let i = 0; i < apiPlans.length; ++i) {
                if (apiPlans[i].id == subsCreateInfo.plan) {
                    apiPlanIndex = i;
                    break;
                }
            }
            if (apiPlanIndex < 0)
                return utils.fail(res, 500, 'Inconsistent API/Plan data. Plan not found: ' + subsCreateInfo.plan);
            var apiPlan = apiPlans[apiPlanIndex];

            // Required group? Or Admin, they may also.
            if (selectedApi.requiredGroup) {
                // If the user is admin, hasUserGroup will always return true
                let hasGroup = users.hasUserGroup(app, userInfo, selectedApi.requiredGroup);
                if (!hasGroup)
                    return res.status(403).jsonp({ message: 'Not allowed. User does not have access to the API.' });
            }

            // Now check required group for the selected plan
            if (apiPlan.requiredGroup) {
                // If the user is admin, hasUserGroup will always return true
                let hasGroup = users.hasUserGroup(app, userInfo, apiPlan.requiredGroup);
                if (!hasGroup)
                    return utils.fail(res, 403, 'Not allowed. User does not have access to the API Plan.');
            }

            // Is it an oauth2 implicit/authorization code API? If so, the app needs a redirectUri
            if (selectedApi.auth === 'oauth2') {
                // In case the API only has implicit flow or authorization code grant flow,
                // the application NEEDS a redirect URI (otherwise not).
                if (!appInfo.redirectUri &&
                    selectedApi.settings &&
                    !selectedApi.settings.enable_client_credentials &&
                    !selectedApi.settings.enable_password_grant)
                    return utils.fail(res, 400, 'Application does not have a redirectUri');
            }

            dao.subscriptions.getByAppId(appId, (err, appSubs) => {
                if (err)
                    return utils.fail(res, 500, 'addSubscription: DAO load subscriptions failed', err);
                for (var i = 0; i < appSubs.length; ++i) {
                    if (appSubs[i].api == subsCreateInfo.api)
                        return utils.fail(res, 409, 'Application already has a subscription for API "' + subsCreateInfo.api + '".');
                }

                debug('All set to add subscription.');

                debug('Subscription is new.');

                // Do we need to create an API key? Or did we get one passed in?
                // Or do we require approval? Admins never need approval
                var needsApproval = !isAdmin && apiPlan.needsApproval;
                // var approvalInfos = null;
                // if (needsApproval)
                //     approvalInfos = approvals.loadApprovals(app);

                var apiKey = null;
                var clientId = null;
                var clientSecret = null;
                var authMethod = "key-auth";
                if (!needsApproval) {
                    debug('Subscription does not need approval, creating keys.');
                    if (selectedApi.auth && selectedApi.auth.startsWith("oauth2")) { // oauth2
                        clientId = utils.createRandomId();
                        clientSecret = utils.createRandomId();
                        authMethod = selectedApi.auth;
                    } else {
                        // Default to key-auth
                        apiKey = utils.createRandomId();
                        if (subsCreateInfo.apikey)
                            apiKey = subsCreateInfo.apikey;
                    }
                } else {
                    debug('Subscription needs approval.');
                }

                const allowTrusted = isAdmin;
                const isTrusted = allowTrusted && subsCreateInfo.trusted;

                const newSubscription = {
                    id: utils.createRandomId(),
                    application: subsCreateInfo.application,
                    api: subsCreateInfo.api,
                    plan: subsCreateInfo.plan,
                    apikey: apiKey,
                    clientId: clientId,
                    clientSecret: clientSecret,
                    auth: selectedApi.auth,
                    approved: !needsApproval,
                    trusted: isTrusted,
                    changedBy: loggedInUserId,
                    changedDate: utils.getUtc(),
                    _links: {
                        self: { href: '/applications/' + appId + '/subscriptions/' + subsCreateInfo.api },
                        application: { href: '/applications/' + appId },
                        apis: { href: '/apis' },
                        plans: { href: '/plans' }
                    }
                };

                dao.subscriptions.create(newSubscription, (err, persistedSubscription) => {
                    if (err)
                        return utils.fail(res, 500, 'addSubscription: DAO create subscription failed', err);

                    // If clientId/Secret are present, include unencrypted in response
                    if (clientId) {
                        persistedSubscription.clientId = clientId;
                        persistedSubscription.clientSecret = clientSecret;
                    }
                    // For returning the subscription, include unencrypted key.
                    if (apiKey) {
                        persistedSubscription.apikey = apiKey;
                    }

                    res.status(201).json(persistedSubscription);

                    // Webhook it, man
                    webhooks.logEvent(app, {
                        action: webhooks.ACTION_ADD,
                        entity: webhooks.ENTITY_SUBSCRIPTION,
                        data: {
                            subscriptionId: persistedSubscription.id,
                            applicationId: appInfo.id,
                            apiId: selectedApi.id,
                            userId: userInfo.id,
                            planId: apiPlan.id
                        }
                    });

                    if (needsApproval) {
                        const approvalInfo = {
                            subscriptionId: persistedSubscription.id,
                            user: {
                                id: userInfo.id,
                                name: userInfo.name,
                                email: userInfo.email,
                            },
                            api: {
                                id: selectedApi.id,
                                name: selectedApi.name,
                            },
                            application: {
                                id: appInfo.id,
                                name: appInfo.name
                            },
                            plan: {
                                id: apiPlan.id,
                                name: apiPlan.name
                            }
                        };

                        dao.approvals.create(approvalInfo, (err) => {
                            if (err) {
                                // This is very bad. Transaction?
                                console.error(err);
                            }
                            webhooks.logEvent(app, {
                                action: webhooks.ACTION_ADD,
                                entity: webhooks.ENTITY_APPROVAL,
                                data: {
                                    userId: userInfo.id,
                                    applicationId: appInfo.id,
                                    apiId: selectedApi.id,
                                    planId: apiPlan.id
                                }
                            });
                        });
                    }
                });
            });
        });
    });
};

subscriptions.getSubscription = function (app, res, applications, loggedInUserId, appId, apiId) {
    debug('getSubscription(): ' + appId + ', apiId: ' + apiId);
    dao.applications.getById(appId, (err, appInfo) => {
        if (err)
            return utils.fail(res, 500, 'getSubscription: Loading app failed', err);
        if (!appInfo)
            return utils.fail(res, 404, 'Not found: ' + appId);
        users.loadUser(app, loggedInUserId, (err, userInfo) => {
            if (err)
                return utils.fail(res, 500, 'getSubscription: loadUser failed', err);
            if (!userInfo)
                return utils.fail(res, 403, 'Not allowed. User invalid.');

            var isAllowed = false;
            var adminOrCollab = false;
            if (userInfo.admin) {
                isAllowed = true;
                adminOrCollab = true;
            }
            if (!isAllowed) {
                // Check for App rights
                var access = subscriptions.getOwnerRole(appInfo, userInfo);
                if (access) // Any role will do for GET
                    isAllowed = true;
                if (ownerRoles.OWNER == access ||
                    ownerRoles.COLLABORATOR == access)
                    adminOrCollab = true;
            }
            if (!isAllowed)
                return utils.fail(res, 403, 'Not allowed. User does not own application.');

            dao.subscriptions.getByAppAndApi(appId, apiId, (err, appSub) => {
                if (err)
                    return utils.fail(res, 500, 'getSubscription: Could not get subscription by app and api', err);
                // Did we find it?    
                if (!appSub)
                    return utils.fail(res, 404, 'API subscription not found for application. App: ' + appId + ', API: ' + apiId);
                // var appSub = appSubs[subsIndex];
                if (adminOrCollab) {
                    if (!appSub._links)
                        appSub._links = {};
                    appSub._links.deleteSubscription = {
                        href: '/applications/' + appId + '/subscriptions/' + appSub.api,
                        method: 'DELETE'
                    };
                }

                // Return what we found
                res.json(appSub);
            });
        });
    });
};

function findSubsIndex(appSubs, apiId) {
    var subsIndex = -1;
    for (var i = 0; i < appSubs.length; ++i) {
        if (appSubs[i].api == apiId) {
            subsIndex = i;
            break;
        }
    }
    return subsIndex;
}

function findApprovalIndex(approvalInfos, appId, apiId) {
    var approvalIndex = -1;
    for (var i = 0; i < approvalInfos.length; ++i) {
        var appr = approvalInfos[i];
        if (appr.application.id == appId &&
            appr.api.id == apiId) {
            approvalIndex = i;
            break;
        }
    }
    return approvalIndex;
}

subscriptions.deleteSubscription = function (app, res, applications, loggedInUserId, appId, apiId) {
    debug('deleteSubscription(): ' + appId + ', apiId: ' + apiId);
    dao.applications.getById(appId, (err, appInfo) => {
        if (err)
            return utils.fail(res, 500, 'deleteSubscription: Loading app failed', err);
        if (!appInfo)
            return utils.fail(res, 404, 'Not found: ' + appId);
        users.loadUser(app, loggedInUserId, (err, userInfo) => {
            if (err)
                return utils.fail(res, 500, 'deleteSubscription: loadUser failed', err);
            if (!userInfo)
                return utils.fail(res, 403, 'Not allowed. User invalid.');

            var isAllowed = false;
            if (userInfo.admin)
                isAllowed = true;
            if (!isAllowed) {
                // Check for App rights
                var access = subscriptions.getOwnerRole(appInfo, userInfo);
                // OWNERs and COLLABORATORs may do this.
                if (access &&
                    ((access == ownerRoles.OWNER) ||
                        (access == ownerRoles.COLLABORATOR))
                )
                    isAllowed = true;
            }

            if (!isAllowed)
                return utils.fail(res, 403, 'Not allowed. Only owners and collaborators may delete a subscription.');

            dao.subscriptions.getByAppId(appId, (err, appSubs) => {
                if (err)
                    return utils.fail(res, 500, 'deleteSubscription: DAO get subscriptions failed', err);
                var subsIndex = findSubsIndex(appSubs, apiId);
                if (subsIndex < 0)
                    return utils.fail(res, 404, 'Not found. Subscription to API "' + apiId + '" does not exist: ' + appId);

                const subscriptionId = appSubs[subsIndex].id;
                const subscriptionData = appSubs[subsIndex];

                dao.subscriptions.delete(appId, apiId, subscriptionId, (err) => {
                    if (err)
                        return utils.fail(res, 500, 'deleteSubscription: DAO delete subscription failed', err);
                    res.status(204).send('');

                    webhooks.logEvent(app, {
                        action: webhooks.ACTION_DELETE,
                        entity: webhooks.ENTITY_SUBSCRIPTION,
                        data: {
                            subscriptionId: subscriptionId,
                            applicationId: appId,
                            apiId: apiId,
                            userId: loggedInUserId,
                            auth: subscriptionData.auth
                        }
                    });
                });
            });
        });
    });
};

// This is for approving subscriptions
subscriptions.patchSubscription = function (app, res, applications, loggedInUserId, appId, apiId, patchBody) {
    debug('patchSubscription(): ' + appId + ', apiId: ' + apiId);
    debug(patchBody);
    users.loadUser(app, loggedInUserId, (err, userInfo) => {
        if (err)
            return utils.fail(res, 500, 'patchSubscription: loadUser failed', err);
        if (!userInfo)
            return utils.fail(res, 403, 'Not allowed.');
        if (!userInfo.admin)
            return utils.fail(res, 403, 'Not allowed. Only admins can patch a subscription.');
        dao.subscriptions.getByAppId(appId, (err, appSubs) => {
            if (err)
                return utils.fail(res, 500, 'patchSubscription: DAO load app subscriptions failed', err);
            var subsIndex = findSubsIndex(appSubs, apiId);
            if (subsIndex < 0)
                return utils.fail(res, 404, 'Not found. Subscription to API "' + apiId + '" does not exist: ' + appId);

            if (patchBody.approved || patchBody.hasOwnProperty('trusted')) {
                var thisSubs = appSubs[subsIndex];
                // In case a clientId is created, we need to temporary store it here, too,
                // as saveSubscriptions encrypts the ID.
                let tempClientId = null;
                let tempClientSecret = null;
                let tempApiKey = null;

                if (patchBody.approved) {

                    // Now set to approved
                    thisSubs.approved = true;

                    // And generate an apikey
                    if (thisSubs.auth && thisSubs.auth.startsWith("oauth2")) { // oauth2
                        thisSubs.clientId = utils.createRandomId();
                        tempClientId = thisSubs.clientId;
                        thisSubs.clientSecret = utils.createRandomId();
                        tempClientSecret = thisSubs.clientSecret;
                    } else {
                        thisSubs.apikey = utils.createRandomId();
                        tempApiKey = thisSubs.apikey;
                        thisSubs.auth = "key-auth";
                    }
                }

                if (patchBody.hasOwnProperty('trusted')) {
                    // This can go both ways
                    thisSubs.trusted = !!patchBody.trusted;
                }

                thisSubs.changedBy = loggedInUserId;
                thisSubs.changedDate = utils.getUtc();

                // And persist the subscriptions
                dao.subscriptions.patch(appId, thisSubs, loggedInUserId, (err, updatedSubsInfo) => {
                    if (err)
                        return utils.fail(res, 500, 'patchSubscription: DAO patch subscription failed', err);
                    dao.approvals.deleteByAppAndApi(appId, apiId, (err) => {
                        if (err)
                            return utils.fail(res, 500, 'patchSubscription: DAO delete approvals failed', err);

                        if (tempClientId) {
                            // Replace the ID and Secret for returning, otherwise we'd return the encrypted
                            // strings. We don't want that.
                            updatedSubsInfo.clientId = tempClientId;
                            updatedSubsInfo.clientSecret = tempClientSecret;
                        }
                        // For returning the subscription data, include the unencrypted key.
                        if (tempApiKey) {
                            updatedSubsInfo.apikey = tempApiKey;
                        }

                        res.json(updatedSubsInfo);

                        webhooks.logEvent(app, {
                            action: webhooks.ACTION_UPDATE,
                            entity: webhooks.ENTITY_SUBSCRIPTION,
                            data: {
                                subscriptionId: thisSubs.id,
                                applicationId: appId,
                                apiId: apiId,
                                userId: loggedInUserId
                            }
                        });
                    });
                });
            } else {
                // No-op
                return utils.fail(res, 400, 'Bad request. Patching subscriptions can only be used to approve of subscriptions.');
            }
        });
    });
};

subscriptions.getSubscriptionByClientId = function (app, res, applications, loggedInUserId, clientId) {
    debug('getSubscriptionByClientId()');
    users.loadUser(app, loggedInUserId, (err, userInfo) => {
        if (err)
            return utils.fail(res, 500, 'getSubscriptionByClientId: loadUser failed', err);
        if (!userInfo)
            return utils.fail(res, 403, 'Not allowed.');
        if (!userInfo.admin)
            return utils.fail(res, 403, 'Not allowed. Only admins may get subscriptions by client ID.');
        dao.subscriptions.getByClientId(clientId, (err, subsInfo) => {
            if (err)
                return utils.fail(res, 500, 'getSubscriptionByClient: DAO failed to load by client id', err);
            // Also load the application
            dao.applications.getById(subsInfo.application, (err, appInfo) => {
                if (err)
                    return utils.fail(res, 500, `getSubscriptionByClientId: DAO failed to get application ${subsInfo.application}`, err);
                if (!appInfo) {
                    const errorMessage = 'Inconsistent state. Please notify operator: Application app ' + subsInfo.application + ' not found.';
                    console.error("getSubscriptionByClientId(): " + errorMessage);
                    return utils.fail(res, 500, errorMessage);
                }
                return res.json({
                    subscription: subsInfo,
                    application: appInfo
                });
            });
        });
    });
};

module.exports = subscriptions;
