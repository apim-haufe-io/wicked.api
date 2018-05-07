'use strict';

const { debug, info, warn, error } = require('portal-env').Logger('portal-api:dao:pg:grants');

const utils = require('../../../routes/utils');
const daoUtils = require('../../dao-utils');
const pgUtils = require('../pg-utils');

const pgGrants = () => { };

// =================================================
// DAO contract
// =================================================

// =================================================
// DAO implementation/internal methods
// =================================================

module.exports = pgGrants;