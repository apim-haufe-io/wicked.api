'use strict';

const debug = require('debug')('portal-api:dao:json:verifications');
const fs = require('fs');
const path = require('path');

const utils = require('../../../routes/utils');
const jsonUtils = require('./json-utils');

const jsonVerifications = () => { };

// =================================================
// DAO contract
// =================================================

jsonVerifications.create = (verifInfo, callback) => {
    debug('create()');
    jsonUtils.checkCallback(callback);
    let persistedVerif;
    try {
        persistedVerif = jsonVerifications.createSync(verifInfo);
    } catch (err) {
        return callback(err);
    }
    return callback(null, persistedVerif);
};

jsonVerifications.getAll = (callback) => {
    debug('getAll()');
    jsonUtils.checkCallback(callback);
    let verifs;
    try {
        verifs = jsonVerifications.loadVerifications();
    } catch (err) {
        return callback(err);
    }
    return callback(null, verifs);
};

jsonVerifications.getById = (verificationId, callback) => {
    debug(`getById(${verificationId})`);
    jsonUtils.checkCallback(callback);
    let verif;
    try {
        verif = jsonVerifications.getByIdSync(verificationId);
    } catch (err) {
        return callback(err);
    }
    return callback(null, verif);
};

jsonVerifications.delete = (verificationId, callback) => {
    debug(`delete(${verificationId}`);
    jsonUtils.checkCallback(callback);
    let deletedVerif;
    try {
        deletedVerif = jsonVerifications.deleteSync(verificationId);
    } catch (err) {
        return callback(err);
    }
    return callback(null, deletedVerif);
};

jsonVerifications.reconcile = (expirySeconds, callback) => {
    debug('reconcile()');
    jsonUtils.checkCallback(callback);
    try {
        jsonVerifications.reconcileSync(expirySeconds);
    } catch (err) {
        return callback(err);
    }
    return callback(null);
};

// =================================================
// DAO implementation/internal methods
// =================================================

jsonVerifications.loadVerifications = function () {
    debug('loadVerifications()');
    const verificationsDir = path.join(utils.getDynamicDir(), 'verifications');
    const verificationsFile = path.join(verificationsDir, '_index.json');
    if (!fs.existsSync(verificationsFile))
        return [];
    return JSON.parse(fs.readFileSync(verificationsFile, 'utf8'));
};

jsonVerifications.saveVerifications = function (verificationInfos) {
    debug('saveVerifications()');
    debug(verificationInfos);
    const verificationsDir = path.join(utils.getDynamicDir(), 'verifications');
    const verificationsFile = path.join(verificationsDir, '_index.json');
    fs.writeFileSync(verificationsFile, JSON.stringify(verificationInfos, null, 2), 'utf8');
};

jsonVerifications.createSync = (verifInfo) => {
    debug('createSync()');
    return jsonUtils.withLockedVerifications(() => {
        const verifs = jsonVerifications.loadVerifications();
        verifs.push(verifInfo);
        jsonVerifications.saveVerifications(verifs);
        return verifInfo;
    });
};

jsonVerifications.getByIdSync = (verificationId) => {
    debug('getByIdSync()');
    const verifs = jsonVerifications.loadVerifications();
    const thisVerif = verifs.find(verif => verif.id === verificationId);
    if (!thisVerif)
        return null;
    return thisVerif;
};

jsonVerifications.deleteSync = (verificationId) => {
    debug('deleteSync()');
    return jsonUtils.withLockedVerifications(function () {
        const verifs = jsonVerifications.loadVerifications();
        let verifIndex = -1;
        for (let i = 0; i < verifs.length; ++i) {
            if (verifs[i].id === verificationId) {
                verifIndex = i;
                break;
            }
        }
        if (verifIndex < 0)
            return utils.makeError(404, 'Not found. Verification ID not found.');
        const thisVerif = verifs[verifIndex];
        verifs.splice(verifIndex, 1);

        jsonVerifications.saveVerifications(verifs);

        return thisVerif;
    });
};

jsonVerifications.reconcileSync = (expirySeconds) => {
    debug('reconcileSync()');
    let lockedVerifs = false;
    try {
        if (!jsonUtils.lockVerifications())
            return;
        lockedVerifs = true;

        const verifs = jsonVerifications.loadVerifications();

        let found = true;
        let changedSomething = false;
        const rightNow = utils.getUtc();
        while (found) {
            let expiredIndex = -1;
            for (let i = 0; i < verifs.length; ++i) {
                const thisVerif = verifs[i];
                if ((rightNow - thisVerif.utc) > expirySeconds) {
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
            jsonVerifications.saveVerifications(verifs);
        }
    } finally {
        if (lockedVerifs)
            jsonUtils.unlockVerifications();
    }
};

module.exports = jsonVerifications;
