'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { debug, info, warn, error } = require('portal-env').Logger('portal-api:utils');

const utils = function () { };

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
    const appDir = path.join(__dirname, '..');
    const rootDir = path.join(appDir, 'node_modules');
    const envDir = path.join(rootDir, 'portal-env');
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
        error(err);
        const status = err.status || statusCode || 500;
        res.status(status).json({ status: status, message: message, error: err.message });
    } else {
        res.status(statusCode).json({ status: statusCode, message: message });
    }
};

utils.failError = function (res, err) {
    if (err.stack) {
        console.log(err.stack);
        error(err.stack);
    }
    return utils.fail(res, err.status || 500, err.message);
};

utils.makeError = (statusCode, message) => {
    const err = new Error(message);
    err.status = statusCode;
    return err;
};

let _groups = null;
utils.loadGroups = function () {
    debug('loadGroups()');
    if (!_groups) {
        const groupsDir = path.join(utils.getStaticDir(), 'groups');
        const groupsFile = path.join(groupsDir, 'groups.json');
        _groups = require(groupsFile);
        utils.replaceEnvVars(_groups);
    }
    return _groups;
};

let _apis = null;
utils.loadApis = function () {
    debug('loadApis()');
    if (!_apis) {
        const apisDir = path.join(utils.getStaticDir(), 'apis');
        const apisFile = path.join(apisDir, 'apis.json');
        _apis = require(apisFile);
        const internalApisFile = path.join(__dirname, 'internal_apis', 'apis.json');
        const internalApis = require(internalApisFile);
        injectGroupScopes(internalApis);
        injectAuthMethods(internalApis);
        _apis.apis.push.apply(_apis.apis, internalApis.apis);
        utils.replaceEnvVars(_apis);
    }
    return _apis;
};

utils.getApi = function (apiId) {
    debug(`getApi(${apiId})`);
    const apiList = utils.loadApis();
    const apiIndex = apiList.apis.findIndex(a => a.id === apiId);
    if (apiIndex < 0)
        throw utils.makeError(404, `API ${apiId} is unknown`);
    return apiList.apis[apiIndex];
};

let _poolsMap = null;
utils.getPools = function () {
    debug(`getPools()`);
    if (!_poolsMap) {
        _poolsMap = {};
        // Load all the pools
        const poolsDir = path.join(utils.getStaticDir(), 'pools');
        const poolFiles = fs.readdirSync(poolsDir);
        for (let i = 0; i < poolFiles.length; ++i) {
            const file = poolFiles[i];
            if (!file.endsWith('.json')) {
                warn(`getPools: Found non-JSON file in pools directory: ${file} (ignoring)`);
                continue;
            }
            const poolFile = path.join(poolsDir, file);
            const poolId = file.substring(0, file.length - 5); // Cut off .json
            const poolInfo = JSON.parse(fs.readFileSync(poolFile, 'utf8'));

            _poolsMap[poolId] = poolInfo;
        }
    }
    return _poolsMap;
};

utils.getPool = function (poolId) {
    debug(`getPool(${poolId})`);
    const pools = utils.getPools();
    if (!utils.isPoolIdValid(poolId))
        throw utils.makeError(400, utils.validationErrorMessage('Pool ID'));
    if (!utils.hasPool(poolId))
        throw utils.makeError(404, `The registration pool ${poolId} is not defined.`);
    return pools[poolId];
};

utils.hasPool = function (poolId) {
    debug(`hasPool(${poolId})`);
    const pools = utils.getPools();
    return (pools.hasOwnProperty(poolId));
};

const validationRegex = /^[a-z0-9_-]+$/;
utils.isNamespaceValid = (namespace) => {
    // Empty or null namespaces are valid
    if (!namespace)
        return true;
    if (namespace.match(validationRegex))
        return true;
    return false;
};

utils.isPoolIdValid = (poolId) => {
    if (!poolId)
        return false;
    if (poolId.match(validationRegex))
        return true;
    return false;
};

utils.validationErrorMessage = (entity) => {
    return `Registrations: ${entity} is invalid, must contain a-z, 0-9, _ and - only.`;
};

const applicationRegex = /^[a-zA-Z0-9\-_]+$/;
utils.isValidApplicationId = (appId) => {
    if (!applicationRegex.test(appId))
        return false;
    return true;
};

utils.invalidApplicationIdMessage = () => {
    return 'Invalid application ID, allowed chars are: a-z, A-Z, -, _';
};

