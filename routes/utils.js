'use strict';

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var debug = require('debug')('portal-api:utils');

var utils = function () { };

utils.getStaticDir = function (app) {
    return app.get('static_config');
};

utils.getInitialConfigDir = function () {
    var appDir = path.join(__dirname, '..');
    var rootDir = path.join(appDir, 'node_modules');
    var envDir = path.join(rootDir, 'portal-env');
    return path.join(envDir, 'initial-config');
};

utils.getDynamicDir = function (app) {
    return app.get('dynamic_config');
};

utils.createRandomId = function () {
    return crypto.randomBytes(20).toString('hex');
};

utils.getUtc = function () {
    return Math.floor((new Date()).getTime() / 1000);
};

utils.getJson = function (ob) {
    if (ob instanceof String || typeof ob === "string")
        return JSON.parse(ob);
    return ob;
};

utils.getText = function (ob) {
    if (ob instanceof String || typeof ob === "string")
        return ob;
    return JSON.stringify(ob, null, 2);
};

var _groups = null;
utils.loadGroups = function (app) {
    debug('loadGroups()');
    if (!_groups) {
        var groupsDir = path.join(utils.getStaticDir(app), 'groups');
        var groupsFile = path.join(groupsDir, 'groups.json');
        _groups = require(groupsFile);
        utils.replaceEnvVars(_groups);
    }
    return _groups;
};

var _apis = null;
utils.loadApis = function (app) {
    debug('loadApis()');
    if (!_apis) {
        var apisDir = path.join(utils.getStaticDir(app), 'apis');
        var apisFile = path.join(apisDir, 'apis.json');
        _apis = require(apisFile);
        var internalApisFile = path.join(__dirname, 'internal_apis', 'apis.json');
        var internalApis = require(internalApisFile);
        _apis.apis.push.apply(_apis.apis, internalApis.apis);
        utils.replaceEnvVars(_apis);
    }
    return _apis;
};

var _plans = null;
utils.loadPlans = function (app) {
    debug('loadPlans()');
    if (!_plans) {
        var plansDir = path.join(utils.getStaticDir(app), 'plans');
        var plansFile = path.join(plansDir, 'plans.json');
        _plans = require(plansFile);
        var internalPlansFile = path.join(__dirname, 'internal_apis', 'plans.json');
        var internalPlans = require(internalPlansFile);
        _plans.plans.push.apply(_plans.plans, internalPlans.plans);
        utils.replaceEnvVars(_plans);
    }
    return _plans;
};

var _globalSettings = null;
utils.loadGlobals = function (app) {
    debug('loadGlobals()');
    //    var globalsFile = path.join(utils.getStaticDir(app), 'globals.json');
    //    return require(globalsFile);
    if (!_globalSettings) {
        var globalsFile = path.join(utils.getStaticDir(app), 'globals.json');
        _globalSettings = JSON.parse(fs.readFileSync(globalsFile, 'utf8'));
        utils.replaceEnvVars(_globalSettings);
        _globalSettings.configDate = getConfigDate(app);
        _globalSettings.lastCommit = getLastCommit(app);
    }
    return _globalSettings;
};

function getConfigDate(app) {
    debug('getConfigDate()');
    var buildDatePath = path.join(utils.getStaticDir(app), 'build_date');
    if (!fs.existsSync(buildDatePath))
        return "(no config date found)";
    return fs.readFileSync(buildDatePath, 'utf8');
}

function getLastCommit(app) {
    debug('getLastCommit()');
    var commitPath = path.join(utils.getStaticDir(app), 'last_commit');
    if (!fs.existsSync(commitPath))
        return "(no last commit found)";
    return fs.readFileSync(commitPath, 'utf8');
}

utils.replaceEnvVars = function (someObject) {
    debug('replaceEnvVars()');
    replaceEnvVarsInternal(someObject);
};

function hasEnvVars(s) {
    return s.startsWith('$') || (s.indexOf('${') >= 0);
}

function replaceEnvVarsInString(s) {
    var tempString = "" + s;
    var foundVar = hasEnvVars(tempString);
    var iterCount = 0;
    while (foundVar) {
        iterCount++;
        if (iterCount > 10) {
            console.error('Detected recursive use of env variables.');
            console.error('Original string: ' + s);
            console.error('Current string : ' + tempString);
            return tempString;
        }
        if (tempString.startsWith('$') &&
            !tempString.startsWith("${")) {
            let envVarName = tempString.substring(1);
            if (process.env[envVarName]) {
                debug('Replacing ' + envVarName + ' with "' + process.env[envVarName] + '" in "' + tempString + '".' );
                tempString = process.env[envVarName];
            }
        } else {
            // Inline env var ${...}
            var envRegExp = /\$\{([A-Za-z\_0-9]+)\}/g; // match ${VAR_NAME}
            var match = envRegExp.exec(tempString);
            if (match) {
                let envVarName = match[1]; // Capture group 1
                // Replace regexp with value of env var
                if (process.env[envVarName]) {
                    debug('Replacing ' + envVarName + ' with "' + process.env[envVarName] + '" in "' + tempString + '".' );
                    tempString = tempString.replace(match[0], process.env[envVarName]);
                }
            }
        }
        // Possibly recurse
        foundVar = hasEnvVars(tempString);
    }
    return tempString;
}

