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
    jsonUtils.checkCallback(callback);
    let userRegistration;
    try {
        userRegistration = jsonRegistrations.getByPoolAndUserSync(poolId, userId);
    } catch (err) {
        return callback(err);
    }
    return callback(null, userRegistration);
};

jsonRegistrations.getByPoolAndNamespace = (poolId, namespace, filter, orderBy, offset, limit, noCountCache, callback) => {
    debug(`getByPoolAndNamespace(${poolId}, ${namespace}, ${filter}, ${orderBy})`);
    jsonUtils.checkCallback(callback);
    let registrations;
    try {
        registrations = jsonRegistrations.getByPoolAndNamespaceSync(poolId, namespace, filter, orderBy, offset, limit);
    } catch (err) {
        return callback(err);
    }
    return callback(null, registrations.rows, { count: registrations.count, cached: false });
};

jsonRegistrations.getByUser = (userId, callback) => {
    debug(`getByUser(${userId})`);
    jsonUtils.checkCallback(callback);
    let registrations;
    try {
        registrations = jsonRegistrations.getByUserSync(userId);
    } catch (err) {
        return callback(err);
    }
    return callback(null, registrations.rows, { count: registrations.count, cached: false });
};

jsonRegistrations.upsert = (poolId, userId, upsertingUserId, userData, callback) => {
    debug(`upsert(${userId})`);
    jsonUtils.checkCallback(callback);
    try {
        jsonRegistrations.upsertSync(poolId, userId, userData);
    } catch (err) {
        return callback(err);
    }
    return callback(null);
};

jsonRegistrations.delete = (poolId, userId, deletingUserId, callback) => {
    debug(`delete(${userId})`);
    jsonUtils.checkCallback(callback);
    try {
        jsonRegistrations.deleteSync(poolId, userId);
    } catch (err) {
        return callback(err);
    }
    return callback(null);
};

// =================================================
// DAO implementation/internal methods
// =================================================

function makeRegsFileName(poolId, userId) {
    const regsDir = path.join(utils.getDynamicDir(), 'registrations');
    const regsFile = path.join(regsDir, `${poolId}_${userId}.json`);
    return regsFile;
}

function hasRegistration(poolId, userId) {
    debug(`hasRegistration(${poolId}, ${userId})`);
    const regsFile = makeRegsFileName(poolId, userId);
    if (fs.existsSync(regsFile))
        return true;
    return false;
}

jsonRegistrations.getByPoolAndUserSync = (poolId, userId) => {
    debug(`getByPoolAndUserSync(${poolId}, ${userId})`);

    if (!hasRegistration(poolId, userId)) {
        warn(`Registration record for user ${userId} in pool ${poolId} not found.`);
        throw utils.makeError(404, 'Registration not found');
    }
    const regsFile = makeRegsFileName(poolId, userId);
    const regsJson = JSON.parse(fs.readFileSync(regsFile, 'utf8'));
    debug(regsJson);
    return regsJson;
};

jsonRegistrations.getByUserSync = (userId) => {
    debug(`getByUser(${userId})`);

    // The userIndex contains pools this user has registrations for
    const userIndex = readUserIndex(userId);
    const tmp = { pools: {} };
    for (let i = 0; i < userIndex.length; ++i) {
        const poolId = userIndex[i];
        tmp.pools[poolId] = jsonRegistrations.getByPoolAndUserSync(poolId, userId);
    }
    return { rows: tmp, count: userIndex.length };
};


