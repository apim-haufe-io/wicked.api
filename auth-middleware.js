var authMiddleware = function () {};
var { debug, info, warn, error } = require('portal-env').Logger('portal-api:auth-middleware');

// ===== MIDDLEWARE =====

authMiddleware.fillUserId = function (req, res, next) {
    // var kongCustomId = req.get('x-consumer-custom-id'); 
    // if (kongCustomId) {
    //     req.apiUserId = kongCustomId;
    //     req.kongRequest = true;
    //     return next();
    // }

    req.kongRequest = false;
    if (req.get('x-consumer-custom-id')) {
        req.kongRequest = true;
    }

    // This header cannot be injected _through_ Kong, but only from
    // inside the network, which is how the wicked SDK does it to
    // inject the user id for the machine users.
    const authenticatedUserId = req.get('x-authenticated-userid');
    if (authenticatedUserId)
        req.apiUserId = authenticatedUserId;

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
