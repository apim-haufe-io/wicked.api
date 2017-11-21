'use strict';

const pgUsers = require('./entities/pg-users');
const pgApplications = require('./entities/pg-applications');

const pgDao = function () { };

pgDao.init = (app) => {
    // We don't need this.
};

pgDao.users = pgUsers;
pgDao.applications = pgApplications;

module.exports = pgDao;
