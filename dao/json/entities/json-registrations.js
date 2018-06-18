'use strict';

const { debug, info, warn, error } = require('portal-env').Logger('portal-api:dao:json:registrations');
const fs = require('fs');
const path = require('path');

const utils = require('../../../routes/utils');


class JsonRegistrations {

    constructor(jsonUtils) {
        this.jsonUtils = jsonUtils;
    }

    // =================================================
    // DAO contract
    // =================================================

    getByPoolAndUser(poolId, userId, callback) {
        debug(`getByPoolAndUser(${poolId}, ${userId})`);
        this.jsonUtils.checkCallback(callback);
        let userRegistration;
        try {
            userRegistration = this.getByPoolAndUserSync(poolId, userId);
        } catch (err) {
            return callback(err);
        }
        return callback(null, userRegistration);
    }

    getByPoolAndNamespace(poolId, namespace, filter, orderBy, offset, limit, noCountCache, callback) {
        debug(`getByPoolAndNamespace(${poolId}, ${namespace}, ${filter}, ${orderBy})`);
        this.jsonUtils.checkCallback(callback);
        let registrations;
        try {
            registrations = this.getByPoolAndNamespaceSync(poolId, namespace, filter, orderBy, offset, limit);
        } catch (err) {
            return callback(err);
        }
        return callback(null, registrations.rows, { count: registrations.count, cached: false });
    }

    getByUser(userId, callback) {
        debug(`getByUser(${userId})`);
        this.jsonUtils.checkCallback(callback);
        let registrations;
        try {
            registrations = this.getByUserSync(userId);
        } catch (err) {
            return callback(err);
        }
        return callback(null, registrations.rows, { count: registrations.count, cached: false });
    }

    upsert(poolId, userId, upsertingUserId, userData, callback) {
        debug(`upsert(${userId})`);
        this.jsonUtils.checkCallback(callback);
        try {
            this.upsertSync(poolId, userId, userData);
        } catch (err) {
            return callback(err);
        }
        return callback(null);
    }

    delete(poolId, userId, deletingUserId, callback) {
        debug(`delete(${userId})`);
        this.jsonUtils.checkCallback(callback);
        try {
            this.deleteSync(poolId, userId);
        } catch (err) {
            return callback(err);
        }
        return callback(null);
    }

    // =================================================
    // DAO implementation/internal methods
    // =================================================

    makeRegsFileName(poolId, userId) {
        const regsDir = path.join(this.jsonUtils.getDynamicDir(), 'registrations');
        const regsFile = path.join(regsDir, `${poolId}_${userId}.json`);
        return regsFile;
    }

    hasRegistration(poolId, userId) {
        debug(`hasRegistration(${poolId}, ${userId})`);
        const regsFile = this.makeRegsFileName(poolId, userId);
        if (fs.existsSync(regsFile))
            return true;
        return false;
    }

    getByPoolAndUserSync(poolId, userId) {
        debug(`getByPoolAndUserSync(${poolId}, ${userId})`);

        if (!this.hasRegistration(poolId, userId)) {
            warn(`Registration record for user ${userId} in pool ${poolId} not found.`);
            throw utils.makeError(404, 'Registration not found');
        }
        const regsFile = this.makeRegsFileName(poolId, userId);
        const regsJson = JSON.parse(fs.readFileSync(regsFile, 'utf8'));
        debug(regsJson);
        return regsJson;
    }

    getByUserSync(userId) {
        debug(`getByUser(${userId})`);

        // The userIndex contains pools this user has registrations for
        const userIndex = this.readUserIndex(userId);
        const tmp = { pools: {} };
        for (let i = 0; i < userIndex.length; ++i) {
            const poolId = userIndex[i];
            tmp.pools[poolId] = this.getByPoolAndUserSync(poolId, userId);
        }
        return { rows: tmp, count: userIndex.length };
    }

    getByPoolAndNamespaceSync(poolId, namespace, filter, orderBy, offset, limit) {
        debug(`getByPoolAndNamespaceSync(${poolId}, ${namespace}, ${filter}, ${orderBy})`);
        // Note: All indexes are always sorted by name internally anyway,
        // so we don't have to do that here.
        let indexList;
        if (!namespace) {
            // Use the "big" pool index
            indexList = this.readPoolIndex(poolId);
        } else {
            // We need to use the namespace index
            indexList = this.readNamespaceIndex(poolId, namespace);
        }

        const tmpArray = [];
        for (let i = 0; i < indexList.length; ++i) {
            const entry = indexList[i]; // contains id and name
            const thisReg = this.getByPoolAndUserSync(poolId, entry.id);
            tmpArray.push(thisReg);
        }

        if (!orderBy)
            orderBy = 'name ASC';

        const { list, filterCount } = this.jsonUtils.filterAndPage(tmpArray, filter, orderBy, offset, limit);
        // Now return the list
        return { rows: list, count: filterCount };
    }

