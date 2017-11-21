'use strict';

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var debug = require('debug')('portal-api:utils');

var utils = function () { };

utils._app = null;
utils.init = (app) => {
    debug('init()');
    utils._app = app;
};

function getApp() { return utils._app; }

utils.getStaticDir = function () {
    return getApp().get('static_config');
};

utils.getInitialConfigDir = function () {
    var appDir = path.join(__dirname, '..');
    var rootDir = path.join(appDir, 'node_modules');
    var envDir = path.join(rootDir, 'portal-env');
    return path.join(envDir, 'initial-config');
};

utils.getDynamicDir = function () {
    return getApp().get('dynamic_config');
};

utils.createRandomId = function () {
    return crypto.randomBytes(20).toString('hex');
};

utils.getUtc = function () {
    return Math.floor((new Date()).getTime() / 1000);
};

utils.getJson = function (ob) {
    if (ob instanceof String || typeof ob === "string") {
        const obTrim = ob.trim();
        if (obTrim.startsWith('{') || obTrim.startsWith('['))
            return JSON.parse(obTrim);
        return { warning: 'Expected JSON, received a plain string?', message: obTrim };
    }
    return ob;
};

utils.getText = function (ob) {
    if (ob instanceof String || typeof ob === "string")
        return ob;
    return JSON.stringify(ob, null, 2);
};

utils.fail = function (res, statusCode, message, err) {
    if (err) {
        console.error(err);
        const status = err.status || statusCode || 500;
        res.status(status).json({ status: status, message: message, error: err.message });
    } else {
        res.status(statusCode).json({ status: statusCode, message: message });
    }
};

utils.makeError = (statusCode, message) => {
    const err = new Error(message);
    err.status = statusCode;
    return err;
};

var _groups = null;
utils.loadGroups = function () {
    debug('loadGroups()');
    if (!_groups) {
        var groupsDir = path.join(utils.getStaticDir(), 'groups');
        var groupsFile = path.join(groupsDir, 'groups.json');
        _groups = require(groupsFile);
        utils.replaceEnvVars(_groups);
    }
    return _groups;
};

var _apis = null;
utils.loadApis = function () {
    debug('loadApis()');
    if (!_apis) {
        var apisDir = path.join(utils.getStaticDir(), 'apis');
        var apisFile = path.join(apisDir, 'apis.json');
        _apis = require(apisFile);
        var internalApisFile = path.join(__dirname, 'internal_apis', 'apis.json');
        var internalApis = require(internalApisFile);
        injectGroupScopes(internalApis);
        _apis.apis.push.apply(_apis.apis, internalApis.apis);
        utils.replaceEnvVars(_apis);
    }
    return _apis;
};

function injectGroupScopes(apis) {
    debug('injectGroupScopes()');
    const groups = utils.loadGroups();
    const portalApi = apis.apis.find(api => api.id === 'portal-api');
    if (!portalApi)
        throw utils.makeError(500, 'Internal API portal-api not found in internal APIs list');
    if (portalApi.settings && portalApi.settings.scopes) {
        const scopes = portalApi.settings.scopes;
        for (let groupIndex = 0; groupIndex < groups.groups.length; ++groupIndex) {
            const group = groups.groups[groupIndex];
            scopes[`wicked_group:${group.id}`] = {
                description: `Group: ${group.name}`
            };
        }
    } else {
        throw utils.makeError(500, 'Internal API portal-api does not have a settings.scopes property');
    }
}

