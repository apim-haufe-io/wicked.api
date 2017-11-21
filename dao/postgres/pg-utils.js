'use strict';

const async = require('async');
const debug = require('debug')('portal-api:dao:postgres');
const fs = require('fs');
const path = require('path');
const pg = require('pg');

const utils = require('../../routes/utils');
const model = require('../model/model');

const pgUtils = function () { };

pgUtils.init = init;

pgUtils.runMigrations = runMigrations;

pgUtils.runSql = runSql;

// Payload needs to have the following signature:
// function payload(err, client, callback)
pgUtils.withTransaction = withTransaction;

pgUtils.getMetadata = getMetadata;

pgUtils.setMetadata = setMetadata;

// ================================================
// Implementation
// ================================================

const CURRENT_DATABASE_VERSION = 1;

function runMigrations(callback) {
    debug('runMigrations()');
    getMetadata((err, metadata) => {
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
                runSql(migrationSqlFile, (err) => {
                    if (err) {
                        debug(`runMigrations: Migration ${stepNumber} failed.`);
                        return callback(err);
                    }
                    metadata.version = stepNumber;
                    setMetadata(metadata, callback);
                });
            }, callback);
        } else {
            debug('runMigrations: No migrations needed.');
            return callback(null);
        }
    });
}

pgUtils._app = null;
function init(app) {
    pgUtils._app = app;
}

function getMetadata(callback) {
    debug('getMetaData()');
    getPool((err, pool) => {
        if (err)
            return callback(err);
        pool.query('SELECT * FROM wicked.meta WHERE id = 1;', (err, results) => {
            if (err)
                return callback(err);
            if (results.rows.length !== 1)
                return callback(new Error('getMetaData: Unexpected row count ' + results.rows.length));
            return callback(null, results.rows[0].data);
        });
    });
}

function setMetadata(metadata, callback) {
    debug('setMetaData()');
    debug(metadata);
    getPool((err, pool) => {
        if (err)
            return callback(err);
        const now = new Date();
        if (!metadata.create_date)
            metadata.create_date = now;
        metadata.last_update = now;
        pool.query('UPDATE wicked.meta SET data = $1', [metadata], callback);
    });
}

function getApp() {
    if (!pgUtils._app)
        throw new Error('pgUtils: app is not initialized; missed pgUtils.init call?');
    return pgUtils._app;
}

function getPostgresOptions(dbName) {
    // Needs to get things from globals.json
    //const globs = utils.loadGlobals(getApp());
    const options = {
        host: 'localhost',
        user: 'kong',
        password: 'kong',
        database: dbName
    };
    return options;
}

pgUtils._pool = null;
function getPool(callback, isRetry) {
    debug('getPool()');
    if (pgUtils._pool)
        return callback(null, pgUtils._pool);

    debug('getPool: Creating postgres pool');

    if (isRetry) {
        debug('getPool: Retrying after creating the database.');
    }

    const pool = new pg.Pool(getPostgresOptions('wicked'));
    // Try to connect to wicked database
    debug('getPool: Trying to connect');
    pool.connect((err, client, release) => {
        if (client && release)
            release();
        if (err) {
            debug('getPool: Connect to wicked database failed.');
            // Check if it's "database not found"
            if (!isRetry && err.code && err.code.toLowerCase() === '3d000') {
                debug('getPool: wicked database was not found');
                // Yep. We'll create the database and initialize everything.
                return createWickedDatabase((err) => {
                    if (err) {
                        debug('getPool: createWickedDatabase returned an error');
                        return callback(err);
                    }
                    debug('getPool: createWickedDatabase succeeded.');
                    return getPool(callback, true);
                });
            } else {
                debug('getPool: pool.connect returned an unknown/unexpected error');
                // Nope. This is something which we do not expect. Return it and fail please.
                return callback(err);
            }
        }

        // Yay, this is fine.
        pgUtils._pool = pool;
        return callback(null, pool);
    });
}

function createWickedDatabase(callback) {
    debug('createWickedDatabase()');
    const client = new pg.Client(getPostgresOptions('postgres'));
    debug('createWickedDatabase: Connecting to "postgres" database');
    client.connect((err) => {
        if (err) {
            debug('createWickedDatabase: Failed to connect to "postgres" database.');
            return callback(err);
        }
        debug('createWickedDatabase: Creating database "wicked"');
        client.query('CREATE DATABASE wicked;', (err, results) => {
            if (err)
                return callback(err);
            return createInitialSchema(callback);
        });
    });
}

