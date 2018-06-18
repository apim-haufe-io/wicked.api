'use strict';

const { debug, info, warn, error } = require('portal-env').Logger('portal-api:dao:pg:verifications');

class PgVerifications {
    constructor(pgUtils) {
        this.pgUtils = pgUtils;
    }

    // =================================================
    // DAO contract
    // =================================================

    create(verifInfo, callback) {
        debug(`create(${verifInfo.id})`);
        this.pgUtils.checkCallback(callback);
        return this.pgUtils.upsert('verifications', verifInfo, null, callback);
    }

    getAll(callback) {
        debug('getAll()');
        this.pgUtils.checkCallback(callback);
        return this.pgUtils.getBy('verifications', [], [], {}, callback);
    }

    getById(verificationId, callback) {
        debug(`getById(${verificationId})`);
        this.pgUtils.checkCallback(callback);
        return this.pgUtils.getById('verifications', verificationId, callback);
    }

    delete(verificationId, callback) {
        debug(`delete(${verificationId})`);
        this.pgUtils.checkCallback(callback);
        return this.pgUtils.deleteById('verifications', verificationId, callback);
    }

    reconcile(expirySeconds, callback) {
        debug('reconcile()');
        this.pgUtils.checkCallback(callback);
        return this.reconcileImpl(expirySeconds, callback);
    }

    // =================================================
    // DAO implementation/internal methods
    // =================================================

    reconcileImpl(expirySeconds, callback) {
        // TODO: Implement; this cannot be done with the current state
        // of the pgUtils, it needs a check via time stamp. Full table scan?
        // I guess a FTS is okay here. It's not done often, and the amount
        // of data is not big.

        error('*****************************************************************');
        error('***** POSTGRES: RECONCILE VERIFICATIONS NOT YET IMPLEMENTED *****');
        error('*****************************************************************');

        return callback(null);
    }
}

module.exports = PgVerifications;
