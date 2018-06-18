'use strict';

const PgMeta = require('./pg-meta');
const PgUsers = require('./entities/pg-users');
const PgApplications = require('./entities/pg-applications');
const PgSubscriptions = require('./entities/pg-subscriptions');
const PgVerifications = require('./entities/pg-verifications');
const PgApprovals = require('./entities/pg-approvals');
const PgRegistrations = require('./entities/pg-registrations');
const PgGrants = require('./entities/pg-grants');
const PgWebhooks = require('./entities/pg-webhooks');
const PgUtils = require('./pg-utils');

// ================================================

class PgDao {
    constructor(postgresOptions) {
        this.pgUtils = new PgUtils(postgresOptions);
        this.postgresOptions = postgresOptions;
        this.pgApprovals = new PgApprovals(this.pgUtils);

        this.pgMeta = new PgMeta(this.pgUtils);
        this.pgUsers = new PgUsers(this.pgUtils);
        this.pgApplications = new PgApplications(this.pgUtils);
        this.pgSubscriptions = new PgSubscriptions(this.pgUtils);
        this.pgVerifications = new PgVerifications(this.pgUtils);
        this.pgRegistrations = new PgRegistrations(this.pgUtils);
        this.pgGrants = new PgGrants(this.pgUtils);
        this.pgWebhooks = new PgWebhooks(this.pgUtils);
    }

    init(app) { }

    get meta() { return this.pgMeta; }
    get users() { return this.pgUsers; }
    get applications() { return this.pgApplications; }
    get subscriptions() { return this.pgSubscriptions; }
    get verifications() { return this.pgVerifications; }
    get approvals() { return this.pgApprovals; }
    get registrations() { return this.pgRegistrations; }
    get grants() { return this.pgGrants; }
    get webhooks() { return this.pgWebhooks; }
}

module.exports = PgDao;