function createInitialSchema(callback) {
    debug('createInitialSchema()');
    const schemaFileName = path.join(__dirname, 'schemas', 'core.sql');
    runSql(schemaFileName, (err) => {
        if (err)
            return callback(err);
        // Make sure we have an update date and that everything works as intended.
        getMetadata((err, metadata) => {
            if (err)
                return callback(err);
            setMetadata(metadata, callback);
        });
    });
}

function runSql(sqlFileName, callback) {
    debug('runSql() ' + sqlFileName);
    const sqlCommands = makeSqlCommandList(sqlFileName);

    withTransaction((err, client, callback) => {
        if (err) {
            if (callback)
                return callback(err);
            console.error(err);
            return;
        }
        // Whoa
        async.mapSeries(sqlCommands, (command, callback) => {
            debug(command);
            client.query(command, callback);
        }, callback);
    }, callback);
}

// Payload needs to have the following signature:
// function payload(err, client, callback)
function withTransaction(payload, next) {
    debug('withTransaction()');
    getPool((err, pool) => {
        if (err)
            return payload(err);
        pool.connect((err, client, release) => {
            if (err) {
                if (release)
                    release();
                return payload(err);
            }
            debug('withTransaction: Starting transaction');
            client.query('BEGIN;', (err, result) => {
                if (err) {
                    debug('withTransaction: FAILED starting transaction.');
                    release();
                    return payload(err);
                }

                debug('withTransaction: Calling transaction payload.');
                payload(null, client, (err) => {
                    debug('withTransaction: Transaction payload returned');
                    if (err) {
                        debug(err);
                        debug('withTransaction: But failed, will rollback');
                        // We'll rollback
                        client.query('ROLLBACK;', (rollbackErr, result) => {
                            if (rollbackErr) {
                                debug('withTransaction: ROLLBACK returned another error');
                                debug(rollbackErr);
                            }
                            release();
                            if (next && typeof (next) === 'function')
                                return next(err);
                        });
                    } else {
                        debug('withTransaction: And succeeded, will commit');
                        // We'll commit
                        client.query('COMMIT;', (commitErr, result) => {
                            release();
                            if (next && typeof (next) === 'function')
                                return next(commitErr);
                        });
                    }
                });
            });
        });
    });
}

// ---------------------------------------------------------

function makeSqlCommandList(sqlFileName) {
    const content = fs.readFileSync(sqlFileName, 'utf8');
    const lines = content.split('\n');

    const sqlCommands = [];

    let current = '';
    for (let i = 0; i < lines.length; ++i) {
        const thisLine = lines[i].trim();
        if (thisLine.startsWith('--'))
            continue;
        if (current === '') {
            current = current + thisLine;
        } else {
            current = current + ' ' + thisLine;
        }
        if (thisLine.endsWith(';')) {
            sqlCommands.push(current);
            current = '';
        }
    }

    return sqlCommands;
}

// ---------------------------------------------------------

function getById(entity, id, callback) {
    return getSingleBy(entity, 'id', id, callback);
}

function getSingleBy(entity, fieldName, fieldValue, callback) {
    getBy(entity, fieldName, fieldValue, 0, 0, (err, resultArray) => {
        if (err)
            return callback(err);
        if (resultArray.length === 0)
            return callback(null, null);
        if (resultArray.length === 1)
            return callback(null, resultArray[0]);
        return new Error('pgUtils: getSingleBy: Returned ' + resultArray.length + ' results, must only return a single result.');
    });
}

function getBy(entity, fieldName, fieldValue, offset, limit, callback) {
    getPool((err, pool) => {
        if (err)
            return callback(err);
        let query = `SELECT * FROM wicked.${entity} WHERE ${fieldName} = $1`;
        if (offset > 0 && limit > 0)
            query = query + ` LIMIT ${limit} OFFSET ${offset}`;
        pool.query(query, [fieldValue], (err, result) => {
            if (err)
                return callback(err);
            return callback(null, normalizeResult(entity, result));
        });
    });
}

function normalizeResult(entity, resultList) {
    const normalizedResult = [];
    const entityModel = model[entity];
    for (let i = 0; i < resultList.rows.length; ++i) { 

    }
    return normalizedResult;
}

module.exports = pgUtils;