    upsertSync(poolId, userId, userData) {
        debug(`upsertSync(${userId})`);

        let previousNamespace;
        if (this.hasRegistration(poolId, userId)) {
            const preUpdateData = this.getByPoolAndUserSync(poolId, userId);
            previousNamespace = preUpdateData.namespace; // This may be undefined
        }
        const newNamespace = userData.namespace; // This may also be undefined, that's fine
        const newName = userData.name ? userData.name : '';

        // Probably not necessary, but mustn't hurt
        userData.userId = userId;
        userData.poolId = poolId;
        const regsFile = this.makeRegsFileName(poolId, userId);
        fs.writeFileSync(regsFile, JSON.stringify(userData, null, 2), 'utf8');

        // Update the user index
        this.ensureUserIndex(poolId, userId);
        // Update the pool index
        this.ensurePoolIndex(poolId, userId, newName);
        // Update the namespace index
        this.ensureNamespaceIndex(poolId, userId, newName, previousNamespace, newNamespace);
    }

    deleteSync(poolId, userId) {
        debug(`deleteSync(${userId})`);

        let previousNamespace;
        if (this.hasRegistration(poolId, userId)) {
            const preUpdateData = this.getByPoolAndUserSync(poolId, userId);
            previousNamespace = preUpdateData.namespace; // This may be undefined
        }

        const regsFile = this.makeRegsFileName(poolId, userId);
        if (!fs.existsSync(regsFile)) {
            warn(`deleteSync: File ${regsFile} does not exist, cannot delete`);
            throw utils.makeError(404, 'User not found');
        }
        fs.unlinkSync(regsFile);
        debug(`deleteSync: Deleted file ${regsFile}`);

        // Clean up in indexes
        this.deleteFromUserIndex(poolId, userId);
        this.deleteFromPoolIndex(poolId, userId);
        if (previousNamespace)
            this.deleteFromNamespaceIndex(poolId, previousNamespace, userId);
    }

    // =================================================
    // User Index updating helper methods
    // =================================================

    getUserIndexFile(userId) {
        if (!userId)
            throw new Error(`getUserIndexFile: userId is empty`);
        const regsDir = path.join(this.jsonUtils.getDynamicDir(), 'registrations');
        const userIndex = path.join(regsDir, `${userId}.json`);
        return userIndex;
    }

    readUserIndex(userId) {
        const userIndexFile = this.getUserIndexFile(userId);
        if (!fs.existsSync(userIndexFile))
            return [];
        return JSON.parse(fs.readFileSync(userIndexFile));
    }

    writeUserIndex(userId, userIndex) {
        const userIndexFile = this.getUserIndexFile(userId);
        fs.writeFileSync(userIndexFile, JSON.stringify(userIndex, null, 2), 'utf8');
    }

    ensureUserIndex(poolId, userId) {
        debug(`ensureUserIndex(${poolId}, ${userId})`);
        const userIndex = this.readUserIndex(userId);
        const poolPos = userIndex.findIndex(e => e === poolId);
        if (poolPos < 0) {
            // Not found, insert
            userIndex.push(poolId);
            this.writeUserIndex(userId, userIndex);
        }
    }

    deleteFromUserIndex(poolId, userId) {
        debug(`deleteFromUserIndex(${poolId}, ${userId})`);
        const userIndex = this.readUserIndex(userId);
        const poolPos = userIndex.findIndex(e => e === poolId);
        if (poolPos >= 0) {
            userIndex.splice(poolPos, 1);
            this.writeUserIndex(userId, userIndex);
        } else {
            throw new Error(`deleteFromUserIndex: Pool ID ${poolId} not found in user index ${userId}`);
        }
    }

    // =================================================
    // Pool Index updating helper methods
    // =================================================

    static sortIndex(index) {
        function compare(a, b) {
            if (a.name < b.name)
                return -1;
            if (a.name > b.name)
                return 1;
            return 0;
        }

        index.sort(compare);
    }

    getPoolIndexFile(poolId) {
        if (!poolId)
            throw new Error(`getPoolIndexFile: poolId is empty`);
        const regsDir = path.join(this.jsonUtils.getDynamicDir(), 'registrations');
        const poolIndex = path.join(regsDir, `${poolId}.json`);
        return poolIndex;
    }

