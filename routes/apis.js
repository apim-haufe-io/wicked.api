'use strict';

var path = require('path');
var fs = require('fs');
var { debug, info, warn, error } = require('portal-env').Logger('portal-api:apis');
var yaml = require('js-yaml');
var request = require('request');
var mustache = require('mustache');

var utils = require('./utils');
var users = require('./users');

var apis = require('express').Router();

var dao = require('../dao/dao');
var daoUtils = require('../dao/dao-utils');

// ===== SCOPES =====

const READ = 'read_apis';
const READ_SUBS = 'read_subscriptions';
const READ_PLANS = 'read_plans';

const verifyScope = utils.verifyScope(READ);
const verifyPlansScope = utils.verifyScope(READ_PLANS);
const verifyReadSubsScope = utils.verifyScope(READ_SUBS);

// ===== ENDPOINTS =====

apis.get('/', verifyScope, function (req, res, next) {
    apis.getApis(req.app, res, req.apiUserId); //utils.loadApis(app);
});

apis.get('/desc', verifyScope, function (req, res, next) {
    apis.getDesc(req.app, res);
});

apis.get('/:apiId', verifyScope, function (req, res, next) {
    apis.getApi(req.app, res, req.apiUserId, req.params.apiId);
});

apis.get('/:apiId/config', verifyScope, function (req, res, next) {
    apis.getConfig(req.app, res, req.apiUserId, req.params.apiId);
});

apis.get('/:apiId/desc', verifyScope, function (req, res, next) {
    apis.getApiDesc(req.app, res, req.apiUserId, req.params.apiId);
});

apis.get('/:apiId/plans', verifyScope, verifyPlansScope, function (req, res, next) {
    apis.getApiPlans(req.app, res, req.apiUserId, req.params.apiId);
});

apis.get('/:apiId/swagger', verifyScope, function (req, res, next) {
    apis.getSwagger(req.app, res, req.apiUserId, req.params.apiId);
});

// Requires both read_apis and read_subscriptions scopes.
apis.get('/:apiId/subscriptions', verifyScope, verifyReadSubsScope, function (req, res, next) {
    const { offset, limit } = utils.getOffsetLimit(req);
    apis.getSubscriptions(req.app, res, req.apiUserId, req.params.apiId, offset, limit);
});

// ===== IMPLEMENTATION =====

apis.getApis = function (app, res, loggedInUserId) {
    debug('getApis()');
    var apiList = utils.loadApis(app);

    // Set defaults
    var userGroups = [];
    var isAdmin = false;

    if (loggedInUserId) {
        users.loadUser(app, loggedInUserId, (err, userInfo) => {
            if (!userInfo)
                return res.status(403).jsonp({ message: 'Not allowed. User unknown.' });
            isAdmin = daoUtils.isUserAdmin(userInfo);
            if (!isAdmin)
                userGroups = userInfo.groups;
            return res.json(filterApiList(isAdmin, userGroups, apiList));
        });
    } else {
        return res.json(filterApiList(isAdmin, userGroups, apiList));
    }
};

function filterApiList(isAdmin, userGroups, apiList) {
    if (isAdmin)
        return apiList;

    var groupDict = {};
    for (let i = 0; i < userGroups.length; ++i) {
        groupDict[userGroups[i]] = true;
    }

    var filteredApiList = [];

    for (let i = 0; i < apiList.apis.length; ++i) {
        var api = apiList.apis[i];

        var addApi = false;
        if (!api.requiredGroup || api.partner)
            addApi = true;
        else if (groupDict[api.requiredGroup])
            addApi = true;

        if (addApi)
            filteredApiList.push(api);
    }

    return { apis: filteredApiList };
}

apis.getDesc = function (app, res) {
    debug('getDesc()');
    var staticDir = utils.getStaticDir();
    var apisDir = path.join(staticDir, 'apis');
    var descFileName = path.join(apisDir, 'desc.md');

    if (!fs.existsSync(descFileName))
        return res.status(404).jsonp({ message: 'Not found.' });
    fs.readFile(descFileName, 'utf8', function (err, content) {
        if (!err) {
            res.setHeader('Content-Type', 'text/markdown');
            res.send(content);
        }
    });
};

