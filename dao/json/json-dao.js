'use strict';

const jsonUsers = require('./entities/json-users');
const jsonApplications = require('./entities/json-applications');
const jsonApprovals = require('./entities/json-approvals');
const jsonSubscriptions = require('./entities/json-subscriptions');
const jsonVerifications = require('./entities/json-verifications');
const jsonWebhooks = require('./entities/json-webhooks');
const jsonRegistrations = require('./entities/json-registrations');
const jsonGrants = require('./entities/json-grants');
const jsonMeta = require('./json-meta');

// ================================================

const jsonDao = {
    init:          (app) => {},
    meta:          jsonMeta,
    users:         jsonUsers,
    applications:  jsonApplications,
    subscriptions: jsonSubscriptions,
    verifications: jsonVerifications,
    approvals:     jsonApprovals,
    registrations: jsonRegistrations,
    grants:        jsonGrants,
    webhooks:      jsonWebhooks
};

// ================================================

module.exports = jsonDao;