function injectGroupScopes(apis) {
    debug('injectGroupScopes()');
    const groups = utils.loadGroups();
    const portalApi = apis.apis.find(api => api.id === 'portal-api');
    if (!portalApi)
        throw utils.makeError(500, 'injectGroupScopes: Internal API portal-api not found in internal APIs list');
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

function injectAuthMethods(apis) {
    debug('injectAuthMethods()');
    const globals = utils.loadGlobals();
    if (!globals.portal ||
        !globals.portal.authMethods ||
        !Array.isArray(globals.portal.authMethods)) {
        throw utils.makeError(500, 'injectAuthMethods: globals.json does not contain a portal.authMethods array.');
    }
    const portalApi = apis.apis.find(api => api.id === 'portal-api');
    if (!portalApi)
        throw utils.makeError(500, 'injectAuthMethods: Internal API portal-api not found in internal APIs list');
    debug('Configuring auth methods for portal-api API:');
    debug(globals.portal.authMethods);
    portalApi.authMethods = utils.clone(globals.portal.authMethods);
}

let _plans = null;
utils.loadPlans = function () {
    debug('loadPlans()');
    if (!_plans) {
        const plansDir = path.join(utils.getStaticDir(), 'plans');
        const plansFile = path.join(plansDir, 'plans.json');
        _plans = require(plansFile);
        const internalPlansFile = path.join(__dirname, 'internal_apis', 'plans.json');
        const internalPlans = require(internalPlansFile);
        _plans.plans.push.apply(_plans.plans, internalPlans.plans);
        utils.replaceEnvVars(_plans);
    }
    return _plans;
};

let _globalSettings = null;
utils.loadGlobals = function () {
    debug('loadGlobals()');
    //    const globalsFile = path.join(utils.getStaticDir(app), 'globals.json');
    //    return require(globalsFile);
    if (!_globalSettings) {
        const globalsFile = path.join(utils.getStaticDir(), 'globals.json');
        _globalSettings = JSON.parse(fs.readFileSync(globalsFile, 'utf8'));
        utils.replaceEnvVars(_globalSettings);
        _globalSettings.configDate = getConfigDate();
        _globalSettings.lastCommit = getLastCommit();
    }
    return _globalSettings;
};

function getConfigDate() {
    debug('getConfigDate()');
    const buildDatePath = path.join(utils.getStaticDir(), 'build_date');
    if (!fs.existsSync(buildDatePath))
        return "(no config date found)";
    return fs.readFileSync(buildDatePath, 'utf8');
}

function getLastCommit() {
    debug('getLastCommit()');
    const commitPath = path.join(utils.getStaticDir(), 'last_commit');
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
    let tempString = "" + s;
    let foundVar = hasEnvVars(tempString);
    let iterCount = 0;
    while (foundVar) {
        iterCount++;
        if (iterCount > 10) {
            error('Detected recursive use of env variables.');
            error('Original string: ' + s);
            error('Current string : ' + tempString);
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
            const envRegExp = /\$\{([A-Za-z\_0-9]+)\}/g; // match ${VAR_NAME}
            const match = envRegExp.exec(tempString);
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
    for (let propName in someObject) {
        const propValue = someObject[propName];
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
    let configDir = utils.getStaticDir();
    let templatesDir = path.join(configDir, 'templates');
    debug(' - trying ' + templatesDir);
    let chatbotFile = path.join(templatesDir, 'chatbot.json');
    if (fs.existsSync(chatbotFile)) {
        debug('Templates dir (from config): ' + templatesDir);
        return templatesDir;
    }
    const rootConfigDir = utils.getInitialConfigDir();
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
        const templatesDir = resolveTemplatesDir();
        const chatbotFile = path.join(templatesDir, 'chatbot.json');
        utils._chatbotTemplates = require(chatbotFile);
    }
    return utils._chatbotTemplates;
};

utils.loadEmailTemplate = function (app, templateName) {
    const templatesDir = resolveTemplatesDir();
    const emailTemplatesDir = path.join(templatesDir, 'email');
    const templateFile = path.join(emailTemplatesDir, templateName + '.mustache');
    if (!fs.existsSync(templateFile))
        throw new Error('File not found: ' + templateFile);
    return fs.readFileSync(templateFile, 'utf8');
};

// ENCRYPTION/DECRYPTION

const ALGORITHM = 'aes-256-ctr';

function getCipher() {
    const key = getApp().get('aes_key').toString("binary");
    const cipher = crypto.createCipher(ALGORITHM, key);
    return cipher;
}

function getDecipher() {
    const key = getApp().get('aes_key').toString("binary");
    const decipher = crypto.createDecipher(ALGORITHM, key);
    return decipher;
}

utils.apiEncrypt = function (text) {
    const cipher = getCipher();
    // Add random bytes so that it looks different each time.
    let cipherText = cipher.update(utils.createRandomId() + text, 'utf8', 'hex');
    cipherText += cipher.final('hex');
    cipherText = '!' + cipherText;
    return cipherText;
};

utils.apiDecrypt = function (cipherText) {
    if (!cipherText.startsWith('!'))
        return cipherText;
    cipherText = cipherText.substring(1); // Strip '!'
    const decipher = getDecipher();
    let text = decipher.update(cipherText, 'hex', 'utf8');
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
                error(ex);
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

utils.getOffsetLimit = (req) => {
    const offset = req.query.offset ? req.query.offset : 0;
    const limit = req.query.limit ? req.query.limit : 0;
    return {
        offset,
        limit
    };
};

utils.getNoCountCache = (req) => {
    const no_cache = req.query.no_cache;
    if (no_cache && no_cache == '1')
        return true;
    return false;
};

utils.getFilter = (req) => {
    const filterString = req.query.filter;
    if (filterString && filterString.startsWith("{")) {
        try {
            const filter = JSON.parse(filterString);
            let invalidObject = false;
            for (let p in filter) {
                if (typeof(filter[p]) !== 'string')
                    invalidObject = true;
            }
            if (invalidObject) {
                warn(`Detected nested/invalid filter object, expected plain string properties: ${filterString}`);
            } else {
                return filter;
            }
        } catch (err) {
            warn(`Invalid filter string used: ${filterString}, expected valid JSON`);
        }
    }
    return {};
};

utils.getOrderBy = (req) => {
    let orderByInput = req.query.order_by;
    let orderBy = null;
    if (orderByInput) {
        const oList = orderByInput.split(' ');
        let invalidInput = false;
        if (oList.length === 2) {
            const field = oList[0];
            const direction = oList[1].toUpperCase();
            if (direction !== 'ASC' && direction !== 'DESC') {
                warn(`Invalid order_by request parameter, direction to be either ASC or DESC: "${orderByInput}"`);
            } else {
                orderBy = `${field} ${direction}`;
            }
        } else {
            warn(`Invalid order_by request parameter, expected '<field> <ASC|DESC>': "${orderByInput}"`);
        }
    }
    return orderBy;
};

// Middleware to verify a scope
utils.verifyScope = (requiredScope) => {
    return function (req, res, next) {
        if (requiredScope) {
            if (!req.scope || (req.scope && !req.scope[requiredScope])) {
                warn(`Rejecting call due to missing scope ${requiredScope}`);
                return res.status(403).json({ code: 403, message: `Forbidden, missing required scope '${requiredScope}'` });
            }
        }
        return next();
    };
};

// Inspection utility:
const REGEX_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
const REGEX_FUNCTION_PARAMS = /(?:\s*(?:function\s*[^(]*)?\s*)((?:[^'"]|(?:(?:(['"])(?:(?:.*?[^\\]\2)|\2))))*?)\s*(?=(?:=>)|{)/m;
const REGEX_PARAMETERS_VALUES = /\s*(\w+)\s*(?:=\s*((?:(?:(['"])(?:\3|(?:.*?[^\\]\3)))((\s*\+\s*)(?:(?:(['"])(?:\6|(?:.*?[^\\]\6)))|(?:[\w$]*)))*)|.*?))?\s*(?:,|$)/gm;

/**
 * Retrieve a function's parameter names and default values
 * Notes:
 *  - parameters with default values will not show up in transpiler code (Babel) because the parameter is removed from the function.
 *  - does NOT support inline arrow functions as default values
 *      to clarify: ( name = "string", add = defaultAddFunction )   - is ok
 *                  ( name = "string", add = ( a )=> a + 1 )        - is NOT ok
 *  - does NOT support default string value that are appended with a non-standard ( word characters or $ ) variable name
 *      to clarify: ( name = "string" + b )         - is ok
 *                  ( name = "string" + $b )        - is ok
 *                  ( name = "string" + b + "!" )   - is ok
 *                  ( name = "string" + λ )         - is NOT ok
 * @param {function} func
 * @returns {Array} - An array of the given function's parameter [key, default value] pairs.
 */
utils.getFunctionParams = (func) => {
    let functionAsString = func.toString();
    let params = [];
    let match;
    functionAsString = functionAsString.replace(REGEX_COMMENTS, '');
    functionAsString = functionAsString.match(REGEX_FUNCTION_PARAMS)[1];
    if (functionAsString.charAt(0) === '(') functionAsString = functionAsString.slice(1, -1);
    while (match = REGEX_PARAMETERS_VALUES.exec(functionAsString)) params.push([match[1], match[2]]); // jshint ignore:line
    return params;
};

utils.clone = (ob) => {
    return JSON.parse(JSON.stringify(ob));
};

// utils.getFunctionParams2 = (func) => {
//     return new RegExp(func.name + '\\s*\\((.*?)\\)').exec(func.toString().replace(/\n/g, ''))[1].replace(/\/\*.*?\*\//g, '').replace(/ /g, '');
// };

// utils.getFunctionParams = (func) => {  
//     return (func + '')
//       .replace(/[/][/].*$/mg,'') // strip single-line comments
//       .replace(/\s+/g, '') // strip white space
//       .replace(/[/][*][^/*]*[*][/]/g, '') // strip multi-line comments  
//       .split('){', 1)[0].replace(/^[^(]*[(]/, '') // extract the parameters  
//       .replace(/=[^,]+/g, '') // strip any ES6 defaults  
//       .split(',').filter(Boolean); // split & filter [""]
// };

module.exports = utils;
