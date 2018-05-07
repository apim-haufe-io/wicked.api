'use strict';

const { debug, info, warn, error } = require('portal-env').Logger('portal-api:dao:json:registrations');
const fs = require('fs');
const path = require('path');

const utils = require('../../../routes/utils');
const jsonUtils = require('./json-utils');

const jsonRegistrations = function () { };

// =================================================
// DAO contract
// =================================================

jsonRegistrations.getByPoolAndUser = (poolId, userId, callback) => {
    debug(`getByPoolAndUser(${poolId}, ${userId})`);
    let userRegistration;
    try {
        userRegistration = jsonRegistrations.getByPoolAndUserSync(poolId, userId);
    } catch (err) {
        return callback(err);
    }
    return callback(null, userRegistration);
    //return callback(utils.makeError(500, 'Not implemented'));
};

jsonRegistrations.getByPoolAndNamespace = (poolId, namespace, offset, limit, callback) => {
    return callback(utils.makeError(500, 'Not implemented'));
};

jsonRegistrations.upsert = (poolId, userId, userData, callback) => {
    return callback(utils.makeError(500, 'Not implemented'));
};

jsonRegistrations.delete = (poolId, userId, callback) => {
    return callback(utils.makeError(500, 'Not implemented'));
};

// =================================================
// DAO implementation/internal methods
// =================================================

function makeRegsFileName(poolId, userId) {
    const regsDir = path.join(utils.getDynamicDir(), 'registrations');
    const regsFile = path.join(regsDir, `${poolId}_${userId}.json`);
    return regsFile;
}

jsonRegistrations.getByPoolAndUserSync = (poolId, userId) => {
    debug(`getByPoolAndUserSync(${poolId}, ${userId})`);

    const regsFile = makeRegsFileName(poolId, userId);
    if (!fs.existsSync(regsFile)) {
        debug(`Registration file ${regsFile} not found.`);
        throw utils.makeError(404, 'Registration not found');
    }
    const regsJson = JSON.parse(fs.readFileSync(regsFile, 'utf8'));
    debug(regsJson);
    return regsJson;    
};

module.exports = jsonRegistrations;