apis.isValidApi = function (app, apiId) {
    debug('isValidApi()');
    var apiList = utils.loadApis(app);
    var apiIndex = -1;
    for (let i = 0; i < apiList.apis.length; ++i) {
        if (apiList.apis[i].id == apiId) {
            apiIndex = i;
            break;
        }
    }
    return (apiIndex >= 0);
};

apis.checkAccess = function (app, res, userId, apiId, callback) {
    debug('checkAccess(), userId: ' + userId + ', apiId: ' + apiId);
    if (!callback || typeof (callback) !== 'function')
        return callback(utils.makeError(500, 'checkAccess: callback is null or not a function'));
    var apiList = utils.loadApis(app);
    // Is it a valid API id?
    var apiIndex = -1;
    for (let i = 0; i < apiList.apis.length; ++i) {
        if (apiList.apis[i].id == apiId) {
            apiIndex = i;
            break;
        }
    }
    if (apiIndex < 0) {
        // Not, it's not.
        return callback(utils.makeError(404, 'Not found.'));
    }
    // Check for the user
    users.loadUser(app, userId, (err, userInfo) => {
        if (err)
            return callback(err);
        if (userId) {
            if (!userInfo) {
                return callback(utils.makeError(403, 'Not allowed. Invalid user.'));
            }
        }
        var selectedApi = apiList.apis[apiIndex];
        if (!selectedApi.requiredGroup || selectedApi.partner) // Public or Partner
            return callback(null, true);

        // If we didn't have a logged in user, we're out
        if (!userInfo) {
            return callback(utils.makeError(403, 'Not allowed. API is restricted.'));
        }

        for (let i = 0; i < userInfo.groups.length; ++i) {
            if (userInfo.groups[i] == selectedApi.requiredGroup)
                return callback(null, true);
        }

        // We're still here... Admin the last resort
        if (daoUtils.isUserAdmin(userInfo))
            return callback(null, true);

        // Nope. Not allowed.
        return callback(utils.makeError(403, 'Not allowed. Insufficient rights.'));
    });
};

apis.getApi = function (app, res, loggedInUserId, apiId) {
    debug('getApi(): ' + apiId);
    apis.checkAccess(app, res, loggedInUserId, apiId, (err) => {
        if (err)
            return utils.fail(res, 403, 'Access denied', err);
        var apiList = utils.loadApis(app);
        var apiIndex = apiList.apis.findIndex(a => a.id === apiId);
        res.json(apiList.apis[apiIndex]);
    });
};

apis.getApiPlans = function (app, res, loggedInUserId, apiId) {
    debug('getApiPlans(): ' + apiId);
    apis.checkAccess(app, res, loggedInUserId, apiId, (err) => {
        if (err)
            return utils.fail(res, 403, 'Access denied', err);
        var apiList = utils.loadApis(app);
        var apiIndex = apiList.apis.findIndex(a => a.id === apiId);
        if (apiIndex < 0)
            return res.status(404).jsonp({ message: 'API not found:' + apiId });
        var selectedApi = apiList.apis[apiIndex];
        var allPlans = utils.loadPlans(app);
        var planMap = {};
        for (var i = 0; i < allPlans.plans.length; ++i)
            planMap[allPlans.plans[i].id] = allPlans.plans[i];
        var apiPlans = [];
        users.loadUser(app, loggedInUserId, (err, userInfo) => {
            if (err)
                return utils.fail(res, 500, 'could not load user', err);
            if (userInfo) {
                for (let i = 0; i < selectedApi.plans.length; ++i) {
                    var plan = planMap[selectedApi.plans[i]];
                    if (!plan.requiredGroup ||
                        (plan.requiredGroup && users.hasUserGroup(app, userInfo, plan.requiredGroup)))
                        apiPlans.push(plan);
                }
                res.json(apiPlans);
            } else {
                // No plans when not logged in.
                res.json([]);
            }
        });
    });
};

