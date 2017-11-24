'use strict';

const debug = require('debug')('portal-api:dao:json:users');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt-nodejs');

const utils = require('../../../routes/utils');
const daoUtils = require('../../dao-utils');
const jsonUtils = require('./json-utils');

const jsonUsers = () => { };

// =================================================
// DAO contract
// =================================================

jsonUsers.getById = (userId, callback) => {
    debug('getById()');
    jsonUtils.checkCallback(callback);
    try {
        const userInfo = jsonUsers.loadUser(userId);
        return callback(null, userInfo); // may be null
    } catch (err) {
        return callback(err);
    }
};

jsonUsers.getByEmail = (email, callback) => {
    debug('getByEmail()');
    jsonUtils.checkCallback(callback);
    try {
        const userInfo = jsonUsers.loadUserByEmail(email);
        return callback(null, userInfo); // may be null
    } catch (err) {
        return callback(err);
    }
};

jsonUsers.save = (userInfo, savingUserId, callback) => {
    debug('save()');
    jsonUtils.checkCallback(callback);
    try {
        jsonUsers.saveUser(userInfo, savingUserId);
        return callback(null);
    } catch (err) {
        return callback(err);
    }
};

jsonUsers.create = (userCreateInfo, callback) => {
    debug('create()');
    jsonUtils.checkCallback(callback);
    try {
        const freshUser = jsonUsers.createUser(userCreateInfo);
        return callback(null, freshUser);
    } catch (err) {
        return callback(err);
    }
};

// jsonUsers.patch = (userId, userInfo, patchingUserId, callback) => {
//     debug('patch()');
//     jsonUtils.checkCallback(callback);
//     try {
//         const patchedUser = jsonUsers.patchUser(userId, userInfo, patchingUserId);
//         return callback(null, patchedUser);
//     } catch (err) {
//         return callback(err);
//     }
// };

jsonUsers.delete = (userId, deletingUserId, callback) => {
    debug('delete()');
    jsonUtils.checkCallback(callback);
    try {
        jsonUsers.deleteUser(userId, deletingUserId);
        callback(null);
    } catch (err) {
        return callback(err);
    }
};

jsonUsers.getIndex = (offset, limit, callback) => {
    debug('getIndex()');
    jsonUtils.checkCallback(callback);
    try {
        const userIndex = jsonUsers.getIndexSync(offset, limit);
        return callback(null, userIndex);
    } catch (err) {
        return callback(err);
    }
};

jsonUsers.getCount = (callback) => {
    debug('getCount()');
    jsonUtils.checkCallback(callback);
    try {
        const userIndex = jsonUsers.loadUserIndex();
        return callback(null, userIndex.length);
    } catch (err) {
        return callback(err);
    }
};

jsonUsers.getShortInfoByEmail = (email, callback) => {
    debug('getShortInfoByEmail()');
    jsonUtils.checkCallback(callback);
    try {
        const shortInfo = jsonUsers.getShortInfoByEmailSync(email);
        return callback(null, shortInfo);
    } catch (err) {
        return callback(err);
    }
};

jsonUsers.getShortInfoByCustomId = (customId, callback) => {
    debug('getShortInfoByCustomId()');
    jsonUtils.checkCallback(callback);
    try {
        const shortInfo = jsonUsers.getShortInfoByCustomIdSync(customId);
        return callback(null, shortInfo);
    } catch (err) {
        return callback(err);
    }
};

// =================================================
// DAO implementation/internal methods
// =================================================

jsonUsers.loadUser = (userId) => {
    debug('loadUser(): ' + userId);
    if (!userId)
        return null;
    const userDir = path.join(utils.getDynamicDir(), 'users');
    const userFileName = path.join(userDir, userId + '.json');
    if (!fs.existsSync(userFileName))
        return null;

    //throw "users.loadUser - User not found: " + userId;
    const userInfo = JSON.parse(fs.readFileSync(userFileName, 'utf8'));

    return userInfo;
};

