'use strict';

const pgMeta = require('./pg-meta');
const pgUsers = require('./entities/pg-users');
const pgApplications = require('./entities/pg-applications');
const pgSubscriptions = require('./entities/pg-subscriptions');
const pgVerifications = require('./entities/pg-verifications');
const pgApprovals = require('./entities/pg-approvals');
const pgRegistrations = require('./entities/pg-approvals');
const pgGrants = require('./entities/pg-grants');
const pgWebhooks = require('./entities/pg-webhooks');

// ================================================

const pgDao = {
    init:          (app) => {},
    meta:          pgMeta,
    users:         pgUsers,
    applications:  pgApplications,
    subscriptions: pgSubscriptions,
    verifications: pgVerifications,
    approvals:     pgApprovals,
    registrations: pgRegistrations,
    grants:        pgGrants,
    webhooks:      pgWebhooks
};

module.exports = pgDao;
