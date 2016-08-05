'use strict';

var path = require('path');
var fs = require('fs');
var debug = require('debug')('portal-api:templates');

var utils = require('./utils');

var templates = require('express').Router();

// ===== ENDPOINTS =====

templates.get('/chatbot', function (req, res, next) {
    templates.getChatbotTemplates(req.app, res);
});

templates.get('/email/:templateId', function (req, res, next) {
    templates.getEmailTemplate(req.app, res, req.params.templateId, next);
});

// ===== IMPLEMENTATION =====

templates.getChatbotTemplates = function (app, res) {
    var chatbotTemplates = utils.loadChatbotTemplates(app);
    res.json(chatbotTemplates);
};

templates.getEmailTemplate = function (app, res, templateName, next) {
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