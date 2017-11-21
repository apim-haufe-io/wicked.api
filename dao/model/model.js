'use strict';

// All models have an implicit "id" field which is not mentioned in the properties.
// Additionally, all tables are assumed to have a field "data" which can store JSON
// data. This is where all additional payload, which does not have to be indexed, is
// stored.
//
// This model is supposed to be DAO independent, but is currently possibly biased
// towards the Postgres DAO implementation.
const model = {

    users: {
        properties: {
            custom_id: {},
            email: {}
        }
    },

    applications: {
        properties: {}
    },

    owners: {
        properties: {
            users_id: {},
            applications_id: {}
        }
    },

    subscriptions: {
        properties: {
            applications_id: {},
            plan_id: {},
            api_id: {},
            client_id: {
                optional: true
            }
        },
    },

    verifications: {
        properties: {
            users_id: {}
        }
    },

    approvals: {
        properties: {
            subscriptions_id: {}
        }
    },

    webhook_listeners: {
        properties: {}
    },

    webhook_events: {
        properties: {
            webhook_listeners_id: {}
        }
    },

    registrations: {
        properties: {
            pool_id: {},
            users_id: {}
        }
    },

    grants: {
        properties: {
            users_id: {},
            subscriptions_id: {}
        }
    }
};

module.exports = model;
