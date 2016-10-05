'use strict';

var fs = require('fs');
var path = require('path');
var debug = require('debug')('portal-api:auth-servers');
var utils = require('./utils');

var authServers = require('express').Router();

// ===== ENDPOINTS =====

authServers.get('/:serverId', function (req, res, next) {
    authServers.getAuthServer(req.app, res, req.params.serverId);
});

// ===== IMPLEMENTATION =====

authServers._authServers = {};
authServers.getAuthServer = function (app, res, serverId) {
    debug('getAuthServer() ' + serverId);

    if (!authServers._authServers[serverId]) {
        const staticDir = utils.getStaticDir(app);
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
        return res.status(404).jsonp({ message: 'Not found.' });
    return res.json(authServer.data);
};

module.exports = authServers;