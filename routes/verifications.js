'use strict';

var utils = require('./utils');
var fs = require('fs');
var path = require('path');
var debug = require('debug')('portal-api:verifications');
var bcrypt = require('bcrypt-nodejs');

var webhooks = require('./webhooks');

var verifications = require('express').Router();
verifications.setup = function (users) {
    verifications._usersModule = users;
};

// ===== ENDPOINTS =====

verifications.post('/', function (req, res, next) {
    verifications.addVerification(req.app, res, verifications._usersModule, req.body);
});

verifications.get('/:verificationId', function (req, res, next) {
    verifications.getVerification(req.app, res, verifications._usersModule, req.params.verificationId);
});

verifications.delete('/:verificationId', function (req, res, next) {
    verifications.deleteVerification(req.app, res, verifications._usersModule, req.params.verificationId);
});

verifications.get('/', function (req, res, next) {
    verifications.getVerifications(req.app, res, verifications._usersModule, req.apiUserId);
});

// ===== IMPLEMENTATION =====

verifications.EXPIRY_SECONDS = 3600;

// ===== PERSISTENCE =====

verifications.loadVerifications = function (app) {
    debug('loadVerifications()');
    var verificationsDir = path.join(utils.getDynamicDir(app), 'verifications');
    var verificationsFile = path.join(verificationsDir, '_index.json');
    if (!fs.existsSync(verificationsFile))
        return [];
    return JSON.parse(fs.readFileSync(verificationsFile, 'utf8'));
};

verifications.saveVerifications = function (app, verificationInfos) {
    debug('saveVerifications()');
    debug(verificationInfos);
    var verificationsDir = path.join(utils.getDynamicDir(app), 'verifications');
    var verificationsFile = path.join(verificationsDir, '_index.json');
    fs.writeFileSync(verificationsFile, JSON.stringify(verificationInfos, null, 2), 'utf8');
};

verifications.addVerification = function (app, res, users, body) {
    debug('addVerification()');
    debug(body);
    var verificationType = body.type;
    var email = body.email;

    if (!verificationType ||
        ("email" != verificationType &&
         "lostpassword" != verificationType))
        return res.status(400).jsonp({ message: 'Unknown verification type.' });

    var entityName = webhooks.ENTITY_VERIFICATION_LOSTPASSWORD;
    if ("email" == verificationType)
        entityName = webhooks.ENTITY_VERIFICATION_EMAIL;

    var userInfo = users.loadUserByEmail(app, email);
    if (!userInfo)
        return res.status(204).jsonp({ message: 'No content' });
    email = email.toLowerCase().trim();
    if (userInfo.customId && "lostpassword" == verificationType)
        return res.status(400).jsonp({ message: 'Email address belongs to a federated user. Cannot change password as the user does not have a password. Log in using federation.'});

    utils.withLockedVerifications(app, res, function () {
        var verifs = verifications.loadVerifications(app);
        var newVerif = {
            id: utils.createRandomId(),
            type: verificationType,
            email: email,
            userId: userInfo.id,
            utc: utils.getUtc(),
        };
        verifs.push(newVerif);
        verifications.saveVerifications(app, verifs);

        webhooks.logEvent(app, {
            action: webhooks.ACTION_ADD,
            entity: entityName,
            data: newVerif
        });

        res.status(204).jsonp({ message: 'No content.' });
    });
};

verifications.getVerifications = function (app, res, users, loggedInUserId) {
    debug('getVerifications()');
    var userInfo = users.loadUser(app, loggedInUserId);
    if (!userInfo ||
        !userInfo.admin)
        return res.status(403).jsonp({ message: 'Not allowed. Only Admins may do this.' });
    var verifs = verifications.loadVerifications(app);
    res.json(verifs);
};

verifications.getVerification = function (app, res, users, verificationId) {
    debug('getVerification(): ' + verificationId);
    if (!verificationId)
        return res.status(404).jsonp({ message: 'Not found. Invalid verification ID.' });
    var verifs = verifications.loadVerifications(app);
    var thisVerif = verifs.find(function (verif) { return verif.id == verificationId; });
    if (!thisVerif)
        return res.status(404).jsonp({ message: 'Not found. Verification ID not found.' });
    res.json(thisVerif);
};

