'use strict';

const debug = require('debug')('portal-api:versionizer');
const fs = require('fs');
const path = require('path');
const utils = require('./utils');

const versionizer = function () { };

versionizer._configHash = null;
versionizer.getConfigHash = function (req, res, next) {
    debug('getConfigHash()');
    res.send(versionizer.retrieveConfigHash(req.app));
};

versionizer.retrieveConfigHash = function (app) {
    if (null === versionizer._configHash) {
        const staticPath = utils.getStaticDir();
        const configTagFileName = path.join(staticPath, 'confighash');
        if (fs.existsSync(configTagFileName)) {
            versionizer._configHash = fs.readFileSync(configTagFileName, 'utf8');
        } else {
            versionizer._configHash = '0123456789abcdef0123456789abcdef';
        }
    }
    return versionizer._configHash;
};

versionizer.checkVersions = function (req, res, next) {
    debug('checkVersions()');
    // X-Config-Hash, User-Agent
    const configHash = req.get('x-config-hash');
    const userAgent = req.get('user-agent');
    if (configHash && !isConfigHashValid(req.app, configHash)) {
        debug('Invalid config hash: ' + configHash);
        return res.status(428).json({ message: 'Config Hash mismatch; restart client to retrieve new configuration' });
    }
    if (userAgent && !isUserAgentValid(userAgent)) {
        debug('Invalid user agent: ' + userAgent);
        return res.status(428).json({ message: 'Invalid client version; has to match API version (' + utils.getVersion() + ')' });
    }
    next();
};

function isConfigHashValid(app, configHash) {
    return (versionizer.retrieveConfigHash(app) === configHash);
}

function isUserAgentValid(userAgent) {
    const slashIndex = userAgent.indexOf('/');
    if (slashIndex < 0)
        return true;
    const agentString = userAgent.substring(0, slashIndex);
    const versionString = userAgent.substring(slashIndex + 1).trim();

    // Only check versions for wicked clients.
    if (!agentString.startsWith('wicked'))
        return true;

    return (versionString === utils.getVersion());
}

module.exports = versionizer;