jsonRegistrations.getByPoolAndNamespaceSync = (poolId, namespace, filter, orderBy, offset, limit) => {
    debug(`getByPoolAndNamespaceSync(${poolId}, ${namespace}, ${filter}, ${orderBy})`);
    // Note: All indexes are always sorted by name internally anyway,
    // so we don't have to do that here.
    let indexList;
    if (!namespace) {
        // Use the "big" pool index
        indexList = readPoolIndex(poolId);
    } else {
        // We need to use the namespace index
        indexList = readNamespaceIndex(poolId, namespace);
    }

    const tmpArray = [];
    for (let i = 0; i < indexList.length; ++i) {
        const entry = indexList[i]; // contains id and name
        const thisReg = jsonRegistrations.getByPoolAndUserSync(poolId, entry.id);
        tmpArray.push(thisReg);
    }

    if (!orderBy)
        orderBy = 'name ASC';

    const { list, filterCount } = jsonUtils.filterAndPage(tmpArray, filter, orderBy, offset, limit);
    // Now return the list
    return { rows: list, count: filterCount };
};

jsonRegistrations.upsertSync = (poolId, userId, userData) => {
    debug(`upsertSync(${userId})`);

    let previousNamespace;
    if (hasRegistration(poolId, userId)) {
        const preUpdateData = jsonRegistrations.getByPoolAndUserSync(poolId, userId);
        previousNamespace = preUpdateData.namespace; // This may be undefined
    }
    const newNamespace = userData.namespace; // This may also be undefined, that's fine
    const newName = userData.name ? userData.name : '';

    // Probably not necessary, but mustn't hurt
    userData.userId = userId;
    userData.poolId = poolId;
    const regsFile = makeRegsFileName(poolId, userId);
    fs.writeFileSync(regsFile, JSON.stringify(userData, null, 2), 'utf8');

    // Update the user index
    ensureUserIndex(poolId, userId);
    // Update the pool index
    ensurePoolIndex(poolId, userId, newName);
    // Update the namespace index
    ensureNamespaceIndex(poolId, userId, newName, previousNamespace, newNamespace);
};

jsonRegistrations.deleteSync = (poolId, userId) => {
    debug(`deleteSync(${userId})`);

    let previousNamespace;
    if (hasRegistration(poolId, userId)) {
        const preUpdateData = jsonRegistrations.getByPoolAndUserSync(poolId, userId);
        previousNamespace = preUpdateData.namespace; // This may be undefined
    }

    const regsFile = makeRegsFileName(poolId, userId);
    if (!fs.existsSync(regsFile)) {
        warn(`deleteSync: File ${regsFile} does not exist, cannot delete`);
        throw utils.makeError(404, 'User not found');
    }
    fs.unlinkSync(regsFile);
    debug(`deleteSync: Deleted file ${regsFile}`);

    // Clean up in indexes
    deleteFromUserIndex(poolId, userId);
    deleteFromPoolIndex(poolId, userId);
    if (previousNamespace)
        deleteFromNamespaceIndex(poolId, previousNamespace, userId);
};

// =================================================
// User Index updating helper methods
// =================================================

function getUserIndexFile(userId) {
    if (!userId)
        throw new Error(`getUserIndexFile: userId is empty`);
    const regsDir = path.join(utils.getDynamicDir(), 'registrations');
    const userIndex = path.join(regsDir, `${userId}.json`);
    return userIndex;
}

function readUserIndex(userId) {
    const userIndexFile = getUserIndexFile(userId);
    if (!fs.existsSync(userIndexFile))
        return [];
    return JSON.parse(fs.readFileSync(userIndexFile));
}

function writeUserIndex(userId, userIndex) {
    const userIndexFile = getUserIndexFile(userId);
    fs.writeFileSync(userIndexFile, JSON.stringify(userIndex, null, 2), 'utf8');
}

function ensureUserIndex(poolId, userId) {
    debug(`ensureUserIndex(${poolId}, ${userId})`);
    const userIndex = readUserIndex(userId);
    const poolPos = userIndex.findIndex(e => e === poolId);
    if (poolPos < 0) {
        // Not found, insert
        userIndex.push(poolId);
        writeUserIndex(userId, userIndex);
    }
}

