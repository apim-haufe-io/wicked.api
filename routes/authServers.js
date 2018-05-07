'use strict';

var fs = require('fs');
var path = require('path');
var { debug, info, warn, error } = require('portal-env').Logger('portal-api:auth-servers');
var utils = require('./utils');
var users = require('./users');

var authServers = require('express').Router();

// ===== ENDPOINTS =====

authServers.get('/', function (req, res, next) {
    authServers.getAuthServers(req.app, res);
});

authServers.get('/:serverId', function (req, res, next) {
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

authServers._authServers = {};
authServers.getAuthServer = function (app, res, loggedInUserId, serverId) {
    debug('getAuthServer() ' + serverId);

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
            debug('Found auth server "' + serverId + '"');
            debug(data);
            authServers._authServers[serverId] = {
                name: serverId,
                exists: true,
                data: data
            };
        }
    }

    const authServer = authServers._authServers[serverId];

    if (!authServer.exists)
        return utils.fail(res, 404, 'Not found.');

    users.isUserIdAdmin(app, loggedInUserId, (err, isAdmin) => {
        if (!isAdmin) {
            // Restrict what we return in case it's a non-admin user (or no user),
            // only return the request path, not the backend URL or any other
            // type of information (like used plugins).
            var tempConfig = authServer.config;
            if (tempConfig && tempConfig.api) {
                authServer.config = {
                    api: {
                        request_path: tempConfig.api.request_path
                    }
                };
            }
        }

        return res.json(authServer.data);
    });
};

module.exports = authServers;