function loadApiConfig(app, apiId) {
    debug('loadApiConfig()');
    var staticDir = utils.getStaticDir();
    var configFileName = path.join(staticDir, 'apis', apiId, 'config.json');
    // Default to empty but valid json.
    var configJson = {};
    if (fs.existsSync(configFileName))
        configJson = JSON.parse(fs.readFileSync(configFileName, 'utf8'));
    else {
        // Check if it's an internal API
        configFileName = path.join(__dirname, 'internal_apis', apiId, 'config.json');
        if (fs.existsSync(configFileName))
            configJson = JSON.parse(fs.readFileSync(configFileName, 'utf8'));
    }
    utils.replaceEnvVars(configJson);
    return configJson;
}

apis.getConfig = function (app, res, loggedInUserId, apiId) {
    debug('getConfig(): ' + apiId);
    // Do we know this API?
    if (!apis.isValidApi(app, apiId))
        return utils.fail(res, 404, 'Not found: ' + apiId);
    apis.checkAccess(app, res, loggedInUserId, apiId, (err) => {
        if (err)
            return utils.fail(res, 403, 'Access denied', err);
        var configJson = loadApiConfig(app, apiId);
        var configReturn = configJson;
        users.isUserIdAdmin(app, loggedInUserId, (err, isAdmin) => {
            // Restrict what we return in case it's a non-admin user,
            // only return the request path, not the backend URL.
            if (!isAdmin) {
                configReturn = {
                    api: {
                        uris: configJson.api.uris
                    }
                };
            }
            res.json(configReturn);

        });
    });
};

apis.getApiDesc = function (app, res, loggedInUserId, apiId) {
    debug('getApiDesc(): ' + apiId);
    apis.checkAccess(app, res, loggedInUserId, apiId, (err) => {
        if (err)
            return utils.fail(res, 403, 'Access denied', err);
        var staticDir = utils.getStaticDir();
        var descFileName = path.join(staticDir, 'apis', apiId, 'desc.md');
        res.setHeader('Content-Type', 'text/markdown');
        // Even if there is no desc.md, default to empty 200 OK
        if (!fs.existsSync(descFileName)) {
            // Check internal APIs.
            descFileName = path.join(__dirname, 'internal_apis', apiId, 'desc.md');
            if (!fs.existsSync(descFileName))
                return res.send('');
        }
        res.send(fs.readFileSync(descFileName, 'utf8'));
    });
};

function injectParameter(swaggerJson, newParameter) {
    debug('injectParameter()');
    // Only with JSON and Javascript...
    for (var apiPathName in swaggerJson.paths) {
        if (apiPathName == '/oauth2/token')
            continue;
        var apiPath = swaggerJson.paths[apiPathName];
        for (var opName in apiPath) {
            var op = apiPath[opName];
            if (op.parameters) {
                // Don't do it twice
                var foundHeader = false;
                for (var i = 0; i < op.parameters.length; ++i) {
                    if (op.parameters[i].name == newParameter.name)
                        foundHeader = true;
                }
                if (!foundHeader)
                    op.parameters.push(newParameter);
            }
            else
                op.parameters = [newParameter];
        }
    }
}

function injectTokenEndpoint(globalSettings, swaggerJson) {
    debug('injectTokenEndpoint()');
    var paths = swaggerJson.paths;
    if (paths['/oauth2/token'])
        return;
    var useTags = false;
    if (swaggerJson.tags) {
        var oauthTag = swaggerJson.tags.find(function (tag) { return tag.name == "oauth2"; });
        if (!oauthTag) {
            swaggerJson.tags.push({
                name: "oauth2",
                description: "Acquiring Access Tokens"
            });
        }
        useTags = true;
    }
    var oauthPath = {
        post: {
            summary: 'Get an Access token for the API',
            description: '',
            consumes: ['application/x-www-form-urlencoded'],
            produces: ['application/json'],
            parameters: [
                {
                    description: "The grant type, 'client_credentials'",
                    name: "grant_type",
                    in: "formData",
                    required: true,
                    type: "string"
                },
                {
                    description: "Your Client ID; this is displayed on the API page for your application.",
                    name: "client_id",
                    in: "formData",
                    required: true,
                    type: "string"
                },
                {
                    description: "Your Client Secret; this is displayed on the API page for your application.",
                    name: "client_secret",
                    in: "formData",
                    required: true,
                    type: "string"
                }
            ],
            responses: {
                "200": {
                    description: 'An access token'
                }
            }
        }
    };
    if (useTags)
        oauthPath.post.tags = ["oauth2"];
    if (globalSettings.network.schema != "https") {
        oauthPath.post.parameters.push({
            name: "x-forwarded-proto",
            in: "header",
            description: "Only present when testing locally over http (not https). Removing makes Kong reject this request.",
            required: false,
            type: "string"
        });
    }
    paths['/oauth2/token'] = oauthPath;
}