function replaceEnvVarsInternal(someObject) {
    debug(someObject);
    for (var propName in someObject) {
        var propValue = someObject[propName];
        if (typeof propValue == "string") {
            if (hasEnvVars(propValue)) {
                debug('Detected env var in ' + propName + ': ' + propValue);
                someObject[propName] = replaceEnvVarsInString(propValue);            
            }
        } else if (typeof propValue == "object") {
	        replaceEnvVarsInternal(propValue);
        }
    }
}

utils.globalLock = function (app) {
    var globalLockFileName = path.join(utils.getDynamicDir(app), 'global.lock');
    if (fs.existsSync(globalLockFileName))
        throw "utils.globalLock - System already is globally locked!";
    fs.writeFileSync(globalLockFileName, '');
    return true;
}; 

utils.globalUnlock = function (app) {
    var globalLockFileName = path.join(utils.getDynamicDir(app), 'global.lock');
    if (!fs.existsSync(globalLockFileName))
        throw "utils.globalUnlock - System isn't locked, cannot unlock!";
    fs.unlinkSync(globalLockFileName);
    return true;
};

utils.hasGlobalLock = function (app) {
    var globalLockFileName = path.join(utils.getDynamicDir(app), 'global.lock');
    return fs.existsSync(globalLockFileName);    
};

utils.lockFile = function (app, subDir, fileName) {
    debug('lockFile(): ' + subDir + '/' + fileName);
    if (utils.hasGlobalLock(app))
        return false;
    var baseDir = path.join(utils.getDynamicDir(app), subDir);
    var fullFileName = path.join(baseDir, fileName);
    var lockFileName = fullFileName + '.lock';

    if (!fs.existsSync(fullFileName))
        throw "utils.lockFile - File not found: " + fileName;

    if (fs.existsSync(lockFileName))
        return false;

    fs.writeFileSync(lockFileName, '');
    return true;
};

utils.unlockFile = function (app, subDir, fileName) {
    debug('unlockFile(): ' + subDir + '/' + fileName);
    var baseDir = path.join(utils.getDynamicDir(app), subDir);
    var lockFileName = path.join(baseDir, fileName + '.lock');

    if (fs.existsSync(lockFileName))
        fs.unlinkSync(lockFileName);
};

// SPECIFIC LOCKS

// USERS

utils.lockUserIndex = function (app) {
    return utils.lockFile(app, 'users', '_index.json');
};

utils.unlockUserIndex = function (app) {
    utils.unlockFile(app, 'users', '_index.json');
};

utils.lockUser = function (app, userId) {
    return utils.lockFile(app, 'users', userId + '.json');
};

utils.unlockUser = function (app, userId) {
    utils.unlockFile(app, 'users', userId + '.json');
};

// APPLICATIONS

utils.lockAppsIndex = function (app) {
    return utils.lockFile(app, 'applications', '_index.json');
};

utils.unlockAppsIndex = function (app) {
    utils.unlockFile(app, 'applications', '_index.json');
};

utils.lockApplication = function (app, appId) {
    return utils.lockFile(app, 'applications', appId + '.json');
};

utils.unlockApplication = function (app, appId) {
    utils.unlockFile(app, 'applications', appId + '.json');
};

utils.getAppsDir = function (app) {
    return path.join(utils.getDynamicDir(app), 'applications');
};

// SUBSCRIPTIONS

utils.lockSubscriptions = function (app, appId) {
    return utils.lockFile(app, 'subscriptions', appId + '.subs.json');
};

utils.unlockSubscriptions = function (app, appId) {
    utils.unlockFile(app, 'subscriptions', appId + '.subs.json');
};

// APPROVALS

utils.lockApprovals = function (app) {
    return utils.lockFile(app, 'approvals', '_index.json');
};

utils.unlockApprovals = function (app) {
    return utils.unlockFile(app, 'approvals', '_index.json');
};

// WEBHOOKS

utils.LISTENER_FILE = '_listeners.json';

utils.lockListeners = function (app) {
    return utils.lockFile(app, 'webhooks', utils.LISTENER_FILE);
};

