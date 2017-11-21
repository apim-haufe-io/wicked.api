'use strict';

const debug = require('debug')('portal-api:dao:json:registrations');
const fs = require('fs');
const path = require('path');

const utils = require('../../../routes/utils');
const jsonUtils = require('./json-utils');

const jsonRegistrations = function () { };

// =================================================
// DAO contract
// =================================================

jsonRegistrations.getByPoolAndUser = (poolId, userId, callback) => {
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

module.exports = jsonRegistrations;