function lookupAuthMethod(globalSettings, apiId, authMethodRef) {
    debug(`lookupAuthMethodConfig(${authMethodRef})`);
    const split = authMethodRef.split(':');
    if (split.length !== 2) {
        error(`lookupAuthMethodConfig: Invalid auth method "${authMethodRef}", expected "<auth server id>:<method id>"`);
        return null;
    }
    const authServerName = split[0];
    const authMethodName = split[1];

    const authServers = utils.loadAuthServerMap();
    if (!authServers[authServerName]) {
        warn(`lookupAuthMethodConfig: Unknown auth server ${authServerName}`);
        return null;
    }
    const authServer = authServers[authServerName];

    const authMethodOrig = authServer.authMethods.find(am => am.name === authMethodName);
    if (!authMethodOrig) {
        warn(`lookupAuthMethodConfig: Unknown auth method name ${authMethodName} (${authMethodRef})`);
        return null;
    }

    if (!authMethodOrig.enabled) {
        warn(`lookupAuthMethodConfig: Auth method ${authMethodRef} is not enabled, skipping.`);
        return null;
    }

    const authMethod = utils.clone(authMethodOrig);
    const endpoints = [
        "authorizeEndpoint",
        "tokenEndpoint",
        "profileEndpoint"
    ];

    const apiUrl = globalSettings.network.schema + "://" + globalSettings.network.apiHost;
    // The loading of the authServers in 'www' ensures this is specified
    const authServerUrl = apiUrl + authServer.config.api.uris[0];

    for (let i = 0; i < endpoints.length; ++i) {
        const endpoint = endpoints[i];
        if (authMethod.config && authMethod.config[endpoint]) {
            authMethod.config[endpoint] = authServerUrl + mustache.render(authMethod.config[endpoint], { api: apiId, name: authMethodName });
        } else {
            warn(`Auth server ${authServer.name} does not have definition for endpoint ${endpoint}`);
        }
    }

    return authMethod;
}