jsonUsers.loadUserByEmail = function (userEmail) {
    debug('loadUserByEmail(): ' + userEmail);
    const userIndex = jsonUsers.loadUserIndex();
    const email = userEmail.toLowerCase().trim();
    for (let i = 0; i < userIndex.length; ++i) {
        const userShort = userIndex[i];
        if (email == userShort.email) {
            const user = jsonUsers.loadUser(userShort.id);
            if (!user)
                throw Error("User found in index, but could not be loaded: " + userEmail + ", id: " + userShort.id);
            return user;
        }
    }
    // Not found
    return null;
};

jsonUsers.saveUser = (userInfo, savingUserId) => {
    debug('saveUser()');

    const userDir = path.join(utils.getDynamicDir(), 'users');
    const userFileName = path.join(userDir, userInfo.id + '.json');

    // Need to add developer group if validated?
    daoUtils.checkValidatedUserGroup(userInfo);
    // ClientID and ClientSecret?
    // daoUtils.checkClientIdAndSecret(userInfo);

    // Check for name change (not needed when not stored separately,
    // like in Postgres or other real databases. Later it might be possible
    // to also change the email address, so let's check that as well.
    let indexChanged = false;
    const prevUser = jsonUsers.loadUser(userInfo.id);
    if (prevUser) {
        if (prevUser.firstName !== userInfo.firstName)
            indexChanged = true;
        if (prevUser.lastName !== userInfo.lastName)
            indexChanged = true;
        if (prevUser.email !== userInfo.email)
            indexChanged = true;
    }

    userInfo.changedBy = savingUserId;
    userInfo.changedDate = utils.getUtc();

    // if (userInfo.clientId)
    //     userInfo.clientId = utils.apiEncrypt(userInfo.clientId);
    // if (userInfo.clientSecret)
    //     userInfo.clientSecret = utils.apiEncrypt(userInfo.clientSecret);

    fs.writeFileSync(userFileName, JSON.stringify(userInfo, null, 2), 'utf8');

    if (indexChanged) {
        debug('saveUser: Detected name/email change, updating index.');
        // We must update the index, as the name changed
        const userIndex = jsonUsers.loadUserIndex();
        const userId = userInfo.id;

        for (let i = 0; i < userIndex.length; ++i) {
            if (userIndex[i].id === userId) {
                // Use user variable, not userInfo; user has already been updated
                userIndex[i].name = daoUtils.makeName(userInfo);
                userIndex[i].email = userInfo.email;
                break;
            }
        }
        // Persist index
        jsonUsers.saveUserIndex(userIndex);
    }

    return;
};

jsonUsers.createUser = (userCreateInfo) => {
    debug('createUser()');
    return jsonUtils.withLockedUserIndex(function () {
        const userIndex = jsonUsers.loadUserIndex();

        // Check for email address and custom ID
        for (let i = 0; i < userIndex.length; ++i) {
            if (userCreateInfo.email && userIndex[i].email == userCreateInfo.email) {
                throw utils.makeError(409, 'A user with the given email address already exists.');
            }
            if (userCreateInfo.customId && userIndex[i].customId) {
                if (userCreateInfo.customId == userIndex[i].customId)
                    throw utils.makeError(409, 'A user with the given custom ID already exists.');
            }
        }

        const newUser = Object.assign({}, userCreateInfo, { applications: [] });
        const newId = newUser.id;

        userIndex.push({
            id: newId,
            name: daoUtils.makeName(newUser),
            email: newUser.email,
            customId: newUser.customId,
        });

        // First push user record
        jsonUsers.saveUser(newUser, newId);

        // Then push index
        jsonUsers.saveUserIndex(userIndex);

        // Re-load the user to get the links and stuff
        const freshUser = jsonUsers.loadUser(newId);

        // Delete the password, if present
        if (freshUser.password)
            delete freshUser.password;

        return freshUser;
    });
};

// jsonUsers.patchUser = (userId, userInfo, patchingUserId) => {
//     debug('patchUser()');
//     return jsonUtils.withLockedUser(userId, function () {
//         return jsonUtils.withLockedUserIndex(function () {
//             let user = jsonUsers.loadUser(userId);
//             const userIndex = jsonUsers.loadUserIndex();

