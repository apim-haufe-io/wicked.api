'use strict';

var utils = require('./utils');
var fs = require('fs');
var path = require('path');
var debug = require('debug')('portal-api:users');
var bcrypt = require('bcrypt-nodejs');
var webhooks = require('./webhooks');
var verifications = require('./verifications');
var authMiddleware = require('../auth-middleware');

var users = require('express').Router();

var dao = require('../dao/dao');
var daoUtils = require('../dao/dao-utils');

// ===== ENDPOINTS =====

users.post('/', authMiddleware.rejectFromKong, function (req, res) {
    users.createUser(req.app, res, req.body);
});

users.get('/', function (req, res, next) {
    if (req.query.customId)
        users.getUserByCustomId(req.app, res, req.query.customId);
    else if (req.query.email)
        users.getUserByEmail(req.app, res, req.query.email);
    else if (req.apiUserId)
        users.getUsers(req.app, res, req.apiUserId);
    else
        res.status(403).jsonp({ message: 'Not allowed. Unauthorized.' });
});

users.get('/:userId', function (req, res, next) {
    users.getUser(req.app, res, req.apiUserId, req.params.userId);
});

users.patch('/:userId', function (req, res, next) {
    if (req.get('X-VerificationId'))
        verifications.patchUserWithVerificationId(req.app, res, users, req.get('X-VerificationId'), req.params.userId, req.body);
    else if (req.apiUserId)
        users.patchUser(req.app, res, req.apiUserId, req.params.userId, req.body);
});

users.delete('/:userId', function (req, res, next) {
    users.deleteUser(req.app, res, req.apiUserId, req.params.userId);
});

users.delete('/:userId/password', function (req, res, next) {
    users.deletePassword(req.app, res, req.apiUserId, req.params.userId);
});


// ===== IMPLEMENTATION =====

users.BAD_PASSWORD = 'Password has to be at least 6 characters long, and less than 24 characters.';

users.isGoodPassword = function (password) {
    if (password.length < 6)
        return false;
    if (password.length > 24)
        return false;
    return true;
};

users.isUserIdAdmin = function (app, userId, callback) {
    debug('isUserIdAdmin()');
    if (!callback || typeof (callback) !== 'function')
        throw utils.makeError(500, 'isUserIdAdmin: callback is null or not a function');
    if (!userId)
        return callback(null, false);
    users.loadUser(app, userId, (err, user) => {
        if (err)
            return callback(err);

        return callback(null, users.isUserAdmin(app, user));
    });
};

users.isUserAdmin = function (app, userInfo) {
    return daoUtils.isUserAdmin(userInfo);
};

users.isUserApprover = function (app, user) {
    debug('isUserApprover()');
    var groups = utils.loadGroups(app);

    var isApprover = false;
    for (var i = 0; i < user.groups.length; ++i) {
        var groupId = user.groups[i];
        for (var groupIndex = 0; groupIndex < groups.groups.length; ++groupIndex) {
            var group = groups.groups[groupIndex];
            if (groupId != group.id)
                continue;
            if (group.approverGroup) {
                isApprover = true;
                break;
            }
        }
        if (isApprover)
            break;
    }
    return isApprover;
};

/* Does the user belong to a specific group, or is he an admin? */
users.hasUserGroup = function (app, userInfo, group) {
    debug('hasUserGroup()');
    var foundGroup = false;
    for (var i = 0; i < userInfo.groups.length; ++i) {
        if (userInfo.groups[i] == group)
            return true;
    }
    return userInfo.admin;
};

users.isActionAllowed = function (app, loggedInUserId, userId, callback) {
    debug('isActionAllowed()');
    if (!callback || typeof (callback) !== 'function')
        throw new Error('isActionAllowed: callback is null or not a function');
    // Do we have a logged in user?
    if (!loggedInUserId)
        return callback(null, false);
    if (loggedInUserId == userId || "1" == loggedInUserId)
        return callback(null, true);
    // Is user an admin?
    users.loadUser(app, loggedInUserId, (err, userInfo) => {
        if (err)
            return callback(err);
        if (!userInfo) // User not found, action not allowed
            return callback(null, false);
        return callback(null, userInfo.admin);
    });
};

