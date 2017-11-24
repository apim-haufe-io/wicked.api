'use strict';

const debug = require('debug')('portal-api:dao:utils');
const utils = require('../routes/utils');

const daoUtils = function () { };

daoUtils.isUserAdmin = (userInfo) => {
    debug('isUserAdmin()');
    var groups = utils.loadGroups();

    var isAdmin = false;
    for (var i = 0; i < userInfo.groups.length; ++i) {
        var groupId = userInfo.groups[i];
        for (var groupIndex = 0; groupIndex < groups.groups.length; ++groupIndex) {
            var group = groups.groups[groupIndex];
            if (groupId != group.id)
                continue;
            if (group.adminGroup) {
                isAdmin = true;
                break;
            }
        }
        if (isAdmin)
            break;
    }
    return isAdmin;
};

daoUtils.checkValidatedUserGroup = (userInfo) => {
    debug('checkValidatedUserGroup()');
    if (!userInfo.validated)
        return;
    var globalSettings = utils.loadGlobals();
    if (!globalSettings.validatedUserGroup)
        return;
    var devGroup = globalSettings.validatedUserGroup;
    if (!userInfo.groups.find(function (group) { return group == devGroup; }))
        userInfo.groups.push(devGroup);
};

// daoUtils.checkClientIdAndSecret = (userInfo) => {
//     debug('checkClientIdAndSecret()');
//     var globalSettings = utils.loadGlobals();
//     var entitled = false;
//     if (userInfo.validated &&
//         globalSettings.api &&
//         globalSettings.api.portal &&
//         globalSettings.api.portal.enableApi) {

//         var requiredGroup = globalSettings.api.portal.requiredGroup;
//         if (requiredGroup) {
//             if (userInfo.groups &&
//                 userInfo.groups.find(function (group) { return group == requiredGroup; }))
//                 entitled = true;
//         } else {
//             entitled = true;
//         }
//     }

//     if (entitled) {
//         debug('entitled');
//         if (!userInfo.clientId)
//             userInfo.clientId = utils.createRandomId();
//         if (!userInfo.clientSecret)
//             userInfo.clientSecret = utils.createRandomId();
//     } else {
//         debug('not entitled');
//         if (userInfo.clientId)
//             delete userInfo.clientId;
//         if (userInfo.clientSecret)
//             delete userInfo.clientSecret;
//     }
// };

daoUtils.makeName = (userInfo) => {
    if (userInfo.firstName && userInfo.lastName)
        return userInfo.firstName + ' ' + userInfo.lastName;
    else if (!userInfo.firstName && userInfo.lastName)
        return userInfo.lastName;
    else if (userInfo.firstName && !userInfo.lastName)
        return userInfo.firstName;
    return 'Unknown User';
};

daoUtils.decryptApiCredentials = (subsList) => {
    for (let i = 0; i < subsList.length; ++i) {
        const sub = subsList[i];
        if (sub.apikey)
            sub.apikey = utils.apiDecrypt(sub.apikey);
        if (sub.clientId) // For old installations, this may still be encrypted
            sub.clientId = utils.apiDecrypt(sub.clientId);
        if (sub.clientSecret)
            sub.clientSecret = utils.apiDecrypt(sub.clientSecret);
    }
};

daoUtils.encryptApiCredentials = (subsList) => {
    for (let i = 0; i < subsList.length; ++i) {
        const sub = subsList[i];
        if (sub.apikey)
            sub.apikey = utils.apiEncrypt(sub.apikey);
        // We don't encrypt the clientId (anymore); it's needed to retrieve subscriptions
        // by client ID, and it's not a real secret anyway.
        // if (sub.clientId)
        //     sub.clientId = utils.apiEncrypt(sub.clientId);
        if (sub.clientSecret)
            sub.clientSecret = utils.apiEncrypt(sub.clientSecret);
    }
};

module.exports = daoUtils;