var _plans = null;
utils.loadPlans = function () {
    debug('loadPlans()');
    if (!_plans) {
        var plansDir = path.join(utils.getStaticDir(), 'plans');
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
utils.loadGlobals = function () {
    debug('loadGlobals()');
    //    var globalsFile = path.join(utils.getStaticDir(app), 'globals.json');
    //    return require(globalsFile);
    if (!_globalSettings) {
        var globalsFile = path.join(utils.getStaticDir(), 'globals.json');
        _globalSettings = JSON.parse(fs.readFileSync(globalsFile, 'utf8'));
        utils.replaceEnvVars(_globalSettings);
        _globalSettings.configDate = getConfigDate();
        _globalSettings.lastCommit = getLastCommit();
    }
    return _globalSettings;
};

function getConfigDate() {
    debug('getConfigDate()');
    var buildDatePath = path.join(utils.getStaticDir(), 'build_date');
    if (!fs.existsSync(buildDatePath))
        return "(no config date found)";
    return fs.readFileSync(buildDatePath, 'utf8');
}

function getLastCommit() {
    debug('getLastCommit()');
    var commitPath = path.join(utils.getStaticDir(), 'last_commit');
    if (!fs.existsSync(commitPath))
        return "(no last commit found)";
    return fs.readFileSync(commitPath, 'utf8');
}

utils.verifyScope = function (req, res, requiredScope) {
    if (!requiredScope)
        return true;
    // TODO
};

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
                debug('Replacing ' + envVarName + ' with "' + process.env[envVarName] + '" in "' + tempString + '".');
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
                    debug('Replacing ' + envVarName + ' with "' + process.env[envVarName] + '" in "' + tempString + '".');
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

function resolveTemplatesDir() {
    debug('resolveTemplatesDir()');
    var configDir = utils.getStaticDir();
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
utils.loadChatbotTemplates = function () {
    debug('loadChatbotTemplates()');
    if (!utils._chatbotTemplates) {
        var templatesDir = resolveTemplatesDir();
        var chatbotFile = path.join(templatesDir, 'chatbot.json');
        utils._chatbotTemplates = require(chatbotFile);
    }
    return utils._chatbotTemplates;
};

utils.loadEmailTemplate = function (app, templateName) {
    var templatesDir = resolveTemplatesDir();
    var emailTemplatesDir = path.join(templatesDir, 'email');
    var templateFile = path.join(emailTemplatesDir, templateName + '.mustache');
    if (!fs.existsSync(templateFile))
        throw new Error('File not found: ' + templateFile);
    return fs.readFileSync(templateFile, 'utf8');
};

// ENCRYPTION/DECRYPTION

var ALGORITHM = 'aes-256-ctr';

function getCipher() {
    var key = getApp().get('aes_key').toString("binary");
    var cipher = crypto.createCipher(ALGORITHM, key);
    return cipher;
}

function getDecipher() {
    var key = getApp().get('aes_key').toString("binary");
    var decipher = crypto.createDecipher(ALGORITHM, key);
    return decipher;
}

utils.apiEncrypt = function (text) {
    var cipher = getCipher();
    // Add random bytes so that it looks different each time.
    var cipherText = cipher.update(utils.createRandomId() + text, 'utf8', 'hex');
    cipherText += cipher.final('hex');
    cipherText = '!' + cipherText;
    return cipherText;
};

utils.apiDecrypt = function (cipherText) {
    if (!cipherText.startsWith('!'))
        return cipherText;
    cipherText = cipherText.substring(1); // Strip '!'
    var decipher = getDecipher();
    var text = decipher.update(cipherText, 'hex', 'utf8');
    text += decipher.final('utf8');
    text = text.substring(40); // Strip random bytes
    return text;
};

utils._packageVersion = null;
utils.getVersion = function () {
    if (!utils._packageVersion) {
        const packageFile = path.join(__dirname, '..', 'package.json');
        if (fs.existsSync(packageFile)) {
            try {
                const packageInfo = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
                if (packageInfo.version)
                    utils._packageVersion = packageInfo.version;
            } catch (ex) {
                console.error(ex);
            }
        }
        if (!utils._packageVersion) // something went wrong
            utils._packageVersion = "0.0.0";
    }
    return utils._packageVersion;
};

utils._gitLastCommit = null;
utils.getGitLastCommit = function () {
    if (!utils._gitLastCommit) {
        const lastCommitFile = path.join(__dirname, '..', 'git_last_commit');
        if (fs.existsSync(lastCommitFile))
            utils._gitLastCommit = fs.readFileSync(lastCommitFile, 'utf8');
        else
            utils._gitLastCommit = '(no last git commit found - running locally?)';
    }
    return utils._gitLastCommit;
};

utils._gitBranch = null;
utils.getGitBranch = function () {
    if (!utils._gitBranch) {
        const gitBranchFile = path.join(__dirname, '..', 'git_branch');
        if (fs.existsSync(gitBranchFile))
            utils._gitBranch = fs.readFileSync(gitBranchFile, 'utf8');
        else
            utils._gitBranch = '(unknown)';
    }
    return utils._gitBranch;
};

utils._buildDate = null;
utils.getBuildDate = function () {
    if (!utils._buildDate) {
        const buildDateFile = path.join(__dirname, '..', 'build_date');
        if (fs.existsSync(buildDateFile))
            utils._buildDate = fs.readFileSync(buildDateFile, 'utf8');
        else
            utils._buildDate = '(unknown build date)';
    }
    return utils._buildDate;
};

module.exports = utils;
