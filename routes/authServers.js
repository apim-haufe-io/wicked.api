'use strict';

const fs = require('fs');
const path = require('path');
const { debug, info, warn, error } = require('portal-env').Logger('portal-api:auth-servers');
const utils = require('./utils');
const users = require('./users');

const authServers = require('express').Router();

// ===== SCOPES =====

const READ = 'read_auth_servers';

const verifyScope = utils.verifyScope(READ);

// ===== ENDPOINTS =====

authServers.get('/', verifyScope, function (req, res, next) {
    authServers.getAuthServers(req.app, res);
});

authServers.get('/:serverId', verifyScope, function (req, res, next) {
    authServers.getAuthServer(req.app, res, req.apiUserId, req.params.serverId);
});

// ===== IMPLEMENTATION =====

authServers._authServerNames = null;
authServers.getAuthServers = function (app, res) {
    debug('getAuthServers()');
    if (!authServers._authServerNames) {
        try {
            const staticDir = utils.getStaticDir();
            const authServerDir = path.join(staticDir, 'auth-servers');
            debug('Checking directory ' + authServerDir + ' for auth servers.');
            if (!fs.existsSync(authServerDir)) {
                debug('No auth servers defined.');
                authServers._authServerNames = [];
            } else {
                const fileNames = fs.readdirSync(authServerDir);
                const serverNames = [];
                for (let i = 0; i < fileNames.length; ++i) {
                    const fileName = fileNames[i];
                    if (fileName.endsWith('.json')) {
                        const authServerName = fileName.substring(0, fileName.length - 5);
                        debug('Found auth server ' + authServerName);
                        serverNames.push(authServerName); // strip .json
                    }
                }
                authServers._authServerNames = serverNames;
            }
        } catch (ex) {
            error('getAuthServers threw an exception:');
            error(ex);
            error(ex.stack);
            return res.status(500).json({ message: ex.message });
        }
    }
    res.json(authServers._authServerNames);
};

const checkEndpoint = (authServerId, authMethodId, config, endpointName, defaultValue) => {
    if (!config.hasOwnProperty(endpointName)) {
        config[endpointName] = defaultValue;
    } else {
        warn(`appendAuthMethodEndpoints(${authServerId}): Auth method ${authMethodId} has a specified ${endpointName} endpoint; consider using the default. Defined: ${config[endpointName]}, default: ${defaultValue}`);
    }
};

const appendAuthMethodEndpoints = (authServer) => {
    debug('appendAuthMethodEndpoints()');
    if (!authServer.authMethods ||
        !Array.isArray(authServer.authMethods)) {
        warn(`appendAuthMethodEndpoints(${authServer.id}): There are no authMethods defined, or it is not an array.`);
        return;
    }

    const authServerId = authServer.id;
    for (let i = 0; i < authServer.authMethods.length; ++i) {
        const authMethod = authServer.authMethods[i];
        const authMethodId = authMethod.name;

        let config = authMethod.config;
        if (!config) {
            warn(`appendAuthMethodEndpoints(${authServerId}): Auth method ${authMethodId} does not have a config property; creating a default one.`);
            config = {};
            authMethod.config = config;
        }

        checkEndpoint(authServerId, authMethodId, config, 'authorizeEndpoint', '/{{name}}/api/{{api}}/authorize');
        checkEndpoint(authServerId, authMethodId, config, 'tokenEndpoint', '/{{name}}/api/{{api}}/token');
        checkEndpoint(authServerId, authMethodId, config, 'profileEndpoint', '/profile');
        checkEndpoint(authServerId, authMethodId, config, 'verifyEmailEndpoint', '/{{name}}/verifyemail');
        checkEndpoint(authServerId, authMethodId, config, 'grantsEndpoint', '/{{name}}/grants');
    }
};

authServers._authServers = {};
authServers.getAuthServer = function (app, res, loggedInUserId, serverId) {
    debug(`getAuthServer(${serverId})`);

    if (!authServers._authServers[serverId]) {
        const staticDir = utils.getStaticDir();
        const authServerFileName = path.join(staticDir, 'auth-servers', serverId + '.json');

        if (!fs.existsSync(authServerFileName)) {
            debug('Unknown auth-server: ' + serverId);
            authServers._authServers[serverId] = {
                name: serverId,
                exists: false
            };
        } else {
            const data = JSON.parse(fs.readFileSync(authServerFileName, 'utf8'));
            utils.replaceEnvVars(data);
            // Name and id of the Auth Server is used to identify the generated
            // API within the Kong Adapter; if those are missing, add them automatically
            // to the answer.
            if (!data.name)
                data.name = serverId;
            if (!data.id)
                data.id = serverId;

            // Check a couple of standard end points for the auth methods
            appendAuthMethodEndpoints(data);

            debug('Found auth server "' + serverId + '"');
            debug(data);
            authServers._authServers[serverId] = {
                name: serverId,
                exists: true,
                data: data
            };
        }
    }

    const authServer = utils.clone(authServers._authServers[serverId]);

    if (!authServer.exists)
        return utils.fail(res, 404, 'Not found.');

    debug(`getAuthServer(${serverId}), logged in User: ${loggedInUserId}`);
    users.isUserIdAdmin(app, loggedInUserId, (err, isAdmin) => {
        if (!isAdmin) {
            debug(`getAuthServer(${serverId}), logged in User is not ADMIN`);
            // Restrict what we return in case it's a non-admin user (or no user),
            // only return the request path (uris), not the backend URL or any other
            // type of information (like used plugins).
            const tempConfig = authServer.data.config;
            if (tempConfig && tempConfig.api && tempConfig.api.uris) {
                authServer.data.config = {
                    api: {
                        uris: tempConfig.api.uris
                    }
                };
            } else {
                authServer.data.config = {};
            }
        } else {
            debug(`getAuthServer(${serverId}), logged in User is ADMIN, returning all data`);
        }

        return res.json(authServer.data);
    });
};

module.exports = authServers;