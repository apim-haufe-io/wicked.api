'use strict';

const async = require('async');
const { debug, info, warn, error } = require('portal-env').Logger('portal-api:dao:pg:utils');
const fs = require('fs');
const path = require('path');
const pg = require('pg');

const utils = require('../../routes/utils');
const model = require('../model/model');

const pgUtils = function () { };

// This means portal-api will try for around a minute to connect to Postgres,
// then it will fail (and subsequently be restarted by some orchestrator)
const POSTGRES_CONNECT_RETRIES = 30;
const POSTGRES_CONNECT_DELAY = 2000;

pgUtils.runSql = (sqlFileName, callback) => {
    debug('runSql() ' + sqlFileName);
    const sqlCommands = makeSqlCommandList(sqlFileName);

    pgUtils.withTransaction((err, client, callback) => {
        if (err) {
            if (callback)
                return callback(err);
            error(err);
            return;
        }
        // Whoa
        async.mapSeries(sqlCommands, (command, callback) => {
            debug(command);
            client.query(command, callback);
        }, callback);
    }, callback);
};

pgUtils.getMetadata = (callback) => {
    debug('getMetaData()');
    getPoolOrClient((err, pool) => {
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
};

pgUtils.createMetadata = (callback) => {
    debug('createMetadata()');
    getPoolOrClient((err, pool) => {
        if (err)
            return callback(err);
        const now = new Date();
        const metadata = {
            version: 0,
            create_date: now,
            last_update: now
        };
        pool.query('INSERT INTO wicked.meta (id, data) VALUES ($1, $2)', [1, metadata], callback);
    });
};

pgUtils.setMetadata = (metadata, callback) => {
    debug('setMetaData()');
    debug(metadata);
    getPoolOrClient((err, pool) => {
        if (err)
            return callback(err);
        const now = new Date();
        if (!metadata.create_date)
            metadata.create_date = now;
        metadata.last_update = now;
        pool.query('UPDATE wicked.meta SET data = $1', [metadata], callback);
    });
};

const _channelMap = {};
let _listenerClient = null;
pgUtils.listenToChannel = (channelName, eventSink, callback) => {
    debug(`listenToTopic(${channelName})`);

    const hookChannel = (client) => {
        debug('Hooking channel ' + channelName);
        _channelMap[channelName] = eventSink;
        client.query(`LISTEN ${channelName}`, (err) => {
            debug(`LISTEN ${channelName} error: ${err}`);
        });
    };

    if (_listenerClient) {
        hookChannel(_listenerClient);
    } else {
        debug('listenToChannel - setting up listener PG client');
        // Initial setup
        _listenerClient = new pg.Client(getPostgresOptions('wicked'));

        _listenerClient.connect((err) => {
            if (err)
                return callback(err);
            debug('listenToChannel - connect was successful');
            _listenerClient.on('notification', (data) => {
                const channel = data.channel;
                debug('received notification on channel ' + channel);
                if (_channelMap[channel]) {
                    const payload = JSON.parse(data.payload);
                    _channelMap[channel](payload);
                } else {
                    debug('WARNING: Unknown channel ' + channel);
                }
            });

            hookChannel(_listenerClient);
        });
    }
};

/**
 * Utility function to wrap a Postgres transaction.
 * 
 * @param {function(Error, PostgresClient, Function)} payload Is invoked as payload(err, client, callback), whereas
 * client is a Postgres Client, and callback must be invoked as callback(err) when
 * the payload function is done with using the transaction. This will close (commit)
 * the transaction if callback is called with `null`, if it's called with an error,
 * the transaction will be rolled back (`ROLLBACK`).
 * @param {Function} next This function will be invoked as next(err), where either
 * the inner error is returned if something inside the payload caused an error (and
 * subsequent rollback), or the commit error if there was an error committing the
 * transaction. In case everything is fine, `next(null)` is invoked.
 */
pgUtils.withTransaction = (payload, next) => {
    debug('withTransaction()');
    getPoolOrClient((err, pool) => {
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
};

// Options:
// {
//   client: PG client to use, null for pool
// }
pgUtils.getById = (entity, id, optionsOrCallback, callback) => {
    debug('getById()');
    return pgUtils.getSingleBy(entity, 'id', id, optionsOrCallback, callback);
};

// Options:
// {
//   client: PG client to use, null for pool
// }
pgUtils.getSingleBy = (entity, fieldNameOrNames, fieldValueOrValues, optionsOrCallback, callback) => {
    debug('getSingleBy()');
    let options = optionsOrCallback;
    if (!callback && typeof (optionsOrCallback) === 'function') {
        callback = optionsOrCallback;
        options = {};
    }

    if ((Array.isArray(fieldNameOrNames) && !Array.isArray(fieldValueOrValues)) ||
        (!Array.isArray(fieldNameOrNames) && Array.isArray(fieldValueOrValues)))
        return callback(utils.makeError(500, 'getSingleBy: Either both names and values have to arrays, or none'));

    const fieldNames = Array.isArray(fieldNameOrNames) ? fieldNameOrNames : [fieldNameOrNames];
    const fieldValues = Array.isArray(fieldValueOrValues) ? fieldValueOrValues : [fieldValueOrValues];

    pgUtils.getBy(entity, fieldNames, fieldValues, options, (err, resultList) => {
        if (err)
            return callback(err);
        if (resultList.length === 0)
            return callback(null, null);
        if (resultList.length === 1)
            return callback(null, resultList[0]);
        return callback(utils.makeError(500, 'pgUtils: getSingleBy: Returned ' + resultList.length + ' results, must only return a single result.'));
    });
};

// Options:
// {
//   offset: result offset,
//   limit: result limit (max count),
//   client: PG client to use, null for pool
//   orderBy: order by field, e.g. "name ASC"
//   operators: ['=', 'LIKE', '!=']
// }
pgUtils.getBy = (entity, fieldNameOrNames, fieldValueOrValues, optionsOrCallback, callback) => {
    debug(`getBy(${entity}, ${fieldNameOrNames}, ${fieldValueOrValues})`);
    if (!fieldNameOrNames)
        fieldNameOrNames = [];
    if (!fieldValueOrValues)
        fieldValueOrValues = [];
    if ((Array.isArray(fieldNameOrNames) && !Array.isArray(fieldValueOrValues)) ||
        (!Array.isArray(fieldNameOrNames) && Array.isArray(fieldValueOrValues)))
        return callback(utils.makeError(500, 'getSingleBy: Either both names and values have to arrays, or none'));

    const fieldNames = Array.isArray(fieldNameOrNames) ? fieldNameOrNames : [fieldNameOrNames];
    const fieldValues = Array.isArray(fieldValueOrValues) ? fieldValueOrValues : [fieldValueOrValues];

    if (fieldNames.length !== fieldValues.length)
        return callback(utils.makeError(500, 'PG Utils: field names array length mismatches field value array length'));

    let options = optionsOrCallback;
    if (!callback && typeof (optionsOrCallback) === 'function') {
        callback = optionsOrCallback;
        options = null;
    }
    let client = null;
    let offset = 0;
    let limit = 0;
    let orderBy = null;
    let operators = [];
    fieldNames.forEach(f => operators.push('='));
    if (options) {
        if (options.client)
            client = options.client;
        if (options.offset)
            offset = options.offset;
        if (options.limit)
            limit = options.limit;
        if (options.orderBy)
            orderBy = options.orderBy;
        if (options.operators) {
            operators = options.operators;
            if (operators.length !== fieldNames.length) {
                return callback(utils.makeError(500, `Querying ${entity}: Length of operators array does not match field names array.`));
            }
        }
    }
    getPoolOrClient(client, (err, poolOrClient) => {
        if (err)
            return callback(err);
        let query = `SELECT * FROM wicked.${entity}`;
        if (fieldNames.length > 0)
            query += ` WHERE ${fieldNames[0]} ${operators[0]} $1`;
        // This may be an empty loop
        for (let i = 1; i < fieldNames.length; ++i)
            query += ` AND ${fieldNames[i]} ${operators[i]} $${i + 1}`;
        if (offset > 0 && limit > 0)
            query += ` LIMIT ${limit} OFFSET ${offset}`;
        if (orderBy)
            query += ` ORDER BY ${orderBy}`;
        poolOrClient.query(query, fieldValues, (err, result) => {
            if (err)
                return callback(err);
            try {
                const normalizedResult = normalizeResult(entity, result);
                return callback(null, normalizedResult);
            } catch (err) {
                debug('normalizeResult failed: ' + err.message);
                debug(query);
                debug(fieldValues);
                debug(result);
                debug(err);
                return callback(err);
            }
        });
    });
};

// If you're in a transaction, pass in the client given from withTransaction
// as clientOrCallback, otherwise just pass in the callback, and the PG pool
// will be used.
pgUtils.upsert = (entity, data, upsertingUserId, clientOrCallback, callback) => {
    debug(`upsert(${entity}, ...)`);
    sortOutClientAndCallback(clientOrCallback, callback, (client, callback) => {
        const pgRow = postgresizeRow(entity, data, upsertingUserId);
        const { fieldNames, fieldValues } = getFieldArrays(entity, pgRow);
        const fieldNamesString = assembleFieldsString(fieldNames);
        const placeholdersString = assemblePlaceholdersString(fieldNames);
        const updatesString = assembleUpdatesString(fieldNames);

        const sql = `INSERT INTO wicked.${entity} (${fieldNamesString}) VALUES(${placeholdersString}) ON CONFLICT (id) DO UPDATE SET ${updatesString}`;
        debug(sql);

        client.query(sql, fieldValues, (err, result) => {
            if (err)
                return callback(err);
            debug('upsert finished succesfully.');
            return callback(null, data);
        });
    });
};

pgUtils.deleteById = (entity, id, clientOrCallback, callback) => {
    debug(`deleteById(${entity}, ${id}) `);
    return pgUtils.deleteBy(entity, ['id'], [id], clientOrCallback, callback);
};

pgUtils.deleteBy = (entity, fieldNameOrNames, fieldValueOrValues, clientOrCallback, callback) => {
    debug(`deleteById(${entity}, ${fieldNameOrNames}, ${fieldValueOrValues}) `);
    if (!fieldNameOrNames)
        fieldNameOrNames = [];
    if (!fieldValueOrValues)
        fieldValueOrValues = [];

    if ((Array.isArray(fieldNameOrNames) && !Array.isArray(fieldValueOrValues)) ||
        (!Array.isArray(fieldNameOrNames) && Array.isArray(fieldValueOrValues)))
        return callback(utils.makeError(500, 'deleteBy: Either both names and values have to arrays, or none'));

    const fieldNames = Array.isArray(fieldNameOrNames) ? fieldNameOrNames : [fieldNameOrNames];
    const fieldValues = Array.isArray(fieldValueOrValues) ? fieldValueOrValues : [fieldValueOrValues];

    if (fieldNames.length !== fieldValues.length)
        return callback(utils.makeError(500, 'deleteBy: field names array length mismatches field value array length'));

    sortOutClientAndCallback(clientOrCallback, callback, (client, callback) => {
        let sql = `DELETE FROM wicked.${entity} `;
        if (fieldNames.length === 0)
            return callback(utils.makeError(500, 'deleteBy: Unconditional DELETE detected, not allowing'));
        sql += ` WHERE ${fieldNames[0]} = $1`;
        for (let i = 1; i < fieldNames.length; ++i)
            sql += ` AND ${fieldNames[i]} = \$${i + 1} `;
        client.query(sql, fieldValues, (err, result) => {
            if (err)
                return callback(err);
            return callback(null);
        });
    });
};

/**
 * Checks whether `callback` is not null, and function. Throws an error otherwise.
 */
pgUtils.checkCallback = (callback) => {
    if (!callback || typeof (callback) !== 'function') {
        error('Value of callback: ' + callback);
        throw new Error('Parameter "callback" is null or not a function');
    }
};

pgUtils.count = function (entity, clientOrCallback, callback) {
    debug(`countRows(${entity}) `);
    sortOutClientAndCallback(clientOrCallback, callback, (client, callback) => {
        const sql = `SELECT COUNT(*) as count FROM wicked.${entity} `;
        client.query(sql, (err, result) => {
            if (err)
                return callback(err);
            if (result.rows.length !== 1)
                return callback(utils.makeError(500, 'countRows: SELECT COUNT(*) did not return a single row.'));
            return callback(null, result.rows[0].count);
        });
    });
};

// ================================================
// Auxiliary functions
// ================================================

function getPostgresOptions(dbName) {
    debug('getPostgresOptions()');
    // Needs to get things from globals.json
    const glob = utils.loadGlobals();
    const options = {
        host: glob.storage.pgHost,
        port: glob.storage.pgPort,
        user: glob.storage.pgUser,
        password: glob.storage.pgPassword,
        database: dbName
    };
    debug(options);
    return options;
}

pgUtils._pool = null;
function getPoolOrClient(clientOrCallback, callback, isRetry, retryCounter) {
    debug('getPoolOrClient()');
    if (typeof (callback) === 'function' && clientOrCallback) {
        debug('getPoolOrClient: Received prepopulated client, just returning it');
        return callback(null, clientOrCallback);
    }
    if (typeof (clientOrCallback) === 'function') {
        // Shift parameters left
        retryCounter = isRetry;
        isRetry = callback;
        callback = clientOrCallback;
    }
    if (pgUtils._pool) {
        debug('getPoolOrClient: Returning previously created connection pool');
        return callback(null, pgUtils._pool);
    }
    if (!retryCounter) {
        retryCounter = 0;
    } else {
        debug('Retrying to connect to Postgres, try #' + (retryCounter + 1));
    }

    debug('getPoolOrClient: Creating postgres pool');

    if (isRetry) {
        debug('getPoolOrClient: Retrying after creating the database.');
    }

    const pgOptions = getPostgresOptions('wicked');
    const pool = new pg.Pool(pgOptions);
    // Try to connect to wicked database
    debug('getPoolOrClient: Trying to connect');
    pool.connect((err, client, release) => {
        if (client && release)
            release();
        if (err) {
            debug('getPoolOrClient: Connect to wicked database failed.');
            const errorCode = err.code ? err.code.toUpperCase() : '';
            // Check if it's "database not found"
            if (!isRetry && errorCode === '3D000') {
                debug('getPoolOrClient: wicked database was not found');
                // Yep. We'll create the database and initialize everything.
                return createWickedDatabase((err) => {
                    if (err) {
                        debug('getPoolOrClient: createWickedDatabase returned an error');
                        return callback(err);
                    }
                    debug('getPoolOrClient: createWickedDatabase succeeded.');
                    return getPoolOrClient(callback, true);
                });
            } else if (errorCode === 'ECONNREFUSED' || // Postgres not answering at all
                errorCode === '57P03') // "Postgres is starting up"
            {
                if (retryCounter < POSTGRES_CONNECT_RETRIES - 1) {
                    error(`Could not connect to Postgres, will retry (#${retryCounter + 1}). Host: ${pgOptions.host}:${pgOptions.port}, user ${pgOptions.user}`);
                    debug(`getPoolOrClient: Postgres returned ${err.code}, options:`);
                    debug(pgOptions);
                    debug(`Will retry in ${POSTGRES_CONNECT_DELAY}ms`);
                    return setTimeout(getPoolOrClient, POSTGRES_CONNECT_DELAY, callback, false, retryCounter + 1);
                } else {
                    error('Reached maximum tries to connect to Postgres. Failing.');
                    return callback(err);
                }
            } else {
                debug(err);
                debug('getPoolOrClient: pool.connect returned an unknown/unexpected error; error code: ' + errorCode);
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
    pgUtils.runSql(schemaFileName, (err) => {
        if (err)
            return callback(err);
        pgUtils.createMetadata(err => {
            if (err)
                return callback(err);
            // Make sure we have an update date and that everything works as intended.
            pgUtils.getMetadata((err, metadata) => {
                if (err)
                    return callback(err);
                pgUtils.setMetadata(metadata, callback);
            });
        });
    });
}


// ---------------------------------------------------------

function makeSqlCommandList(sqlFileName) {
    debug('makeSqlCommandList()');
    const content = fs.readFileSync(sqlFileName, 'utf8');
    const lines = content.split('\n');

    const sqlCommands = [];

    let current = '';
    let inDollarQuote = false;
    for (let i = 0; i < lines.length; ++i) {
        const thisLine = lines[i].trim();
        if (thisLine.startsWith('--'))
            continue;
        if (!inDollarQuote && thisLine.indexOf('$$') >= 0) {
            inDollarQuote = true;
        }
        if (current === '') {
            current = current + thisLine;
        } else {
            current = current + ' ' + thisLine;
        }
        if (inDollarQuote) {
            if (thisLine.endsWith('$$;')) {
                sqlCommands.push(current);
                current = '';
                inDollarQuote = false;
            }
        } else if (thisLine.endsWith(';')) {
            sqlCommands.push(current);
            current = '';
        }
    }

    return sqlCommands;
}

// ---------------------------------------------------------


function normalizeResult(entity, resultList) {
    debug('normalizeResult()');
    if (!resultList)
        throw utils.makeError(500, 'normalizeResult: resultList is null');
    if (!resultList.rows)
        return [];
    if (!Array.isArray(resultList.rows)) {
        debug('normalizeResult: resultList.rows is not an Array');
        return [];
    }
    const normalizedResult = [];
    const entityModel = model[entity];
    for (let i = 0; i < resultList.rows.length; ++i) {
        const row = resultList.rows[i];
        const normRow = Object.assign({}, row.data || {});
        normRow.id = row.id;
        const props = entityModel.properties;
        for (let pgName in props) {
            let prop = props[pgName];
            let jsonName = pgName;
            if (prop.property_name)
                jsonName = prop.property_name;
            normRow[jsonName] = row[pgName];
            if (!prop.optional && !row[pgName])
                throw utils.makeError(500, `PG Utils: Row with id ${row.id} of entity ${entity} is empty but is not optional.`);
        }
        normalizedResult.push(normRow);
    }
    return normalizedResult;
}

function postgresizeRow(entity, data, upsertingUserId) {
    debug('postgresizeRow()');
    // Shallow copy
    const pgRow = {
        data: Object.assign({}, data)
    };
    if (!data.id)
        throw utils.makeError(500, `PG Utils: Missing unique index "id" for entity ${entity}.`);
    // Take out the id from the data and explitcitly put it in the row model
    delete pgRow.data.id;
    pgRow.id = data.id;

    // Add meta data
    pgRow.data.changedDate = new Date();
    if (upsertingUserId)
        pgRow.data.changedBy = upsertingUserId;
    else if (pgRow.data.changedBy)
        delete pgRow.data.changedBy;

    // Map JSON structure to a structure matching what node-postgres expects,
    // i.e. move out the declared explicit fields into the real fields of the 
    // backing postgres table (see model.js) and take the rest into the data
    // field.
    const props = model[entity].properties;
    for (let pgName in props) {
        let prop = props[pgName];
        let jsonName = prop.property_name || pgName;
        delete pgRow.data[jsonName];
        pgRow[pgName] = data[jsonName];
        if (!prop.optional && !data[jsonName])
            throw utils.makeError(500, `PG Utils: Missing mandatory property ${jsonName} for entity ${entity}`);
    }
    return pgRow;
}
function getFieldArrays(entity, pgData) {
    const fieldNames = ['id'];
    const fieldValues = [pgData.id];
    const props = model[entity].properties;
    for (let pgName in props) {
        fieldNames.push(pgName);
        fieldValues.push(pgData[pgName]);
    }
    fieldNames.push('data');
    fieldValues.push(pgData.data);
    return {
        fieldNames: fieldNames,
        fieldValues: fieldValues
    };
}

function assembleFieldsStringInternal(fieldNames, offset, prefix) {
    let fieldString = prefix + fieldNames[offset];
    for (let i = offset + 1; i < fieldNames.length; ++i) {
        fieldString += ', ' + prefix + fieldNames[i];
    }
    return fieldString;
}

function assembleFieldsString(fieldNames) {
    return assembleFieldsStringInternal(fieldNames, 0, '');
}

function assembleUpdateFieldsString(fieldNames) {
    return assembleFieldsStringInternal(fieldNames, 1, 'EXCLUDED.');
}

function assembleUpdatesString(fieldNames) {
    let updateString = `${fieldNames[1]} = \$2`;
    for (let i = 2; i < fieldNames.length; ++i)
        updateString += `, ${fieldNames[i]} = \$${i + 1}`;
    return updateString;
}

function assemblePlaceholdersStringInternal(fieldNames, offset) {
    let placeholders = '$' + (offset + 1);
    for (let i = offset + 1; i < fieldNames.length; ++i) {
        placeholders += ', $' + (i + 1);
    }
    return placeholders;
}

function assemblePlaceholdersString(fieldNames) {
    return assemblePlaceholdersStringInternal(fieldNames, 0);
}


function sortOutClientAndCallback(clientOrCallback, callback, payload) {
    let client = clientOrCallback;
    if (!callback && typeof (clientOrCallback) === 'function') {
        callback = clientOrCallback;
        client = null;
    }
    getPoolOrClient(client, (err, client) => {
        if (err)
            return callback(err);
        payload(client, callback);
    });
}

module.exports = pgUtils;
