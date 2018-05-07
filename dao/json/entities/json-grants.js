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

jsonGrants.getByApiAndUser = (apiId, userId, callback) => {
    return callback(utils.makeError(500, 'Not implemented'));
};

jsonGrants.upsert = (apiId, userId, grants, callback) => {
    return callback(utils.makeError(500, 'Not implemented'));
};

jsonGrants.delete = (apiId, userId, callback) => {
    return callback(utils.makeError(500, 'Not implemented'));
};

// =================================================
// DAO implementation/internal methods
// =================================================

module.exports = jsonGrants;
