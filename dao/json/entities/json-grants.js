'use strict';

const { debug, info, warn, error } = require('portal-env').Logger('portal-api:dao:json:registrations');
const fs = require('fs');
const path = require('path');

const utils = require('../../../routes/utils');
const jsonUtils = require('./json-utils');

const jsonGrants = function () { };

// =================================================
// DAO contract
// =================================================

jsonGrants.getByUserApplicationAndApi = (userId, applicationId, apiId, callback) => {
    debug(`getByUserApplicationAndApi(${userId}, ${applicationId}, ${apiId})`);
    jsonUtils.checkCallback(callback);
    let grantInfo;
    try {
        grantInfo = jsonGrants.getByApiApplicationAndUserSync(userId, applicationId, apiId);
    } catch (err) {
        return callback(err);
    }
    return callback(null, grantInfo);
};

jsonGrants.getByUser = (userId, offset, limit, callback) => {
    debug(`getByUser(${userId}, ${offset}, ${limit})`);
    jsonUtils.checkCallback(callback);
    let grantList;
    try {
        grantList = jsonGrants.getByUserSync(userId, offset, limit);
    } catch (err) {
        return callback(err);
    }
    return callback(null, grantList);
};

jsonGrants.deleteByUser = (userId, deletingUserId, callback) => {
    debug(`deleteByUser(${userId})`);
    jsonUtils.checkCallback(callback);
    try {
        jsonGrants.deleteByUserSync(userId);
    } catch (err) {
        return callback(err);
    }
    return callback(null);
};

jsonGrants.upsert = (userId, applicationId, apiId, upsertingUserId, grants, callback) => {
    debug(`upsert(${userId}, ${applicationId}, ${apiId})`);
    jsonUtils.checkCallback(callback);
    try {
        jsonGrants.upsertSync(userId, applicationId, apiId, grants);
    } catch (err) {
        return callback(err);
    }
    return callback(null);
};

jsonGrants.delete = (userId, applicationId, apiId, deletingUserId, callback) => {
    debug(`delete(${userId}, ${applicationId}, ${apiId})`);
    jsonUtils.checkCallback(callback);
    try {
        jsonGrants.deleteSync(userId, applicationId, apiId);
    } catch (err) {
        return callback(err);
    }
    return callback(null);
};

// =================================================
// DAO implementation/internal methods
// =================================================

jsonGrants.getByApiApplicationAndUserSync = (userId, applicationId, apiId) => {
    debug(`getByApiApplicationAndUserSync(${userId}, ${applicationId}, ${apiId})`);
    // Delegate to getByUserSync
    const grantList = jsonGrants.getByUserSync(userId);
    const grantIndex = grantList.findIndex(g => g.apiId === apiId && g.applicationId === applicationId);
    if (grantIndex < 0)
        throw utils.makeError(404, `User ${userId} does not have a grants record for API ${apiId}`);
    return grantList[grantIndex];
};

jsonGrants.getByUserSync = (userId, offset, limit) => {
    debug(`getByUserSync(${userId}, ${offset}, ${limit})`);
    const grantList = readGrants(userId);
    return grantList;
};

jsonGrants.deleteByUserSync = (userId) => {
    debug(`deleteByUserSync(${userId})`);
    const grantsFile = getGrantsFile(userId);
    if (fs.existsSync(grantsFile)) {
        debug(`deleting file ${grantsFile}`);
        fs.unlinkSync(grantsFile);
    } else {
        debug(`file ${grantsFile} not found, ignoring`);
    }
};

jsonGrants.upsertSync = (userId, applicationId, apiId, grantsInfo) => {
    debug(`upsert(${userId}, ${applicationId}, ${apiId})`);
    debug(grantsInfo);

    const grantsIndex = readGrants(userId);
    const prevIndex = grantsIndex.findIndex(g => g.apiId === apiId && g.applicationId === applicationId);
    const now = (new Date()).toISOString();
    if (prevIndex >= 0) {
        const prevGrants = grantsIndex[prevIndex].grants;
        const newGrants = [];
        for (let i = 0; i < grantsInfo.grants.length; ++i) {
            const thisScope = grantsInfo.grants[i];
            const prevGrantIndex = prevGrants.findIndex(g => g.scope === thisScope.scope); // jshint ignore:line
            if (prevGrantIndex >= 0) {
                // Copy previous grantedDate
                newGrants.push({
                    scope: thisScope.scope,
                    grantedDate: prevGrants[prevGrantIndex].grantedDate
                });
            } else {
                // New grant, use "now"
                newGrants.push({
                    scope: thisScope.scope,
                    grantedDate: now
                });
            }
        }

        // Now overwrite previous index
        grantsIndex[prevIndex] = {
            apiId: apiId,
            applicationId: applicationId,
            userId: userId,
            grants: newGrants
        };
    } else {
        for (let i = 0; i < grantsInfo.grants.length; ++i) {
            grantsInfo.grants[i].grantedDate = now;
        }
        // New grant for this API
        grantsIndex.push({
            userId: userId,
            applicationId: applicationId,
            apiId: apiId,
            grants: grantsInfo.grants
        });
    }

    writeGrants(userId, grantsIndex);
};

jsonGrants.deleteSync = (userId, applicationId, apiId) => {
    debug(`deleteSync(${userId}, ${applicationId}, ${apiId})`);

    const grantsIndex = readGrants(userId);
    const prevIndex = grantsIndex.findIndex(g => g.apiId === apiId && g.applicationId === applicationId);
    if (prevIndex < 0)
        throw utils.makeError(404, `User ${userId} does not have any grants for API ${apiId} and application ${applicationId}`);
    grantsIndex.splice(prevIndex, 1);
    writeGrants(userId, grantsIndex);
};

/*
Grants files look like this:

[
    {
        "apiId": "some-api",
        "applicationId": "some-application"
        "userId": "<the user id>",
        "grants": [
            {
                "scope": "<some scope>",
                "grantedDate": "<date/time>"
            }
        ]
    },
    ...
]
 */

function getGrantsFile(userId) {
    const grantsDir = path.join(utils.getDynamicDir(), 'grants');
    const grantsFile = path.join(grantsDir, `${userId}.json`);
    return grantsFile;
}

function readGrants(userId) {
    const grantsFile = getGrantsFile(userId);
    if (!fs.existsSync(grantsFile))
        return [];
    return JSON.parse(fs.readFileSync(grantsFile, 'utf8'));
}

function sanityCheckGrants(userId, grants) {
    const apiIdMap = {};
    for (let i = 0; i < grants.length; ++i) {
        const apiAppId = `${grants[i].apiId}#${grants[i].applicationId}`;
        if (apiIdMap[apiAppId])
            throw utils.makeError(500, `Grants: Invalid state, API#Application ${apiAppId} is duplicate`);
        if (grants[i].userId !== userId)
            throw utils.makeError(500, `Grants: User ID mismatch (${userId} != ${grants[i].userId})`);
        apiIdMap[apiAppId] = true;
    }
}

function writeGrants(userId, grants) {
    const grantsFile = getGrantsFile(userId);
    sanityCheckGrants(userId, grants);
    fs.writeFileSync(grantsFile, JSON.stringify(grants, null, 2), 'utf8');
}


module.exports = jsonGrants;