//             for (let i = 0; i < userIndex.length; ++i) {
//                 if (userIndex[i].id === userId) {
//                     // Use user variable, not userInfo; user has already been updated
//                     userIndex[i].name = user.firstName + ' ' + user.lastName;
//                     userIndex[i].email = user.email;
//                     break;
//                 }
//             }
//             // Persist user
//             jsonUsers.saveUser(user, patchingUserId);
//             // Persist index
//             jsonUsers.saveUserIndex(userIndex);

//             // Re-load user to refresh
//             user = jsonUsers.loadUser(user.id);

//             // Delete password, if present
//             if (user.password)
//                 delete user.password;
//             return user;
//         });
//     });
// };

jsonUsers.deleteUser = (userId, deletingUserId) => {
    debug('deleteUser()');
    return jsonUtils.withLockedUserIndex(function () {
        const userIndex = jsonUsers.loadUserIndex();

        let index = -1;
        // Find user in index
        for (let i = 0; i < userIndex.length; ++i) {
            let user = userIndex[i];
            if (user.id == userId) {
                index = i;
                break;
            }
        }

        if (index < 0)
            throw utils.makeError(404, 'Not found.');

        // Make sure the user does not have active applications
        let user = jsonUsers.loadUser(userId);
        if (user) {
            // This shouldn't be necessary, as it's checked in the generic
            // functionality (users.js: users.deleteUser).
            if (user.applications.length > 0) {
                throw utils.makeError(409, 'User has applications; remove user from applications first.');
            }
        } else {
            debug('User not found, but exists in index!');
            console.error("WARNING: User not found, but exists in index!");
        }

        // Remove from user index
        userIndex.splice(index, 1);

        // Write index (before deleting file, please, otherway around can create inconsistencies)
        jsonUsers.saveUserIndex(userIndex);

        const userDir = path.join(utils.getDynamicDir(), 'users');
        const userFileName = path.join(userDir, userId + '.json');
        // Delete user JSON
        if (fs.existsSync(userFileName))
            fs.unlinkSync(userFileName);

        return; // Yay
    });
};

jsonUsers.getShortInfoByCustomIdSync = (customId) => {
    debug('getShortInfoByCustomIdSync()');
    const userIndex = jsonUsers.loadUserIndex();
    let index = -1;
    for (let i = 0; i < userIndex.length; ++i) {
        if (userIndex[i].customId == customId) {
            index = i;
            break;
        }
    }
    if (index < 0)
        return null;
        // throw utils.makeError(404, 'User with customId "' + customId + '" not found.');
    return userIndex[index];
};

jsonUsers.getShortInfoByEmailSync = (email) => {
    debug('getShortInfoByEmailSync()');
    const userIndex = jsonUsers.loadUserIndex();
    email = email.toLowerCase().trim();
    let index = -1;
    for (let i = 0; i < userIndex.length; ++i) {
        if (userIndex[i].email == email) {
            index = i;
            break;
        }
    }
    if (index < 0)
        return null;
        // throw utils.makeError(404, 'User with email "' + email + '" not found.');
    return userIndex[index];
};

jsonUsers.loadUserIndex = function () {
    debug('loadUserIndex()');
    const userDir = path.join(utils.getDynamicDir(), 'users');
    const userIndexFileName = path.join(userDir, '_index.json');
    return JSON.parse(fs.readFileSync(userIndexFileName, 'utf8'));
};

jsonUsers.getIndexSync = (offset, limit) => {
    debug('getIndexSync()');
    const userIndex = jsonUsers.loadUserIndex();
    return jsonUtils.pageArray(userIndex, offset, limit);
};

jsonUsers.saveUserIndex = function (userIndex) {
    debug('saveUserIndex()');
    debug(userIndex);
    const userDir = path.join(utils.getDynamicDir(), 'users');
    const userIndexFileName = path.join(userDir, '_index.json');
    fs.writeFileSync(userIndexFileName,
        JSON.stringify(userIndex, null, 2),
        'utf8');
};


module.exports = jsonUsers;