verifications.deleteVerification = function (app, res, users, verificationId) {
    debug('deleteVerification(): ' + verificationId);
    if (!verificationId)
        return res.status(404).jsonp({ message: 'Not found. Invalid verification ID.' });
    utils.withLockedVerifications(app, res, function () {
        var verifs = verifications.loadVerifications(app);
        var verifIndex = -1;
        for (var i = 0; i < verifs.length; ++i) {
            if (verifs[i].id === verificationId) {
                verifIndex = i;
                break;
            }
        }
        if (verifIndex < 0)
            return res.status(404).jsonp({ message: 'Not found. Verification ID not found.' });
        var thisVerif = verifs[verifIndex];
        verifs.splice(verifIndex, 1);

        verifications.saveVerifications(app, verifs);
        
        res.status(204).send('');

        webhooks.logEvent(app, {
            action: webhooks.ACTION_DELETE,
            entity: webhooks.ENTITY_VERIFICATION,
            data: thisVerif
        });
    });
};

verifications.patchUserWithVerificationId = function (app, res, users, verificationId, userId, body) {
    debug('patchUserWithVerificationId(): ' + userId + ', verificationId: ' + verificationId);
    debug(body);

    var verifs = verifications.loadVerifications(app);
    var thisVerif = verifs.find(function (verif) { return verif.id == verificationId; });
    if (!thisVerif)
        return res.status(404).jsonp({ message: 'Not found. Verification ID not found.' });
    if (thisVerif.userId != userId)
        return res.status(403).jsonp({ message: 'Not allowed. Verification ID belongs to other User ID.' });
    var foundPassword = false;
    var foundValidated = false;
    var foundOthers = false;
    for (var propName in body) {
        if ("password" == propName)
            foundPassword = true;
        else if ("validated" == propName)
            foundValidated = true;
        else
            foundOthers = true;
    }
    if ((!foundPassword && !foundValidated) || foundOthers)
        return res.status(400).jsonp({ message: 'Bad request. You can only patch the password or validated property with a verification ID.' });
    utils.withLockedUser(app, res, userId, function () {
        var userInfo = users.loadUser(app, userId);
        if (!userInfo)
            return res.status(404).jsonp({ message: 'Cannot update User. User not found.' });
        if (userInfo.customId && foundPassword)
            return res.status(400).jsonp({ message: 'Cannot update password of federated user. User has no password.'});

        if (foundPassword)
            userInfo.password = bcrypt.hashSync(body.password);
        else if (foundValidated)
            userInfo.validated = body.validated;
        
        users.saveUser(app, userInfo, userId);
        
        res.status(204).send('');
        
        if (foundPassword) {
            webhooks.logEvent(app, {
                action: webhooks.ACTION_PASSWORD,
                entity: webhooks.ENTITY_USER,
                data: {
                    userId: userInfo.id
                }
            });
        } else if (foundValidated) {
            webhooks.logEvent(app, {
                action: webhooks.ACTION_VALIDATED,
                entity: webhooks.ENTITY_USER,
                data: {
                    userId: userInfo.id
                }
            });
        }
    });
};

verifications.checkExpiredRecords = function (app) {
    debug('checkExpiredRecords()');
    if (!webhooks.areHooksEnabled()) {
        debug('checkExpiredRecords() - Webhooks are disabled');
        return;
    }
    var lockedVerifs = false;
    try {
        if (!utils.lockVerifications(app))
            return;
        lockedVerifs = true;

        var verifs = verifications.loadVerifications(app);

        var found = true;
        var changedSomething = false;
        var rightNow = utils.getUtc();
        while (found) {
            var expiredIndex = -1;
            for (var i = 0; i < verifs.length; ++i) {
                var thisVerif = verifs[i];
                if ((rightNow - thisVerif.utc) > verifications.EXPIRY_SECONDS) {
                    debug('Found expired record, removing ' + thisVerif.id);
                    expiredIndex = i;
                    break;
                }
            }
            if (expiredIndex < 0) {
                found = false;
            } else {
                verifs.splice(expiredIndex, 1);
                changedSomething = true;
            }
        }

        if (changedSomething) {
            verifications.saveVerifications(app, verifs);
        }
    } catch (err) {
        // Opps?
        debug('Strange behaviour, caught exception in checkExpiredRecords()');
        debug(err);
        console.error(err);
    } finally {
        if (lockedVerifs)
            utils.unlockVerifications(app);
    }
};

module.exports = verifications;