utils.unlockListeners = function (app) {
    return utils.unlockFile(app, 'webhooks', utils.LISTENER_FILE);
};

utils.lockEvents = function (app, listenerId) {
    return utils.lockFile(app, 'webhooks', listenerId + '.json');
};

utils.unlockEvents = function (app, listenerId) {
    utils.unlockFile(app, 'webhooks', listenerId + '.json');
};

// VERIFICATIONS

utils.lockVerifications = function (app) {
    return utils.lockFile(app, 'verifications', '_index.json');
};

utils.unlockVerifications = function (app) {
    return utils.unlockFile(app, 'verifications', '_index.json');
};

// LOCKING UTILITY FUNCTIONS

utils.withLockedUserList = function (app, res, userIdList, actionHook) {
    debug('withLockedUserList()');
    debug(userIdList);
    var lockedUsers = [];
    try {
        for (let i = 0; i < userIdList.length; ++i) {
            if (!utils.lockUser(app, userIdList[i]))
                return res.status(423).jsonp({ message: 'User with id ' + userIdList[i] + ' is locked. Try again later.' });
            lockedUsers.push(userIdList[i]);
        }

        actionHook();

        debug('withLockedUserList() finished');
    } finally {
        for (let i = 0; i < lockedUsers.length; ++i) {
            try { utils.unlockUser(app, lockedUsers[i]); } catch (err) { debug(err); console.error(err); }
        }
        debug('withLockedUserList() cleaned up');
    }
};

utils.withLockedUser = function (app, res, userId, actionHook) {
    debug('withLockedUser(): ' + userId);
    utils.withLockedUserList(app, res, [userId], actionHook);
};

utils.withLockedUserIndex = function (app, res, actionHook) {
    debug('withLockedUserIndex()');
    var lockedIndex = false;
    try {
        if (!utils.lockUserIndex(app))
            return res.status(423).jsonp({ message: 'User index is currently locked. Try again later.' });
        lockedIndex = true;

        actionHook();

        debug('withLockedUserIndex() finished');

    } finally {
        if (lockedIndex)
            try { utils.unlockUserIndex(app); } catch (err) { debug(err); console.error(err); }
        debug('withLockedUserIndex() cleaned up');
    }
};

utils.withLockedAppsIndex = function (app, res, actionHook) {
    debug('withLockedAppsIndex()');
    var lockedIndex = false;
    try {
        if (!utils.lockAppsIndex(app))
            return res.status(423).jsonp({ message: 'Application index is currently locked. Try again later.' });
        lockedIndex = true;

        actionHook();

        debug('withLockedAppsIndex() finished');
    } finally {
        if (lockedIndex)
            try { utils.unlockAppsIndex(app); } catch (err) { debug(err); console.error(err); }
        debug('withLockedAppsIndex() cleaned up');
    }
};

utils.withLockedApp = function (app, res, appId, actionHook) {
    debug('withLockedApp(): ' + appId);
    var lockedApp = false;
    try {
        if (!utils.lockApplication(app, appId))
            return res.status(423).jsonp({ message: 'Application is locked. Please try again later.' });
        lockedApp = true;

        actionHook();

        debug('withLockedApp(): ' + appId + ' finished');
    } finally {
        if (lockedApp)
            try { utils.unlockApplication(app, appId); } catch (err) { debug(err); console.error(err); }
        debug('withLockedApp(): ' + appId + ' cleaned up');
    }
};

utils.withLockedSubscriptions = function (app, res, appId, actionHook) {
    debug('withLockedSubscriptions(): ' + appId);
    var lockedSubscriptions = false;
    try {
        if (!utils.lockSubscriptions(app, appId))
            return res.status(423).jsonp({ message: 'Application subscriptions are locked. Try again later.' });
        lockedSubscriptions = true;

        actionHook();

        debug('withLockedSubscriptions(): ' + appId + ' finished');
    } finally {
        if (lockedSubscriptions)
            try { utils.unlockSubscriptions(app, appId); } catch (err) { debug(err); console.error(err); }
        debug('withLockedSubscriptions(): ' + appId + ' cleaned up');
    }
};

utils.withLockedApprovals = function (app, res, actionHook) {
    debug('withLockedApprovals()');
    var lockedApprovals = false;
    try {
        if (!utils.lockApprovals(app))
            return res.status(423).jsonp({ message: 'Approvals index is locked. Try again later.' });
        lockedApprovals = true;

        actionHook();

        debug('withLockedApprovals() finished');
    } finally {
        if (lockedApprovals)
            try { utils.unlockApprovals(app); } catch (err) { debug(err); console.error(err); }
        debug('withLockedApprovals() cleaned up');
    }
};

