var kongAuth = function () {};

// ===== MIDDLEWARE =====

kongAuth.fillUserId = function (req, res, next) {
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

kongAuth.rejectFromKong = function (req, res, next) {
    if (req.kongRequest) {
        res.status(403).json({ message: 'Not allowed from outside network.' });
        return;
    }
    return next();
};

module.exports = kongAuth;