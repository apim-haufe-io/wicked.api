'use strict';

const async = require('async');
const { debug, info, warn, error } = require('portal-env').Logger('portal-api:dao:pg:accesstokens');

const utils = require('../../../routes/utils');
const daoUtils = require('../../dao-utils');

class PgAccessTokens {
    constructor(pgUtils) {
        this.pgUtils = pgUtils;
    }

    // =================================================
    // DAO contract
    // =================================================

    getByAccessToken(accessToken, callback) {
        debug('getByAccessToken()');
        this.pgUtils.checkCallback(callback);
        return this.getByAccessTokenImpl(accessToken, callback);
    }

    getByRefreshToken(refreshToken, callback) {
        debug('getByRefreshToken()');
        this.pgUtils.checkCallback(callback);
        return this.getByRefreshTokenImpl(refreshToken, callback);
    }
    
    getByAuthenticatedUserId(authenticatedUserId, callback) {
        debug('getByAuthenticatedUserId()');
        this.pgUtils.checkCallback(callback);
        return this.getByAuthenticatedUserIdImpl(authenticatedUserId, callback);
    }
    
    getByUserId(userId, callback) {
        debug('getByUserId()');
        this.pgUtils.checkCallback(callback);
        return this.getByUserIdImpl(userId, callback);
    }

    insert(tokenData, callback) {
        debug('insert()');
        this.pgUtils.checkCallback(callback);
        return this.insertImpl(tokenData, callback);
    }

    deleteByAccessToken(accessToken, callback) {
        debug('deleteByAccessToken()');
        this.pgUtils.checkCallback(callback);
        return this.deleteByAccessTokenImpl(accessToken, callback);
    }

    deleteByRefreshToken(refreshToken, callback) {
        debug('deleteByRefreshToken()');
        this.pgUtils.checkCallback(callback);
        return this.deleteByRefreshTokenImpl(refreshToken, callback);
    }
    
    deleteByAuthenticatedUserId(authenticatedUserId, callback) {
        debug('deleteByAccessToken()');
        this.pgUtils.checkCallback(callback);
        return this.deleteByAuthenticatedUserIdImpl(authenticatedUserId, callback);
    }
}

module.exports = PgAccessTokens;