utils.withLockedEvents = function (app, res, listenerId, actionHook) {
    debug('withLockedEvents(): ' + listenerId);
    var lockedEvents = false;
    try {
        if (!utils.lockEvents(app, listenerId))
            return res.status(423).jsonp({ message: 'Events for listener are locked. Try again later.' });
        lockedEvents = true;

        actionHook();

        debug('withLockedEvents(): ' + listenerId + ' finished');
    } finally {
        if (lockedEvents)
            try { utils.unlockEvents(app, listenerId); } catch (err) { }
        debug('withLockedEvents(): ' + listenerId + ' cleaned up');
    }
};

utils.withLockedListeners = function (app, res, listenerId, actionHook) {
    debug('withLockedListeners()');
    var lockedListeners = false;
    try {
        if (!utils.lockListeners(app))
            return res.status(423).jsonp({ message: 'Listener index locked. Try again later.' });
        lockedListeners = true;

        actionHook();

        debug('withLockedListeners() finished');
    } finally {
        if (lockedListeners)
            try { utils.unlockListeners(app); } catch (err) { }
        debug('withLockedListeners() cleaned up');
    }
};

utils.withLockedVerifications = function (app, res, actionHook) {
    debug('withLockedVerifications()');
    var lockedVerifications = false;
    try {
        if (!utils.lockVerifications(app))
            return res.status(423).jsonp({ message: 'Verification index locked. Try again later.' });
        lockedVerifications = true;

        actionHook();

        debug('withLockedVerifications() finished');
    } finally {
        if (lockedVerifications)
            try { utils.unlockVerifications(app); } catch (err) { }
        debug('withLockedVerifications() cleaned up');
    }
};

function resolveTemplatesDir(app) {
    debug('resolveTemplatesDir()');
    var configDir = utils.getStaticDir(app);
    var templatesDir = path.join(configDir, 'templates');
    debug(' - trying ' + templatesDir);
    var chatbotFile = path.join(templatesDir, 'chatbot.json');
    if (fs.existsSync(chatbotFile)) {
        debug('Templates dir (from config): ' + templatesDir);
        return templatesDir;
    }
    var rootConfigDir = utils.getInitialConfigDir();
    configDir = path.join(rootConfigDir, 'static');
    templatesDir = path.join(configDir, 'templates');
    debug(' - trying ' + templatesDir);
    chatbotFile = path.join(templatesDir, 'chatbot.json');
    if (fs.existsSync(chatbotFile)) {
        debug('Templates dir (from defaults): ' + templatesDir);
        return templatesDir;
    }
    throw new Error('Could not locate templates dir!');
}

utils._chatbotTemplates = null;
utils.loadChatbotTemplates = function (app) {
    debug('loadChatbotTemplates()');
    if (!utils._chatbotTemplates) {
        var templatesDir = resolveTemplatesDir(app);
        var chatbotFile = path.join(templatesDir, 'chatbot.json');
        utils._chatbotTemplates = require(chatbotFile);
    }
    return utils._chatbotTemplates;
};

utils.loadEmailTemplate = function (app, templateName) {
    var templatesDir = resolveTemplatesDir(app);
    var emailTemplatesDir = path.join(templatesDir, 'email');
    var templateFile = path.join(emailTemplatesDir, templateName + '.mustache');
    if (!fs.existsSync(templateFile))
        throw new Error('File not found: ' + templateFile);
    return fs.readFileSync(templateFile, 'utf8');
};

// ENCRYPTION/DECRYPTION

var ALGORITHM = 'aes-256-ctr';

function getCipher(app) {
    var key = app.get('aes_key').toString("binary");
    var cipher = crypto.createCipher(ALGORITHM, key);
    return cipher;
}

function getDecipher(app) {
    var key = app.get('aes_key').toString("binary");
    var decipher = crypto.createDecipher(ALGORITHM, key);
    return decipher;
}

utils.apiEncrypt = function(app, text) {
    var cipher = getCipher(app);
    // Add random bytes so that it looks different each time.
    var cipherText = cipher.update(utils.createRandomId() + text, 'utf8', 'hex');
    cipherText += cipher.final('hex');
    cipherText = '!' + cipherText;
    return cipherText;
};

utils.apiDecrypt = function (app, cipherText) {
    if (!cipherText.startsWith('!'))
        return cipherText;
    cipherText = cipherText.substring(1); // Strip '!'
    var decipher = getDecipher(app);
    var text = decipher.update(cipherText, 'hex', 'utf8');
    text += decipher.final('utf8');
    text = text.substring(40); // Strip random bytes
    return text; 
};


module.exports = utils;