function deleteFromUserIndex(poolId, userId) {
    debug(`ensureUserIndex(${poolId}, ${userId})`);
    debug(`ensureUserIndex(${poolId}, ${userId})`);
    const userIndex = readUserIndex(userId);
    const poolPos = userIndex.findIndex(e => e === poolId);
    if (poolPos >= 0) {
        userIndex.splice(poolPos, 1);
        writeUserIndex(userId, userIndex);
    } else {
        throw new Error(`deleteFromUserIndex: Pool ID ${poolId} not found in user index ${userId}`);
    }
}

// =================================================
// Pool Index updating helper methods
// =================================================

function sortIndex(index) {
    function compare(a, b) {
        if (a.name < b.name)
            return -1;
        if (a.name > b.name)
            return 1;
        return 0;
    }

    index.sort(compare);
}

function getPoolIndexFile(poolId) {
    if (!poolId)
        throw new Error(`getPoolIndexFile: poolId is empty`);
    const regsDir = path.join(utils.getDynamicDir(), 'registrations');
    const poolIndex = path.join(regsDir, `${poolId}.json`);
    return poolIndex;
}

function readPoolIndex(poolId) {
    const indexFile = getPoolIndexFile(poolId);
    if (!fs.existsSync(indexFile)) {
        return [];
    }
    return JSON.parse(fs.readFileSync(indexFile, 'utf8'));
}

function sanityCheckPoolIndex(poolId, poolIndex) {
    debug(`sanityCheckPoolIndex(${poolId})`);
    const idMap = {};
    for (let i = 0; i < poolIndex.length; ++i) {
        const id = poolIndex[i].id;
        const name = poolIndex[i].name;
        if (idMap[id])
            throw new Error(`sanityCheckPoolIndex(${poolId}): Duplicate id detected: ${id} (${name})`);
        idMap[id] = true;
    }
}

function writePoolIndex(poolId, poolIndex) {
    const indexFile = getPoolIndexFile(poolId);
    sanityCheckPoolIndex(poolId, poolIndex);
    sortIndex(poolIndex);
    fs.writeFileSync(indexFile, JSON.stringify(poolIndex, null, 2), 'utf8');
}

function ensurePoolIndex(poolId, userId, name) {
    debug(`ensurePoolIndex(${poolId}, ${userId}, ${name})`);

    const poolIndex = readPoolIndex(poolId);
    const userPos = poolIndex.findIndex(e => e.id === userId);
    if (userPos >= 0) {
        debug(`User ${userId} already present in pool index for pool ${poolId}`);
        if (poolIndex[userPos].name === name) {
            // All is good, no need to update
            return;
        }
        // Remove and re-add
        poolIndex.splice(userPos, 1);
    } else {
        debug(`Adding user ${userId} to pool index for pool ${poolId}`);
    }
    poolIndex.push({
        id: userId,
        name: name
    });
    writePoolIndex(poolId, poolIndex);
}

function deleteFromPoolIndex(poolId, userId) {
    debug(`deleteFromPoolIndex(${poolId}, ${userId})`);

    const poolIndex = readPoolIndex(poolId);
    const userPos = poolIndex.findIndex(e => e.id === userId);
    if (userPos < 0) {
        warn(`deleteFromPoolIndex: User ${userId} was not found in ${poolId}`);
        return;
        // throw utils.makeError(404, `deleteFromPoolIndex: User ${userId} was not found in ${poolId}`);
    }
    poolIndex.splice(userPos, 1);
    writePoolIndex(poolId, poolIndex);
}

// =================================================
// Namespace updating helper methods
// =================================================

/*

Namespace index files; namespaces are a sharding of registration pools,
they are not orthogonal to pools! I.e. a namespace always belongs to
exactly one pool.

[
    {
        "id": "<user id>",
        "name": "<user display name>"
    },
    ...
]
*/

