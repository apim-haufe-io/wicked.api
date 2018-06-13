'use strict';

const { debug, info, warn, error } = require('portal-env').Logger('portal-api:dao:pg:users');

const utils = require('../../../routes/utils');
const pgUtils = require('../pg-utils');
const daoUtils = require('../../dao-utils');

const pgUsers = function () { };

// =================================================
// DAO contract
// =================================================

pgUsers.getById = (userId, callback) => {
    debug('getById()');
    pgUtils.checkCallback(callback);
    return getByIdImpl(userId, callback);
};

pgUsers.getByEmail = (email, callback) => {
    debug('getByEmail()');
    pgUtils.checkCallback(callback);
    return getByEmailImpl(email, callback);
};

pgUsers.save = (userInfo, savingUserId, callback) => {
    debug('save()');
    pgUtils.checkCallback(callback);
    return createOrSaveImpl(userInfo, callback);
};

pgUsers.create = (userCreateInfo, callback) => {
    debug('create()');
    pgUtils.checkCallback(callback);
    return createOrSaveImpl(userCreateInfo, callback);
};

// Patch is not needed anymore, thus has no implementation

pgUsers.delete = (userId, deletingUserId, callback) => {
    debug('delete()');
    pgUtils.checkCallback(callback);
    return deleteImpl(userId, deletingUserId, callback);
};

pgUsers.getIndex = (offset, limit, callback) => {
    debug('getIndex()');
    pgUtils.checkCallback(callback);
    return getIndexImpl(offset, limit, callback);
};

pgUsers.getCount = (callback) => {
    debug('getCount()');
    pgUtils.checkCallback(callback);
    return pgUtils.count('users', callback);
};

pgUsers.getShortInfoByEmail = (email, callback) => {
    debug('getShortInfoByEmail');
    pgUtils.checkCallback(callback);
    return getShortInfoByField('email', email, callback);
};

pgUsers.getShortInfoByCustomId = (customId, callback) => {
    debug('getShortInfoByEmail');
    pgUtils.checkCallback(callback);
    return getShortInfoByField('custom_id', customId, callback);
};

// =================================================
// DAO implementation/internal methods
// =================================================

function getByIdImpl(userId, callback) {
    debug('getByIdImpl()');
    return pgUtils.getById('users', userId, (err, userInfo) => {
        if (err)
            return callback(err);
        if (!userInfo)
            return callback(null, null);
        pgUtils.getBy('owners', 'users_id', userId, {}, (err, ownerList) => {
            if (err)
                return callback(err);
            userInfo.applications = ownerList.map(o => { return { id: o.appId }; });
            return callback(null, userInfo);
        });
    });
}

function getByEmailImpl(email, callback) {
    debug('getByEmail()');
    getShortInfoByField('email', email, (err, shortUserInfo) => {
        if (err)
            return callback(err);
        if (!shortUserInfo)
            return callback(null, null); // Not found
        // Delegate to getByIdImpl
        return getByIdImpl(shortUserInfo.id, callback);
    });
}

function createOrSaveImpl(userInfo, callback) {
    debug('createOrSaveImpl()');

    const tmpUser = Object.assign({}, userInfo);
    // We don't persist this in the user object, but take it from the relation
    // to the application via the "owners" table.
    if (tmpUser.applications)
        delete tmpUser.applications;
    // Need to add developer group if validated?
    daoUtils.checkValidatedUserGroup(userInfo);

    pgUtils.upsert('users', userInfo, null, (err, userInfo) => {
        if (err) {
            // Check for duplicate code and map to specific error
            if (err.code === '23505') {
                err.status = 409; // Conflict
            }
            return callback(err);
        }
        return callback(null, userInfo);
    });
}

function deleteImpl(userId, deletingUserId, callback) {
    debug('deleteImpl()');
    pgUsers.getById(userId, (err, userInfo) => {
        if (err)
            return callback(err);
        if (!userInfo)
            return callback(utils.makeError(404, 'Not found'));
        return pgUtils.deleteById('users', userId, callback);
    });
}

function getIndexImpl(offset, limit, callback) {
    debug(`getIndexImpl(offset: ${offset}, limit: ${limit})`);
    pgUtils.getBy('users', [], [], { offset: offset, limit: limit }, (err, userList, countResult) => {
        if (err)
            return callback(err);
        // This might be more efficient with a dedicated SELECT, but...
        const userIndex = userList.map(userInfo => makeShortInfo(userInfo));
        return callback(null, userIndex, countResult);
    });
}

function getShortInfoByField(fieldName, fieldValue, callback) {
    debug(`getShortInfoByField(${fieldName}, ${fieldValue})`);
    pgUtils.getSingleBy('users', fieldName, fieldValue, (err, userInfo) => {
        if (err)
            return callback(err);
        // Not found
        if (!userInfo)
            return callback(null, null);

        return callback(null, makeShortInfo(userInfo));
    });
}

function makeShortInfo(userInfo) {
    return {
        id: userInfo.id,
        email: userInfo.email,
        customId: userInfo.customId
    };
}

// function updateName(userInfo) {
//     userInfo.name = daoUtils.makeName(userInfo);
// }

module.exports = pgUsers;