// Looks like this:
// {
//     "<apiId>": {
//         "date": <date of read>,
//         "valid": true/false,
//         "swagger": <swagger JSON document>
//     }
// }    
const _swaggerMap = {};
function resolveSwagger(globalSettings, apiInfo, requestPath, fileName, callback) {
    debug('resolveSwagger(' + fileName + ')');
    const FIVE_MINUTES = 5 * 60 * 1000;
    if (_swaggerMap[apiInfo.id]) {
        const apiData = _swaggerMap[apiInfo.id];
        if ((new Date()) - apiData.date < FIVE_MINUTES) {
            // We'll return the cached data
            if (apiData.valid)
                return callback(null, apiData.swagger);
            // Invalid cached data
            return callback(new Error('Invalid swagger data for API ' + apiInfo.id));
        }
        // We'll refresh the data, fall past
    }

    function makeSwaggerUiScopes(apiInfo) {
        const scopeMap = {};
        if (apiInfo.settings && apiInfo.settings.scopes) {
            for (let s in apiInfo.settings.scopes) {
                const thisScope = apiInfo.settings.scopes[s];
                if (thisScope.description)
                    scopeMap[s] = thisScope.description;
                else
                    scopeMap[s] = s;
            }
        }
        return scopeMap;
    }

    function findSecurityProperties(swaggerJson) {
        const securityList = [];
        findSecurityPropertiesRecursive(swaggerJson, securityList);
        return securityList;
    }

    function findSecurityPropertiesRecursive(someProperty, securityList) {
        if (typeof someProperty === 'string' || typeof someProperty === 'number')
            return;
        if (Array.isArray(someProperty)) {
            for (let i = 0; i < someProperty.length; ++i) {
                findSecurityPropertiesRecursive(someProperty[i], securityList);
            }
        } else if (typeof someProperty === 'object') {
            for (let k in someProperty) {
                if (k === 'security')
                    securityList.push(someProperty[k]);
                else
                    findSecurityPropertiesRecursive(someProperty[k], securityList);
            }
        } else {
            debug(`Unknown typeof someProperty: ${typeof someProperty}`);
        }
    }

    function deleteEmptySecurityProperties(someProperty) {
        if (typeof someProperty === 'string' || typeof someProperty === 'number')
            return;
        if (Array.isArray(someProperty)) {
            for (let i = 0; i < someProperty.length; ++i) {
                deleteEmptySecurityProperties(someProperty[i]);
            }
        } else if (typeof someProperty === 'object') {
            for (let k in someProperty) {
                if (k === 'security') {
                    if (Array.isArray(someProperty[k])) {
                        if (someProperty[k].length === 0)
                            delete someProperty[k];
                    } else {
                        warn('deleteEmptySecurityProperties: Non-Array security property');
                    }
                } else {
                    deleteEmptySecurityProperties(someProperty[k]);
                }
            }
        } else {
            debug(`Unknown typeof someProperty: ${typeof someProperty}`);
        }
    }

    function injectOAuth2OpenAPI(swaggerJson, oflow, authMethod) {
        const securitySchemesParam = (swaggerJson.components.securitySchemes) ? swaggerJson.components.securitySchemes : {};
        const securityParam = (swaggerJson.security) ? swaggerJson.security : [];
        const securitySchemaName = `${authMethod.friendlyShort}, ${oflow}`;
        securitySchemesParam[securitySchemaName] = {
            type: "oauth2"
        };
        const mflows = {};
        mflows[oflow] = {
            authorizationUrl: authMethod.config.authorizeEndpoint,
            tokenUrl: authMethod.config.tokenEndpoint,
            scopes: makeSwaggerUiScopes(apiInfo)
        };
        securitySchemesParam[securitySchemaName].flows = mflows;
       
        // TODO: Scopes on specific endpoints
        const securityDef = {};
        securityDef[securitySchemaName] = [];
        securityParam.push(securityDef);
        swaggerJson.components.securitySchemes = securitySchemesParam;
        swaggerJson.security = securityParam; //apply globally
        console.log('ssssss'+JSON.stringify(swaggerJson.components));
    }

    function injectAuthAndReturnOpenAPI(swaggerJson) {
        if (!apiInfo.auth || apiInfo.auth == "key-auth") {
            const apikeyParam = [{ key: [] }];
            const securitySchemesParam = {
                key: {
                    type: "apiKey",
                    in: "header",
                    name: globalSettings.api.headerName
                }
            };
            // Delete all security properties; those are overridden by the global default
            const securityProperties = findSecurityProperties(swaggerJson);
            securityProperties.forEach(sp => sp.length = 0);
            deleteEmptySecurityProperties(swaggerJson);

            // Inject securitySchemes(Swagger 3.0)
            swaggerJson.components.securitySchemes = securitySchemesParam;
            swaggerJson.security = apikeyParam; // Apply globally
        } else if (apiInfo.auth == "oauth2") {
            // securitySchemesParam is specific for Swagger 3.0
            const origSecuritySchemesParam = utils.clone(swaggerJson.components.securitySchemes);
            // We will override the security definitions with our own ones
            swaggerJson.components.securitySchemes = {};

            const securityProperties = findSecurityProperties(swaggerJson);
            const origSecurityProperties = utils.clone(securityProperties);
            debug(securityProperties);
            // Reset all security properties
            securityProperties.forEach(sp => sp.length = 0);

            // Iterate over the authMethods
            if (!apiInfo.authMethods)
                return callback(new Error('API does not have an authMethods setting.'));

            for (let i = 0; i < apiInfo.authMethods.length; ++i) {
                const authMethod = lookupAuthMethod(globalSettings, apiInfo.id, apiInfo.authMethods[i]);
                if (!authMethod)
                    continue;
                const flows = [];
                if (apiInfo.settings.enable_authorization_code)
                    flows.push("authorizationCode");
                if (apiInfo.settings.enable_implicit_grant)
                    flows.push("implicit");
                if (apiInfo.settings.enable_password_grant)
                    flows.push("password");
                if (apiInfo.settings.enable_client_credentials)
                    flows.push("clientCredentials");

                for (let j = 0; j < flows.length; ++j) {
                    injectOAuth2OpenAPI(swaggerJson, flows[j], authMethod);
                    // TODO: Here we must add the scope for each individual security property
                }
            }

            deleteEmptySecurityProperties(swaggerJson);
            debug('Injecting OAuth2');
        }
        swaggerJson.host = globalSettings.network.apiHost;
        swaggerJson.basePath = requestPath;
        swaggerJson.schemes = [globalSettings.network.schema];

        // Cache it for a while
        _swaggerMap[apiInfo.id] = {
            date: new Date(),
            valid: true,
            swagger: swaggerJson
        };

        return callback(null, swaggerJson);
    }

    function injectOAuth2(swaggerJson, oflow, authMethod) {
        const securityDefinitionsParam = (swaggerJson.securityDefinitions) ? swaggerJson.securityDefinitions : {};
        const securityParam = (swaggerJson.security) ? swaggerJson.security : [];
        const securitySchemaName = `${authMethod.friendlyShort}, ${oflow}`;
        securityDefinitionsParam[securitySchemaName] = {
            type: "oauth2",
            flow: oflow,
            authorizationUrl: authMethod.config.authorizeEndpoint,
            tokenUrl: authMethod.config.tokenEndpoint,
            scopes: makeSwaggerUiScopes(apiInfo)
        };

        // TODO: Scopes on specific endpoints
        const securityDef = {};
        securityDef[securitySchemaName] = [];
        securityParam.push(securityDef);
        swaggerJson.securityDefinitions = securityDefinitionsParam;
        swaggerJson.security = securityParam; //apply globally
    }

    function injectAuthAndReturn(swaggerJson) {
        if (!apiInfo.auth || apiInfo.auth == "key-auth") {
            const apikeyParam = [{ key: [] }];
            const securityDefinitionParam = {
                key: {
                    type: "apiKey",
                    in: "header",
                    name: globalSettings.api.headerName
                }
            };
            // Delete all security properties; those are overridden by the global default
            const securityProperties = findSecurityProperties(swaggerJson);
            securityProperties.forEach(sp => sp.length = 0);
            deleteEmptySecurityProperties(swaggerJson);

            // Inject securityDefinitions (Swagger 2.0)
            swaggerJson.securityDefinitions = securityDefinitionParam;
            swaggerJson.security = apikeyParam; // Apply globally
        } else if (apiInfo.auth == "oauth2") {
            // securityDefinitions is specific for Swagger 2.0
            const origSecurityDefinitions = utils.clone(swaggerJson.securityDefinitions);
            // We will override the security definitions with our own ones
            swaggerJson.securityDefinitions = {};

            const securityProperties = findSecurityProperties(swaggerJson);
            const origSecurityProperties = utils.clone(securityProperties);
            debug(securityProperties);
            // Reset all security properties
            securityProperties.forEach(sp => sp.length = 0);

            // Iterate over the authMethods
            if (!apiInfo.authMethods)
                return callback(new Error('API does not have an authMethods setting.'));

            for (let i = 0; i < apiInfo.authMethods.length; ++i) {
                const authMethod = lookupAuthMethod(globalSettings, apiInfo.id, apiInfo.authMethods[i]);
                if (!authMethod)
                    continue;
                const flows = [];
                if (apiInfo.settings.enable_authorization_code)
                    flows.push("accessCode");
                if (apiInfo.settings.enable_implicit_grant)
                    flows.push("implicit");
                if (apiInfo.settings.enable_password_grant)
                    flows.push("password");
                if (apiInfo.settings.enable_client_credentials)
                    flows.push("application");

                for (let j = 0; j < flows.length; ++j) {
                    injectOAuth2(swaggerJson, flows[j], authMethod);

                    // TODO: Here we must add the scope for each individual security property
                }
            }

            deleteEmptySecurityProperties(swaggerJson);
            debug('Injecting OAuth2');
        }
        swaggerJson.host = globalSettings.network.apiHost;
        swaggerJson.basePath = requestPath;
        swaggerJson.schemes = [globalSettings.network.schema];

        // Cache it for a while
        _swaggerMap[apiInfo.id] = {
            date: new Date(),
            valid: true,
            swagger: swaggerJson
        };

        return callback(null, swaggerJson);
    }

    try {
        const swaggerText = fs.readFileSync(fileName, 'utf8');
        const rawSwagger = JSON.parse(swaggerText);
        if (rawSwagger.swagger) { // version, e.g. "2.0"
            return injectAuthAndReturn(rawSwagger);
        } else if (rawSwagger.openapi) { //version "3.0"
             return injectAuthAndReturnOpenAPI(rawSwagger);
        } else if (rawSwagger.href) {
            // We have a href property inside the Swagger, we will try to retrieve it
            // from an URL here.
            utils.replaceEnvVars(rawSwagger);
            // We must be able to just get this thing
            request.get({
                url: rawSwagger.href
            }, (err, apiRes, apiBody) => {
                if (err)
                    return callback(err);
                try {
                    const rawSwaggerRemote = utils.getJson(apiBody);
                    return injectAuthAndReturn(rawSwaggerRemote);
                } catch (err) {
                    return callback(new Error('Could not parse remote Swagger from ' + rawSwagger.href));
                }
            });
        } else {
            // Bad case.
            throw new Error('The swagger file does neither contain a "swagger" nor a "href" property: ' + fileName);
        }
    } catch (err) {
        // Cache failure for five minutes
        _swaggerMap[apiInfo.id] = {
            date: new Date(),
            valid: false
        };
        return callback(err);
    }
}

