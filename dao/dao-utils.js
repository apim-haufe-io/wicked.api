'use strict';

const { debug, info, warn, error } = require('portal-env').Logger('portal-api:dao:utils');
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

daoUtils.isUserApprover = (userInfo) => {
    debug('isUserApprover()');
    var groups = utils.loadGroups();

    var isApprover = false;
    for (var i = 0; i < userInfo.groups.length; ++i) {
        var groupId = userInfo.groups[i];
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

// DAO Validation functions
daoUtils.listParameters = (o) => {
    const functionArray = [];
    listParametersImpl([], functionArray, o);
    return functionArray;
};

const listParametersImpl = (prefixArray, functionArray, o) => {
    for (let k in o) {
        const p = o[k];
        if (prefixArray.length === 0 && k === 'meta')
            continue;
        if (prefixArray.length > 0 && typeof (p) === 'function') {
            try {
                const paramList = utils.getFunctionParams(p);
                functionArray.push({
                    path: prefixArray,
                    name: k,
                    params: paramList
                });
            } catch (err) {
                console.error('Caught exception while inspecting: ' + prefixArray.join('.') + '.' + k);
                console.error(err);
                console.error(err.stack);
            }
        } else if (typeof (p) === 'object') {
            // recurse, but clone the array as we're changing it
            const moreArray = utils.clone(prefixArray);
            moreArray.push(k);
            listParametersImpl(moreArray, functionArray, p);
        }
    }
};

daoUtils.checkParameters = (desc, daoToCheck, functionList) => {
    debug(`checkParameters(${desc}`);
    let success = true;
    for (let i = 0; i < functionList.length; ++i) {
        const funcToCheck = functionList[i];
        const funcDesc = funcToCheck.path.join('.') + '.' + funcToCheck.name;
        try {
            let tmpFunc = daoToCheck;
            // Iterate down the object tree
            for (let j = 0; j < funcToCheck.path.length; ++j) {
                tmpFunc = tmpFunc[funcToCheck.path[j]];
            }
            // Finally select the function to check
            tmpFunc = tmpFunc[funcToCheck.name];
            if (!tmpFunc)
                throw new Error(`Function ${funcDesc} was not found.`);
            const paramList = utils.getFunctionParams(tmpFunc);

            if (paramList.length !== funcToCheck.params.length)
                throw new Error(`Parameter list length mismatch: ${paramList.length} !== ${funcToCheck.params.length}`);

            for (let j = 0; j < paramList.length; ++j) {
                // Each param entry has a name and default value as an array, we'll only check name
                const paramNameToCheck = paramList[j][0];
                const paramName = funcToCheck.params[j][0];
                if (paramName !== paramNameToCheck)
                    throw new Error(`Parameter naming mismatch: ${paramNameToCheck} != ${paramName}`);
            }
            
            debug(`checkParameters ${desc}: ${funcDesc} - ok`);
        } catch (err) {
            error(`An error occurred while checking ${desc}, ${funcDesc}: ${err.message}`);
            //console.error(JSON.stringify(funcToCheck, null, 2));
            //console.error(err.stack);
            success = false;
        }
    }

    if (!success)
        throw new Error('DAO sanity check did not pass');
};


module.exports = daoUtils;
