'use strict';

const async = require('async');
const debug = require('debug')('portal-api:dao:pg:meta');
const path = require('path');

const utils = require('../../routes/utils');
const pgUtils = require('./pg-utils');

const pgMeta = function () { };

pgMeta.getInitChecks = (callback) => {
    debug('getInitChecks()');
    return [
        runMigrations
    ];
};

// ================================================
// Implementation
// ================================================

const CURRENT_DATABASE_VERSION = 1;

function runMigrations(glob, callback) {
    debug('runMigrations()');
    // Note: At first run, this "getMetadata" will trigger database creation,
    // including adding the core schema.
    pgUtils.getMetadata((err, metadata) => {
        if (err)
            return callback(err);
        debug('runMigrations: Current version is ' + metadata.version);
        if (metadata.version < CURRENT_DATABASE_VERSION) {
            debug('runMigrations: Desired version is ' + CURRENT_DATABASE_VERSION);
            // We need to run migrations
            const migrationSteps = [];
            for (let i = metadata.version + 1; i <= CURRENT_DATABASE_VERSION; ++i)
                migrationSteps.push(i);
            async.mapSeries(migrationSteps, (stepNumber, callback) => {
                const migrationSqlFile = path.join(__dirname, 'schemas', `migration-${stepNumber}.sql`);
                pgUtils.runSql(migrationSqlFile, (err) => {
                    if (err) {
                        debug(`runMigrations: Migration ${stepNumber} failed.`);
                        return callback(err);
                    }
                    metadata.version = stepNumber;
                    pgUtils.setMetadata(metadata, callback);
                });
            }, (err) => {
                if (err)
                    return callback(err);
                debug('runMigrations successfully finished.');
                return callback(null);
            });
        } else {
            debug('runMigrations: No migrations needed.');
            return callback(null);
        }
    });
}

module.exports = pgMeta;