    readPoolIndex(poolId) {
        const indexFile = this.getPoolIndexFile(poolId);
        if (!fs.existsSync(indexFile)) {
            return [];
        }
        return JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    }

    sanityCheckPoolIndex(poolId, poolIndex) {
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

    writePoolIndex(poolId, poolIndex) {
        const indexFile = this.getPoolIndexFile(poolId);
        this.sanityCheckPoolIndex(poolId, poolIndex);
        JsonRegistrations.sortIndex(poolIndex);
        fs.writeFileSync(indexFile, JSON.stringify(poolIndex, null, 2), 'utf8');
    }

    ensurePoolIndex(poolId, userId, name) {
        debug(`ensurePoolIndex(${poolId}, ${userId}, ${name})`);

        const poolIndex = this.readPoolIndex(poolId);
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
        this.writePoolIndex(poolId, poolIndex);
    }

    deleteFromPoolIndex(poolId, userId) {
        debug(`deleteFromPoolIndex(${poolId}, ${userId})`);

        const poolIndex = this.readPoolIndex(poolId);
        const userPos = poolIndex.findIndex(e => e.id === userId);
        if (userPos < 0) {
            warn(`deleteFromPoolIndex: User ${userId} was not found in ${poolId}`);
            return;
            // throw utils.makeError(404, `deleteFromPoolIndex: User ${userId} was not found in ${poolId}`);
        }
        poolIndex.splice(userPos, 1);
        this.writePoolIndex(poolId, poolIndex);
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

    getNamespaceIndexFile(poolId, namespace) {
        if (!namespace)
            throw new Error("It doesn't make sense to get a namespace file for an empty namespace");
        const regsDir = path.join(this.jsonUtils.getDynamicDir(), 'registrations');
        const namespaceIndex = path.join(regsDir, `${poolId}_NS_${namespace}.json`);
        return namespaceIndex;
    }

    readNamespaceIndex(poolId, namespace) {
        const indexFile = this.getNamespaceIndexFile(poolId, namespace);
        if (fs.existsSync(indexFile))
            return JSON.parse(fs.readFileSync(indexFile, 'utf8'));
        return [];
    }

    sanityCheckNamespaceIndex(poolId, namespace, namespaceData) {
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

    writeNamespaceIndex(poolId, namespace, namespaceIndex) {
        const indexFile = this.getNamespaceIndexFile(poolId, namespace);
        this.sanityCheckNamespaceIndex(poolId, namespace, namespaceIndex);
        JsonRegistrations.sortIndex(namespaceIndex);
        fs.writeFileSync(indexFile, JSON.stringify(namespaceIndex, null, 2), 'utf8');
    }

    upsertNamespaceIndex(poolId, namespace, userId, name) {
        debug(`upsertNamespaceIndex(${poolId}, ${namespace}, ${userId}, ${name})`);
        const index = this.readNamespaceIndex(poolId, namespace);
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
        this.writeNamespaceIndex(poolId, namespace, index);
    }

    deleteFromNamespaceIndex(poolId, namespace, userId) {
        debug(`deleteFromNamespaceIndex(${poolId}, ${namespace}, ${userId})`);
        const index = this.readNamespaceIndex(poolId, namespace);
        const userIndex = index.findIndex(e => e.id === userId);
        if (userIndex < 0) {
            warn(`deleteFromIndex: Could not find id ${userId} in namespace index, pool ${poolId}, namespace ${namespace}`);
            return;
        }
        // splice operates on the array, returns removed items!
        index.splice(userIndex, 1);
        this.writeNamespaceIndex(poolId, namespace, index);
    }

    ensureNamespaceIndex(poolId, userId, name, previousNamespace, newNamespace) {
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
            this.upsertNamespaceIndex(poolId, newNamespace, userId, name);
        } else if (!previousNamespace && newNamespace) {
            debug('Adding user to a namespace (or new insert)');
            this.upsertNamespaceIndex(poolId, newNamespace, userId, name);
        } else if (previousNamespace && !newNamespace) {
            debug('Deleting a user from a namespace');
            this.deleteFromNamespaceIndex(poolId, previousNamespace, userId);
        } else {
            debug('Moving from one namespace to the other');
            this.deleteFromNamespaceIndex(poolId, previousNamespace, userId);
            this.upsertNamespaceIndex(poolId, newNamespace, userId, name);
        }
    }
}

module.exports = JsonRegistrations;