users.loadUser = function (app, userId, callback) {
    debug('loadUser(): ' + userId);
    if (!callback || typeof (callback) !== 'function')
        throw new Error('loadUser: callback is null or not a function');
    if (!userId)
        return callback(null, null);
    return dao.users.getById(userId, (err, userInfo) => {
        if (err)
            return callback(err);
        postProcessUser(userInfo);
        return callback(null, userInfo);
    });
};

function postProcessUser(userInfo) {
    debug('postProcessUser()');
    if (userInfo) {
        // TBD: This should be done with Profiles later
        if (userInfo.firstName && userInfo.lastName)
            userInfo.name = userInfo.firstName + ' ' + userInfo.lastName;
        else if (!userInfo.firstName && userInfo.lastName)
            userInfo.name = userInfo.lastName;
        else if (userInfo.firstName && !userInfo.lastName)
            userInfo.name = userInfo.firstName;
        else
            userInfo.name = 'Unknown User';

        userInfo.admin = daoUtils.isUserAdmin(userInfo);
        userInfo.approver = daoUtils.isUserApprover(userInfo);

        // Add generic links
        userInfo._links = {
            self: { href: '/users/' + userInfo.id },
            groups: { href: '/groups' }
        };

        if (userInfo.clientId)
            delete userInfo.clientId;
        if (userInfo.clientSecret)
            delete userInfo.clientSecret;
    }
}


users.loadUserByEmail = function (app, userEmail, callback) {
    debug('loadUserByEmail(): ' + userEmail);
    if (!callback || typeof (callback) !== 'function')
        throw new Error('loadUser: callback is null or not a function');

    return dao.users.getByEmail(userEmail, callback);
};

users.saveUser = function (app, userInfo, userId, callback) {
    debug('saveUser()');
    debug(userInfo);
    if (!callback || typeof (callback) !== 'function')
        throw new Error('loadUser: callback is null or not a function');

    const userInfoToSave = Object.assign({}, userInfo);
    if (userInfoToSave.name)
        delete userInfoToSave.name;
    if (userInfoToSave.admin)
        delete userInfoToSave.admin;
    if (userInfoToSave.clientId)
        delete userInfoToSave.clientId;
    if (userInfoToSave.clientSecret)
        delete userInfoToSave.clientSecret;
    if (userInfoToSave._links)
        delete userInfoToSave._links;

    dao.users.save(userInfoToSave, userId, callback);
};

users.createUser = function (app, res, userCreateInfo) {
    debug('createUser()');
    debug(userCreateInfo);
    if (!userCreateInfo.email && !userCreateInfo.customId)
        return res.status(400).jsonp({ message: 'Bad request. User needs email address.' });
    if (userCreateInfo.password &&
        !users.isGoodPassword(userCreateInfo.password))
        return res.status(400).jsonp({ message: users.BAD_PASSWORD });
    if (userCreateInfo.email)
        userCreateInfo.email = userCreateInfo.email.toLowerCase();

    // Form style create data?
    if (userCreateInfo.firstname &&
        !userCreateInfo.firstName) {
        userCreateInfo.firstName = userCreateInfo.firstname;
        delete userCreateInfo.firstname;
    }
    if (userCreateInfo.lastname &&
        !userCreateInfo.lastName) {
        userCreateInfo.lastName = userCreateInfo.lastname;
        delete userCreateInfo.lastname;
    }

    const newId = userCreateInfo.id || utils.createRandomId();
    let password = null;
    if (userCreateInfo.password)
        password = bcrypt.hashSync(userCreateInfo.password);
    if (!userCreateInfo.groups)
        userCreateInfo.groups = [];

    const newUser = {
        id: newId,
        customId: userCreateInfo.customId,
        firstName: userCreateInfo.firstName,
        lastName: userCreateInfo.lastName,
        validated: userCreateInfo.validated,
        email: userCreateInfo.email,
        password: password,
        groups: userCreateInfo.groups
    };

    dao.users.create(newUser, (err, createdUserInfo) => {
        if (err)
            return utils.fail(res, 500, 'createUser: Could not create user', err);

        // Reload to get links and things
        users.loadUser(app, newId, (err, freshUser) => {
            if (err)
                return utils.fail(res, 500, 'createUser: Could not load user after creating', err);
            if (!freshUser)
                return utils.fail(res, 500, `createUser: Newly created user with id ${newId} could not be loaded (not found)`);

            // Don't return the password hash
            if (freshUser.password)
                delete freshUser.password;
            res.status(201).json(freshUser);

            webhooks.logEvent(app, {
                action: webhooks.ACTION_ADD,
                entity: webhooks.ENTITY_USER,
                data: {
                    userId: freshUser.id,
                    email: userCreateInfo.email,
                    customId: userCreateInfo.customId
                }
            });
        });
    });
};

