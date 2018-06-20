'use strict';

const async = require('async');
const { debug, info, warn, error } = require('portal-env').Logger('portal-api:dao:pg:meta');
const path = require('path');

const CURRENT_DATABASE_VERSION = 1;

class PgMeta {
    constructor(pgUtils) {
        this.pgUtils = pgUtils;
    }

    getInitChecks() {
        debug('getInitChecks()');
        const instance = this;
        return [
            (glob, callback) => instance.runMigrations(glob, callback)
        ];
    }

    wipe(callback) {
        debug('wipe()');
        // Woooowahjkhkssdfarghl
        this.pgUtils.dropWickedDatabase(callback);
    }

    // ================================================
    // Implementation
    // ================================================

    runMigrations(glob, callback) {
        debug('runMigrations()');
        // Note: At first run, this "getMetadata" will trigger database creation,
        // including adding the core schema.
        const instance = this;
        this.pgUtils.getMetadata((err, metadata) => {
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
                    instance.pgUtils.runSql(migrationSqlFile, (err) => {
                        if (err) {
                            debug(`runMigrations: Migration ${stepNumber} failed.`);
                            return callback(err);
                        }
                        metadata.version = stepNumber;
                        instance.pgUtils.setMetadata(metadata, callback);
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
}

module.exports = PgMeta;
