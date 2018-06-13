'use strict';

const { debug, info, warn, error } = require('portal-env').Logger('portal-api:dao:pg:verifications');

const utils = require('../../../routes/utils');
const daoUtils = require('../../dao-utils');
const pgUtils = require('../pg-utils');

const pgVerifications = () => { };

// =================================================
// DAO contract
// =================================================

pgVerifications.create = (verifInfo, callback) => {
    debug(`create(${verifInfo.id})`);
    pgUtils.checkCallback(callback);
    return pgUtils.upsert('verifications', verifInfo, null, callback);
};

pgVerifications.getAll = (callback) => {
    debug('getAll()');
    pgUtils.checkCallback(callback);
    return pgUtils.getBy('verifications', [], [], {}, callback);
};

pgVerifications.getById = (verificationId, callback) => {
    debug(`getById(${verificationId})`);
    pgUtils.checkCallback(callback);
    return pgUtils.getById('verifications', verificationId, callback);
};

pgVerifications.delete = (verificationId, callback) => {
    debug(`delete(${verificationId})`);
    pgUtils.checkCallback(callback);
    return pgUtils.deleteById('verifications', verificationId, callback);
};

pgVerifications.reconcile = (expirySeconds, callback) => {
    debug('reconcile()');
    pgUtils.checkCallback(callback);
    return reconcileImpl(expirySeconds, callback);
};

// =================================================
// DAO implementation/internal methods
// =================================================

function reconcileImpl(expirySeconds, callback) {
    // TODO: Implement; this cannot be done with the current state
    // of the pgUtils, it needs a check via time stamp. Full table scan?
    // I guess a FTS is okay here. It's not done often, and the amount
    // of data is not big.

    error('*****************************************************************');
    error('***** POSTGRES: RECONCILE VERIFICATIONS NOT YET IMPLEMENTED *****');
    error('*****************************************************************');
    
    return callback(null);
}

module.exports = pgVerifications;