apis.getSwagger = function (app, res, loggedInUserId, apiId) {
    debug('getSwagger(): ' + apiId);
    // if (apiId == '_portal')
    //     return getPortalSwagger(app, res);
    apis.checkAccess(app, res, loggedInUserId, apiId, (err) => {
        if (err)
            return utils.fail(res, 403, 'Access denied', err);
        var staticDir = utils.getStaticDir();
        var swaggerFileName = path.join(staticDir, 'apis', apiId, 'swagger.json');
        if (!fs.existsSync(swaggerFileName)) {
            // Check internal APIs
            swaggerFileName = path.join(__dirname, 'internal_apis', apiId, 'swagger.json');
            if (!fs.existsSync(swaggerFileName))
                return res.status(404).jsonp({ message: 'Not found. This is a bad sign; the Swagger definition must be there!' });
        }

        var globalSettings = utils.loadGlobals(app);
        var configJson = loadApiConfig(app, apiId);

        if (!configJson || !configJson.api || !configJson.api.uris || !configJson.api.uris.length)
            return res.status(500).jsonp({ message: 'Invalid API configuration; does not contain uris array.' });
        var requestPath = configJson.api.uris[0];

        var apiList = utils.loadApis(app);
        var apiInfo = apiList.apis.find(function (anApi) { return anApi.id == apiId; });

        // Read it, we want to do stuff with it.
        // resolveSwagger might read directly from the swagger file, or, if the
        // swagger JSON contains a href property, get it from a remote location.
        resolveSwagger(globalSettings, apiInfo, requestPath, swaggerFileName, (err, swaggerJson) => {
            if (err) {
                error(err);
                return res.status(500).json({
                    message: 'Could not resolve the Swagger JSON file, an error occurred.',
                    error: err
                });
            }
            return res.json(swaggerJson);
        });
    });
};

apis.getSubscriptions = function (app, res, loggedInUserId, apiId, offset, limit) {
    debug('getSubscriptions() ' + apiId);
    users.loadUser(app, loggedInUserId, (err, userInfo) => {
        if (err)
            return utils.fail(res, 500, 'getSubscriptions: Could not load user', err);
        if (!userInfo ||
            !userInfo.admin) {
            return utils.fail(res, 403, 'Not Allowed. Only Admins can get subscriptions for an API.');
        }
        dao.subscriptions.getByApi(apiId, offset, limit, (err, apiSubs, countResult) => {
            if (err)
                return utils.fail(res, 500, 'api.getSubscriptions: DAO failed to get subscriptions per API', err);
            if (apiSubs) {
                return res.json({
                    items: apiSubs,
                    count: countResult.count,
                    count_cached: countResult.cached,
                    offset: offset,
                    limit: limit
                });
            }
            utils.fail(res, 404, 'Not Found.');
        });
    });
};

module.exports = apis;