users.getUser = function (app, res, loggedInUserId, userId) {
    debug('getUser(): ' + userId);
    users.isActionAllowed(app, loggedInUserId, userId, (err, isAllowed) => {
        if (err)
            return utils.fail(res, 500, 'getUser: isActionAllowed returned an error.', err);
        if (!isAllowed)
            return res.status(403).jsonp({ message: 'Not allowed.' });
        users.loadUser(app, userId, (err, user) => {
            if (err)
                return utils.fail(res, 500, 'getUser: Could not load user.', err);
            if (!user)
                return res.status(404).jsonp({ message: 'Not found.' });
            if (user.password) {
                delete user.password;
                user.hasPassword = true;
            }
            // You can't retrieve clientId and clientSecret for other users
            if (userId != loggedInUserId) {
                if (user.clientId)
                    delete user.clientId;
                if (user.clientSecret)
                    delete user.clientSecret;
            }

            res.json(user);
        });
    });
};

users.getUsers = function (app, res, loggedInUserId) {
    debug('getUsers()');
    users.loadUser(app, loggedInUserId, (err, user) => {
        if (err)
            return utils.fail(res, 500, 'getUsers: loadUser failed', err);
        if (!user)
            return utils.fail(res, 400, 'Bad request. Unknown user.');
        if (!user.admin)
            return utils.fail(res, 403, 'Not allowed. Only admins can retrieve user list.');

        dao.users.getIndex(0, 0, (err, userIndex) => {
            if (err)
                return utils.fail(res, 500, 'getUsers: DAO getIndex failed.', err);
            res.json(userIndex);
        });
    });
};

users.getUserByCustomId = function (app, res, customId) {
    debug('getUserByCustomId(): ' + customId);

    // No security check here, only retrieves short info
    dao.users.getShortInfoByCustomId(customId, (err, shortInfo) => {
        if (err)
            return utils.fail(res, 500, 'getUserByCustomId: DAO getShortInfoByCustomId failed.', err);
        if (!shortInfo)
            return utils.fail(res, 404, `User with custom ID ${customId} not found.`);
        res.json([shortInfo]);
    });
};

users.getUserByEmail = function (app, res, email) {
    debug('getUserByEmail(): ' + email);

    // No security check here, only retrieves short info
    dao.users.getShortInfoByEmail(email, (err, shortInfo) => {
        if (err)
            return utils.fail(res, 500, 'getUserByEmail: DAO getShortInfoByEmail failed.', err);
        if (!shortInfo)
            return utils.fail(res, 404, `User with email ${email} not found.`);
        res.json([shortInfo]);
    });
};

users.getUserByEmailAndPassword = function (app, res, email, password) {
    debug('getUserByEmailAndPassword(): ' + email + ', password=***');
    users.loadUserByEmail(app, email, (err, userInfo) => {
        if (err)
            return utils.fail(res, 500, 'getUserByEmailAndPassword: loadUserByEmail failed.', err);
        if (!userInfo)
            return utils.fail(res, 404, 'User not found or password not correct.');
        if (!userInfo.password)
            return utils.fail(res, 400, 'Bad request. User has no defined password.');
        if (!bcrypt.compareSync(password, userInfo.password))
            return utils.fail(res, 403, 'Password not correct or user not found.');
        delete userInfo.password;
        res.json([userInfo]);
    });
};

