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
    let userRegistration;
    try {
        userRegistration = jsonRegistrations.getByPoolAndUserSync(poolId, userId);
    } catch (err) {
        return callback(err);
    }
    return callback(null, userRegistration);
    //return callback(utils.makeError(500, 'Not implemented'));
};

jsonRegistrations.getByPoolAndNamespace = (poolId, namespace, nameFilter, offset, limit, callback) => {
    //return callback(utils.makeError(500, 'Not implemented'));
    debug(`getByPoolAndNamespace(${poolId}, ${namespace}, ${nameFilter})`);
    let registrations;
    try {
        registrations = jsonRegistrations.getByPoolAndNamespaceSync(poolId, namespace, nameFilter, offset, limit);
    } catch (err) {
        return callback(err);
    }
    return callback(null, registrations);
};

jsonRegistrations.upsert = (poolId, userId, userData, callback) => {
    debug(`upsert(${userId})`);
    try {
        jsonRegistrations.upsertSync(poolId, userId, userData);
    } catch (err) {
        return callback(err);
    }
    return callback(null);
};

jsonRegistrations.delete = (poolId, userId, callback) => {
    debug(`delete(${userId})`);
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

function filterAndPage(regs, nameFilter, offset, limit) {
    let filteredList = regs;

    if (nameFilter) {
        const filter = nameFilter.toLowerCase();
        const tempList = [];
        for (let i = 0; i < regs.length; ++i) {
            let name = regs[i].name;
            name = name ? name.toLowerCase() : "";
            if (name.indexOf(filter) >= 0) {
                tempList.push(regs[i]);
            }
        }
        filteredList = tempList;
    }
    return jsonUtils.pageArray(filteredList, offset, limit);
}

jsonRegistrations.getByPoolAndNamespaceSync = (poolId, namespace, nameFilter, offset, limit) => {
    debug(`getByPoolAndNamespaceSync(${poolId}, ${namespace}, ${nameFilter})`);
    // Note: All indexes are always sorted by name internally anyway,
    // so we don't have to do that here.
    let filteredList;
    if (!namespace) {
        // Use the "big" pool index
        const poolIndex = readPoolIndex(poolId);
        filteredList = filterAndPage(poolIndex, nameFilter, offset, limit);
    } else {
        // We need to use the namespace index
        const namespaceIndex = readNamespaceIndex(poolId, namespace);
        filteredList = filterAndPage(namespaceIndex, nameFilter, offset, limit);
    }

    const tmpArray = [];
    for (let i = 0; i < filteredList.length; ++i) {
        const entry = filteredList[i]; // contains id and name
        const thisReg = jsonRegistrations.getByPoolAndUserSync(poolId, entry.id);
        tmpArray.push(thisReg);
    }
    // Now return the list
    // TODO: _links?
    return {
        items: tmpArray
    };
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
    userData.id = userId;
    const regsFile = makeRegsFileName(poolId, userId);
    fs.writeFileSync(regsFile, JSON.stringify(userData, null, 2), 'utf8');

    // Update the pool index
    ensurePoolIndex(poolId, userId);
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
    deleteFromPoolIndex(poolId, userId);
    if (previousNamespace)
        deleteFromNamespaceIndex(poolId, previousNamespace, userId);
};

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
        idMap[id] = name;
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
    const userPos = poolIndex.find(e => e.id === userId);
    if (userPos) {
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
    const userPos = poolIndex.find(e => e === userId);
    if (!userPos) {
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
    const userIndex = index.find(e => e.id === userId);
    const entry = {
        id: userId,
        name: name
    };
    if (userIndex) {
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
    const userIndex = index.find(e => e.id === userId);
    if (!userIndex) {
        warn(`deleteFromIndex: Could not find id ${userId} in namespace index, pool ${poolId}, namespace ${namespace}`);
        return;
    }
    // splice operates on the array, returns removed items!
    index.splice(userIndex, 1);
    writeNamespaceIndex(poolId, namespace, index);
}

function ensureNamespaceIndex(poolId, userId, name, previousNamespace, newNamespace) {
    debug(`ensureNamespaceIndex(${poolId}, ${userId}, ${previousNamespace}, ${newNamespace}`);
    if (previousNamespace === newNamespace) {
        if (!newNamespace) // Nothing to do
            return;
        // Same namespace, we'll just upsert
        upsertNamespaceIndex(poolId, newNamespace, userId, name);
    } else if (!previousNamespace && newNamespace) {
        // Adding user to a namespace (or new insert)
        upsertNamespaceIndex(poolId, newNamespace, userId, name);
    } else if (previousNamespace && !newNamespace) {
        // Deleting a user from a namespace
        deleteFromNamespaceIndex(poolId, previousNamespace, userId);
    } else {
        // Moving from one namespace to the other
        deleteFromNamespaceIndex(poolId, previousNamespace, userId);
        upsertNamespaceIndex(poolId, newNamespace, userId, name);
    }
}

module.exports = jsonRegistrations;