function getNamespaceIndexFile(poolId, namespace) {
    if (!namespace)
        throw new Error("It doesn't make sense to get a namespace file for an empty namespace");
    const regsDir = path.join(utils.getDynamicDir(), 'registrations');
    const namespaceIndex = path.join(regsDir, `${poolId}_NS_${namespace}.json`);
    return namespaceIndex;
}

function readNamespaceIndex(poolId, namespace) {
    const indexFile = getNamespaceIndexFile(poolId, namespace);
    if (fs.existsSync(indexFile))
        return JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    return [];
}

function sanityCheckNamespaceIndex(poolId, namespace, namespaceData) {
    debug('sanityCheckNamespaceIndex()');
    const idMap = {};
    for (let i = 0; i < namespaceData; ++i) {
        const data = namespaceData[i];
        const id = data.id;
        if (idMap[id])
            throw new Error(`Found duplicate ID in namespace map: ${id} (${data.name}), pool: ${poolId}, namespace ${namespace}`);
        idMap[id] = data.name;
    }
}

function writeNamespaceIndex(poolId, namespace, namespaceIndex) {
    const indexFile = getNamespaceIndexFile(poolId, namespace);
    sanityCheckNamespaceIndex(poolId, namespace, namespaceIndex);
    sortIndex(namespaceIndex);
    fs.writeFileSync(indexFile, JSON.stringify(namespaceIndex, null, 2), 'utf8');
}

function upsertNamespaceIndex(poolId, namespace, userId, name) {
    debug(`upsertNamespaceIndex(${poolId}, ${namespace}, ${userId}, ${name})`);
    const index = readNamespaceIndex(poolId, namespace);
    const userIndex = index.findIndex(e => e.id === userId);
    const entry = {
        id: userId,
        name: name
    };
    if (userIndex >= 0) {
        debug(`upsertIndex: Updating entry.`);
        index[userIndex] = entry;
    } else {
        debug(`upsertIndex: New entry.`);
        index.push(entry);
    }
    writeNamespaceIndex(poolId, namespace, index);
}

function deleteFromNamespaceIndex(poolId, namespace, userId) {
    debug(`deleteFromNamespaceIndex(${poolId}, ${namespace}, ${userId})`);
    const index = readNamespaceIndex(poolId, namespace);
    const userIndex = index.findIndex(e => e.id === userId);
    if (userIndex < 0) {
        warn(`deleteFromIndex: Could not find id ${userId} in namespace index, pool ${poolId}, namespace ${namespace}`);
        return;
    }
    // splice operates on the array, returns removed items!
    index.splice(userIndex, 1);
    writeNamespaceIndex(poolId, namespace, index);
}

function ensureNamespaceIndex(poolId, userId, name, previousNamespace, newNamespace) {
    debug(`ensureNamespaceIndex(${poolId}, ${userId}, ${previousNamespace}, ${newNamespace}`);
    if (!previousNamespace && !newNamespace) {
        debug('No namespaces involved, nothing to do.');
        return;
    }
    // Now we know either previousNamespace or newNamespace is defined
    if (previousNamespace === newNamespace) {
        if (!newNamespace) {
            debug('ensureNamespaceIndex: Nothing to do (match)');
            // Nothing to do
            return;
        }
        debug('ensureNamespaceIndex: Same namespace, just upsert');
        upsertNamespaceIndex(poolId, newNamespace, userId, name);
    } else if (!previousNamespace && newNamespace) {
        debug('Adding user to a namespace (or new insert)');
        upsertNamespaceIndex(poolId, newNamespace, userId, name);
    } else if (previousNamespace && !newNamespace) {
        debug('Deleting a user from a namespace');
        deleteFromNamespaceIndex(poolId, previousNamespace, userId);
    } else {
        debug('Moving from one namespace to the other');
        deleteFromNamespaceIndex(poolId, previousNamespace, userId);
        upsertNamespaceIndex(poolId, newNamespace, userId, name);
    }
}

module.exports = jsonRegistrations;