users.patchUser = function (app, res, loggedInUserId, userId, userInfo) {
    debug('patchUser(): ' + userId);
    debug(userInfo);
    users.isActionAllowed(app, loggedInUserId, userId, (err, isAllowed) => {
        if (err)
            return utils.fail(res, 500, 'patchUser: isActionAllowed failed.', err);
        if (!isAllowed)
            return utils.fail(res, 403, 'Not allowed');
        if (userInfo.password &&
            !users.isGoodPassword(userInfo.password))
            return utils.fail(res, 400, users.BAD_PASSWORD);

        users.loadUser(app, userId, (err, user) => {
            if (err)
                return utils.fail(res, 500, 'patchUser: loadUser failed', err);

            if (!user)
                return utils.fail(res, 404, 'Not found.');
            if (userInfo.customId)
                if (userInfo.customId != user.customId)
                    return utils.fail(res, 400, 'Bad request. Changing custom ID is not allowed.');
            if (user.password &&
                userInfo.email &&
                (userInfo.email != user.email))
                return utils.fail(res, 400, 'Bad request. You can not change the email address of a username with a local password.');

            if (userInfo.firstName)
                user.firstName = userInfo.firstName;
            if (userInfo.lastName)
                user.lastName = userInfo.lastName;
            if (userInfo.groups)
                user.groups = userInfo.groups;
            if (userInfo.email)
                user.email = userInfo.email;
            if (userInfo.validated)
                user.validated = userInfo.validated;
            if (userInfo.password)
                user.password = bcrypt.hashSync(userInfo.password);

            dao.users.save(user, loggedInUserId, (err) => {
                if (err)
                    return utils.fail(res, 500, 'patchUser: DAO returned an error', err);
                webhooks.logEvent(app, {
                    action: webhooks.ACTION_UPDATE,
                    entity: webhooks.ENTITY_USER,
                    data: {
                        updatedUserId: userId,
                        userId: loggedInUserId
                    }
                });
                users.loadUser(app, user.id, (err, patchedUser) => {
                    if (err)
                        return utils.fail(res, 500, 'patchUser: loadUser after patch failed', err);
                    // Delete password, if present
                    if (patchedUser.password)
                        delete patchedUser.password;
                    res.json(patchedUser);
                });
            });
        });
    });
};

users.deleteUser = function (app, res, loggedInUserId, userId) {
    debug('deleteUser(): ' + userId);
    users.isActionAllowed(app, loggedInUserId, userId, (err, isAllowed) => {
        if (err)
            return utils.fail(res, 500, 'deleteUser: isActionAllowed failed.', err);
        if (!isAllowed)
            return res.status(403).jsonp({ message: 'Not allowed.' });

        // Make sure the user doesn't have any applications; if that's the case,
        // we will not allow deleting.
        dao.users.getById(userId, (err, userInfo) => {
            if (err)
                return utils.fail(res, 500, 'deleteUser: DAO failed to load user.', err);
            if (!userInfo)
                return utils.fail(res, 404, 'User not found');
            if (userInfo.applications && userInfo.applications.length > 0)
                return utils.fail(res, 409, 'User has applications; remove user from applications first.');
                
            // OK, now we allow deletion.
            dao.users.delete(userId, loggedInUserId, (err) => {
                if (err)
                    return utils.fail(res, 500, 'deleteUser: DAO failed to delete user.', err);

                res.status(204).json('');

                webhooks.logEvent(app, {
                    action: webhooks.ACTION_DELETE,
                    entity: webhooks.ENTITY_USER,
                    data: {
                        deletedUserId: userId,
                        userId: loggedInUserId
                    }
                });
            });
        });
    });
};

users.deletePassword = function (app, res, loggedInUserId, userId) {
    debug('deletePassword(): ' + userId);
    users.loadUser(app, loggedInUserId, (err, adminUser) => {
        if (err)
            return utils.fail(res, 500, 'deletePassword: loadUser (loggedInUserId) failed.', err);
        if (!adminUser)
            return utils.fail(res, 400, 'Bad request. Unknown user.');
        if (!adminUser.admin)
            return utils.fail(res, 403, 'Not allowed. Only admins can delete passwords.');
        users.loadUser(app, userId, (err, user) => {
            if (err)
                return utils.fail(res, 500, 'deletePassword: loadUser (userId) failed.', err);
            if (!user)
                return res.status(404).jsonp({ message: 'User not found.' });
            if (!user.password)
                return res.status(204).send('');
            delete user.password;
            users.saveUser(app, user, loggedInUserId, (err) => {
                if (err)
                    return utils.fail(res, 500, 'deletePassword: saveUser failed.', err);
                return res.status(204).send('');
            });
        });
    });
};

module.exports = users;
