'use strict';

const debug = require('debug')('portal-api:dao:pg:approvals');

const utils = require('../../../routes/utils');
const daoUtils = require('../../dao-utils');
const pgUtils = require('../pg-utils');

const pgApprovals = () => { };

// =================================================
// DAO contract
// =================================================

pgApprovals.getAll = (callback) => {
    debug('getAll()');
    pgUtils.checkCallback(callback);
    return pgUtils.getBy('approvals', [], [], callback);
};

pgApprovals.create = (approvalInfo, callback) => {
    debug('create()');
    pgUtils.checkCallback(callback);
    return pgUtils.upsert('approvals', approvalInfo, null, callback);
};

pgApprovals.deleteByAppAndApi = (appId, apiId, callback) => {
    debug(`deleteByAppAndApi(${appId}, ${apiId})`);
    pgUtils.checkCallback(callback);
    return deleteByAppAndApiImpl(appId, apiId, callback);
};

// =================================================
// DAO implementation/internal methods
// =================================================

// Gaaa, FTS. But you don't expect to have more than just a couple
// of approvals at once in the system. If you have, you should clean
// them up.
function deleteByAppAndApiImpl(appId, apiId, callback) {
    debug('deleteByAppAndApiImpl()');
    pgApprovals.getAll((err, approvalList) => {
        if (err)
            return callback(err);
        const approvalInfo = approvalList.find(a => a.api.id === apiId && a.application.id === appId);
        if (approvalInfo) {
            pgUtils.deleteById('approvals', approvalInfo.id, callback);
        } else {
            // Not found, ignore
            debug('deleteByAppAndApiImpl() did not find any matching approvals.');
        }
    });
}

module.exports = pgApprovals;
