var authMiddleware = function () {};
var debug = require('debug')('portal-api:auth-middleware');

// ===== MIDDLEWARE =====

authMiddleware.fillUserId = function (req, res, next) {
    var kongCustomId = req.get('x-consumer-custom-id'); 
    if (kongCustomId) {
        req.apiUserId = kongCustomId;
        req.kongRequest = true;
        return next();
    }
    req.kongRequest = false;
    req.apiUserId = req.get('x-userid');
    return next();
};

authMiddleware.rejectFromKong = function (req, res, next) {
    if (req.kongRequest) {
        res.status(403).json({ message: 'Not allowed from outside network.' });
        return;
    }
    return next();
};

authMiddleware.verifyConfigKey = function (req, res, next) {
    debug('verifyConfigKey()');
    var configKey = req.get('Authorization');
    if (!configKey)
        return res.status(403).json({ message: 'Not allowed. Unauthorized.'} );
    configKey = configKey.trim();
    var deployConfigKey = req.app.get('config_key').trim();
    if (configKey != deployConfigKey)
        return res.status(403).json({ message: 'Not allowed. Unauthorized.'} );
    // We're okay, let's do this.
    next();
};

module.exports = authMiddleware;
