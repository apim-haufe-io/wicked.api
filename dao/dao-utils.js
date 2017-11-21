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
    if (!userInfo.groups.find(function(group) { return group == devGroup; }))
        userInfo.groups.push(devGroup);
};

daoUtils.checkClientIdAndSecret = (userInfo) => {
    debug('checkClientIdAndSecret()');
    var globalSettings = utils.loadGlobals();
    var entitled = false;
    if (userInfo.validated &&
        globalSettings.api &&
        globalSettings.api.portal &&
        globalSettings.api.portal.enableApi) {
        
        var requiredGroup = globalSettings.api.portal.requiredGroup;
        if (requiredGroup) {
            if (userInfo.groups &&
                userInfo.groups.find(function (group) { return group == requiredGroup; }))
                entitled = true;
        } else {
            entitled = true;
        }
    }
    
    if (entitled) {
        debug('entitled');
        if (!userInfo.clientId)
            userInfo.clientId = utils.createRandomId();
        if (!userInfo.clientSecret)
            userInfo.clientSecret = utils.createRandomId();
    } else {
        debug('not entitled');
        if (userInfo.clientId)
            delete userInfo.clientId;
        if (userInfo.clientSecret)
            delete userInfo.clientSecret;
    }
};

module.exports = daoUtils;
