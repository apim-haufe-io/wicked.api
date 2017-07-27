'use strict';

var path = require('path');
var fs = require('fs');
var debug = require('debug')('portal-api:templates');

var utils = require('./utils');
var users = require('./users');

var templates = require('express').Router();

// ===== ENDPOINTS =====

templates.get('/chatbot', function (req, res, next) {
    templates.getChatbotTemplates(req.app, res, req.apiUserId);
});

templates.get('/email/:templateId', function (req, res, next) {
    templates.getEmailTemplate(req.app, res, req.apiUserId, req.params.templateId, next);
});

// ===== IMPLEMENTATION =====

templates.getChatbotTemplates = function (app, res, loggedInUserId) {
    if (!users.isAdminUserId(app, loggedInUserId))
        return res.status(403).jsonp({ message: 'Not allowed. Only admins can do this.' });
    var chatbotTemplates = utils.loadChatbotTemplates(app);
    res.json(chatbotTemplates);
};

templates.getEmailTemplate = function (app, res, loggedInUserId, templateName, next) {
    if (!users.isAdminUserId(app, loggedInUserId))
        return res.status(403).jsonp({ message: 'Not allowed. Only admins can do this.' });
    try {
        var emailTemplate = utils.loadEmailTemplate(app, templateName);
        res.setHeader('Content-Type', 'text/plain');
        res.send(emailTemplate);
    } catch (err) {
        err.status = 404;
        return next(err);
    }
};

module.exports = templates;
