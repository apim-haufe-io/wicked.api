'use strict';

const { debug, info, warn, error } = require('portal-env').Logger('portal-api:dao:json:approvals');
const fs = require('fs');
const path = require('path');

const utils = require('../../../routes/utils');
const jsonUtils = require('./json-utils');

const jsonApprovals = function () { };

// =================================================
// DAO contract
// =================================================

jsonApprovals.getAll = (callback) => {
    debug('getAll()');
    jsonUtils.checkCallback(callback);
    let approvalList;
    try {
        approvalList = jsonApprovals.loadApprovals();
    } catch (err) {
        return callback(err);
    }
    return callback(null, approvalList);
};

jsonApprovals.create = (approvalInfo, callback) => {
    debug('create()');
    jsonUtils.checkCallback(callback);
    let newApproval;
    try {
        newApproval = jsonApprovals.createSync(approvalInfo);
    } catch (err) {
        return callback(err);
    }
    return callback(null, newApproval);
};

jsonApprovals.deleteByApp = (appId, callback) => {
    debug('deleteByApp()');
    jsonUtils.checkCallback(callback);
    try {
        jsonApprovals.deleteByAppSync(appId);
    } catch (err) {
        return callback(err);
    }
    return callback(null);
};

jsonApprovals.deleteByAppAndApi = (appId, apiId, callback) => {
    debug('deleteByAppAndApi()');
    jsonUtils.checkCallback(callback);
    try {
        jsonApprovals.deleteByAppAndApiSync(appId, apiId);
    } catch (err) {
        return callback(err);
    }
    return callback(null);
};


// =================================================
// DAO implementation/internal methods
// =================================================

jsonApprovals.createSync = (approvalInfo) => {
    debug('createSync()');
    return jsonUtils.withLockedApprovals(() => {
        const approvals = jsonApprovals.loadApprovals();
        approvals.push(approvalInfo);
        jsonApprovals.saveApprovals(approvals);
        return approvalInfo;
    });
};

jsonApprovals.deleteByAppSync = (appId) => {
    debug('deleteByAppSync()');

    const approvalInfos = jsonApprovals.loadApprovals();

    let notReady = true;
    let foundApproval = false;
    while (notReady) {
        notReady = false;
        let approvalIndex = -1;
        for (let i = 0; i < approvalInfos.length; ++i) {
            if (appId == approvalInfos[i].application.id) {
                approvalIndex = i;
                break;
            }
        }
        if (approvalIndex >= 0) {
            foundApproval = true;
            notReady = true;
            approvalInfos.splice(approvalIndex, 1);
        }
    }
    if (foundApproval) {
        // Persist the approvals again
        jsonApprovals.saveApprovals(approvalInfos);
    }
};

function findApprovalIndex(approvalInfos, appId, apiId) {
    let approvalIndex = -1;
    for (let i = 0; i < approvalInfos.length; ++i) {
        const appr = approvalInfos[i];
        if (appr.application.id == appId &&
            appr.api.id == apiId) {
            approvalIndex = i;
            break;
        }
    }
    return approvalIndex;
}

jsonApprovals.deleteByAppAndApiSync = (appId, apiId) => {
    debug('deleteByAppAndApiSync()');
    return jsonUtils.withLockedApprovals(() => {
        const approvalInfos = jsonApprovals.loadApprovals();
        const approvalIndex = findApprovalIndex(approvalInfos, appId, apiId);
        if (approvalIndex >= 0) {
            approvalInfos.splice(approvalIndex, 1);
            jsonApprovals.saveApprovals(approvalInfos);
        }
    });
};


jsonApprovals.loadApprovals = () => {
    debug('loadApprovals()');
    const approvalsDir = path.join(utils.getDynamicDir(), 'approvals');
    const approvalsFile = path.join(approvalsDir, '_index.json');
    if (!fs.existsSync(approvalsFile))
        throw new Error('Internal Server Error - Approvals index not found.');
    return JSON.parse(fs.readFileSync(approvalsFile, 'utf8'));
};

jsonApprovals.saveApprovals = (approvalInfos) => {
    debug('saveApprovals()');
    debug(approvalInfos);
    const approvalsDir = path.join(utils.getDynamicDir(), 'approvals');
    const approvalsFile = path.join(approvalsDir, '_index.json');
    fs.writeFileSync(approvalsFile, JSON.stringify(approvalInfos, null, 2), 'utf8');
};

module.exports = jsonApprovals;