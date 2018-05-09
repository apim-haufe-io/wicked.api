'use strict';

var utils = require('./utils');
var { debug, info, warn, error } = require('portal-env').Logger('portal-api:verifications');
var dao = require('../dao/dao');

const registrations = require('express').Router();



module.exports = registrations;