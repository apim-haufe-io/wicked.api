'use strict';

var fs = require('fs');
var path = require('path');
var request = require('request');
var utils = require('./utils');
var async = require('async');
var debug = require('debug')('portal-api:webhooks');

var webhooks = require('express').Router();
webhooks.setup = function (users) {
    webhooks._usersModule = users;
};

// ===== ENDPOINTS =====

webhooks.put('/listeners/:listenerId', function (req, res, next) {
    webhooks.putListener(req.app, res, webhooks._usersModule, req.apiUserId, req.params.listenerId, req.body);
});

webhooks.delete('/listeners/:listenerId', function (req, res, next) {
    webhooks.deleteListener(req.app, res, webhooks._usersModule, req.apiUserId, req.params.listenerId);
});

webhooks.get('/listeners', function (req, res, next) {
    webhooks.getListeners(req.app, res, webhooks._usersModule, req.apiUserId);
});

webhooks.get('/events/:listenerId', function (req, res, next) {
    webhooks.getEvents(req.app, res, webhooks._usersModule, req.apiUserId, req.params.listenerId);
});

webhooks.delete('/events/:listenerId', function (req, res, next) {
    webhooks.flushEvents(req.app, res, webhooks._usersModule, req.apiUserId, req.params.listenerId);
});

webhooks.delete('/events/:listenerId/:eventId', function (req, res, next) {
    webhooks.deleteEvent(req.app, res, webhooks._usersModule, req.apiUserId, req.params.listenerId, req.params.eventId);
});

// ===== CONSTANTS =====

webhooks.ACTION_ADD = 'add';
webhooks.ACTION_UPDATE = 'update';
webhooks.ACTION_DELETE = 'delete';
webhooks.ACTION_PASSWORD = 'password';
webhooks.ACTION_VALIDATED = 'validated';
webhooks.ACTION_LOGIN = 'login';
// used for import and export
webhooks.ACTION_FAILED = 'failed';
webhooks.ACTION_DONE = 'done';

webhooks.ENTITY_APPLICATION = 'application';
webhooks.ENTITY_USER = 'user';
webhooks.ENTITY_SUBSCRIPTION = 'subscription';
webhooks.ENTITY_APPROVAL = 'approval';
webhooks.ENTITY_OWNER = 'owner';
webhooks.ENTITY_VERIFICATION = 'verification';
webhooks.ENTITY_VERIFICATION_LOSTPASSWORD = 'verification_lostpassword';
webhooks.ENTITY_VERIFICATION_EMAIL = 'verification_email';
// for deploy.js
webhooks.ENTITY_EXPORT = 'export';
webhooks.ENTITY_IMPORT = 'import';

// ===== IMPLEMENTATION =====

// ===== Temporary disable hooks =====

webhooks._disableAllHooks = false;

webhooks.disableAllHooks = function () {
    webhooks._disableAllHooks = true;
};

webhooks.enableAllHooks = function () {
    webhooks._disableAllHooks = false;
};

webhooks.areHooksEnabled = function () {
    return !webhooks._disableAllHooks;
};

// ===== PERSISTENCE =====

webhooks._listeners = null;
webhooks.loadListeners = function (app) {
    debug('loadListeners()');
    if (!webhooks._listeners) {
        var webhooksDir = path.join(utils.getDynamicDir(app), 'webhooks');
        var listenersFile = path.join(webhooksDir, utils.LISTENER_FILE);
        if (!fs.existsSync(listenersFile))
            webhooks._listeners = [];
        else
            webhooks._listeners = JSON.parse(fs.readFileSync(listenersFile, 'utf8'));
    }
    return webhooks._listeners;
};

webhooks.saveListeners = function (app, listenerInfos) {
    debug('saveListeners()');
    debug(listenerInfos);
    var webhooksDir = path.join(utils.getDynamicDir(app), 'webhooks');
    var listenersFile = path.join(webhooksDir, utils.LISTENER_FILE);
    fs.writeFileSync(listenersFile, JSON.stringify(listenerInfos, null, 2), 'utf8');
    // Invalidate listeners.
    webhooks._listeners = null;
};

webhooks.loadEvents = function (app, listenerId) {
    debug('loadEvents(): ' + listenerId);
    var webhooksDir = path.join(utils.getDynamicDir(app), 'webhooks');
    var eventsFile = path.join(webhooksDir, listenerId + '.json');
    if (!fs.existsSync(eventsFile))
        return [];
    return JSON.parse(fs.readFileSync(eventsFile, 'utf8'));
};

webhooks.saveEvents = function (app, listenerId, eventList) {
    debug('saveEvents(): ' + listenerId);
    var webhooksDir = path.join(utils.getDynamicDir(app), 'webhooks');
    var eventsFile = path.join(webhooksDir, listenerId + '.json');
    fs.writeFileSync(eventsFile, JSON.stringify(eventList, null, 2), 'utf8');
};

// ===== UTILITIES =====

webhooks.pendingEventsCount = function (app) {
    var listeners = webhooks.loadListeners(app);
    var eventCount = 0;
    for (var i=0; i < listeners.length; ++i) {
        var events = webhooks.loadEvents(app, listeners[i].id);
        eventCount = eventCount + events.length;
    }
    debug('pendingEventsCount() == ' + eventCount);
    return eventCount;
};

webhooks.lockAll = function (app) {
    debug('lockAll()');

    if (utils.hasGlobalLock(app))
        return false;
    var lockList = [];
    var listenerList = webhooks.loadListeners(app);
    var success = true;
    var internalError = null;
    try {
        for (let i = 0; i < listenerList.length; ++i) {
            var listenerId = listenerList[i].id;
            if (!utils.lockEvents(app, listenerId)) {
                success = false;
                break;
            }
            lockList.push(listenerId);
        }
    } catch (err) {
        internalError = err;
        success = false;
    }
    if (!success) {
        for (let i = 0; i < lockList.length; ++i) {
            try { utils.unlockEvents(app, lockList[i]); } catch (err2) { debug(err2); console.error(err2); }
        }
    }
    if (internalError)
        throw internalError;

    return success;
};

webhooks.unlockAll = function (app) {
    debug('unlockAll()');
    var listenerList = webhooks.loadListeners(app);
    for (var i = 0; i < listenerList.length; ++i) {
        try { utils.unlockEvents(app, listenerList[i].id); } catch (err) { debug(err); console.error('webhooks.unlockAll: ' + err); }
    }
};

// ===== INTERNAL =====

function retryLog(app, triesLeft, eventData, callback) {
    debug('retryLog(), triesLeft: ' + triesLeft);
    debug(eventData);
    var lockedAll = false;
    var err = null;
    try {
        if (!webhooks.lockAll(app)) {
            err = new Error('webhooks.retryLog - lockAll failed.');
            err.status = 423;
        }
        if (!err) {
            lockedAll = true;

            var listenerList = webhooks.loadListeners(app);

            for (var i = 0; i < listenerList.length; ++i) {
                try {
                    var listenerId = listenerList[i].id;
                    var events = webhooks.loadEvents(app, listenerId);
                    events.push(eventData);
                    webhooks.saveEvents(app, listenerId, events);
                } catch (internalErr) {
                    debug(internalErr);
                    console.error('webhooks.logEvent: ' + internalErr);
                    err = internalErr;
                }
            }
        }
    } finally {
        if (lockedAll)
            webhooks.unlockAll(app);
    }
    if (err) {
        // Retries left?
        if (triesLeft > 0) {
            // Call ourselves again in around 100 milliseconds. Note the currying
            // of the arguments of setTimeout, which are passed into retryLog.
            setTimeout(retryLog, 100, app, triesLeft - 1, eventData, callback);
        } else {
            callback(err);
        }
    } else {
        // Woo hoo.
        callback(null);
    }
}

webhooks.logEvent = function (app, eventData, callback) {
    debug('logEvent()');
    debug(eventData);
    if (!eventData.action)
        throw new Error("Webhook event data must contain 'action'.");
    if (!eventData.entity)
        throw new Error("Webhook event data must contain 'entity'.");

    if (webhooks._disableAllHooks) {
        if (callback)
            return callback(new Error('Webhooks are currently disabled; logEvent did not do anything.'));
        return;
    }

    var listeners = webhooks.loadListeners(app);
    if (listeners.length === 0) {
        debug('logEvent() - Skipping, no listeners defined.');
        if (callback)
            process.nextTick(callback);
        return;
    }

    eventData.id = utils.createRandomId();
    eventData.utc = utils.getUtc();

    // This will immediately return
    // The arguments after the "0" will be passed as arguments to
    // webhooks.retryLog. You have to know this from the documentation
    // of setTimeout.
    setTimeout(retryLog, 0, app, 5, eventData, function (err) {
        debug('retryLog() called back');
        // We have no results, we just want to check for errors
        if (err) {
            debug(err);
            console.error(err);
        }

        if (callback)
            return callback(err);
    });
};

webhooks.getIndex = function (infos, id) {
    var index = -1;
    for (var i = 0; i < infos.length; ++i) {
        if (id == infos[i].id) {
            index = i;
            break;
        }
    }
    return index;
};

webhooks.getListener = function (app, listenerId) {
    debug('getListener(): ' + listenerId);
    var listenerInfos = webhooks.loadListeners(app);
    var index = webhooks.getIndex(listenerInfos, listenerId);
    if (index < 0)
        return null;
    return listenerInfos[index];
};

// ===== OPERATIONS =====

webhooks.putListener = function (app, res, users, loggedInUserId, listenerId, body) {
    debug('putListener(): ' + listenerId);
    debug(body);
    var userInfo = users.loadUser(app, loggedInUserId);
    if (!userInfo ||
        !userInfo.admin)
        return res.status(403).jsonp({ message: 'Not allowed. Only Admins may do this.' });
    // Validate listenerId
    var regex = /^[a-zA-Z0-9\-_]+$/;

    if (!regex.test(listenerId))
        return res.status(400).jsonp({ message: 'Invalid webhook listener ID, allowed chars are: a-z, A-Z, -, _' });
    if (listenerId.length < 4 || listenerId.length > 20)
        return res.status(400).jsonp({ message: 'Invalid webhook listener ID, must have at least 4, max 20 characters.' });

    if (body.id != listenerId)
        return res.status(400).jsonp({ message: 'Listener ID in path must be the same as id in body.' });
    if (!body.url)
        return res.status(400).jsonp({ message: 'Mandatory body property "url" is missing.' });

    utils.withLockedListeners(app, res, listenerId, function () {
        var listenerInfos = webhooks.loadListeners(app);

        var upsertListener = {
            id: listenerId,
            url: body.url
        };

        var index = webhooks.getIndex(listenerInfos, listenerId);
        if (index < 0) {
            listenerInfos.push(upsertListener);
            // Initialize to empty list
            webhooks.saveEvents(app, listenerId, []);
        } else {
            listenerInfos[index] = upsertListener;
        }

        webhooks.saveListeners(app, listenerInfos);

        res.json(upsertListener);
    });
};

webhooks.deleteListener = function (app, res, users, loggedInUserId, listenerId) {
    debug('deleteListener(): ' + listenerId);
    var userInfo = users.loadUser(app, loggedInUserId);
    if (!userInfo ||
        !userInfo.admin)
        return res.status(403).jsonp({ message: 'Not allowed. Only Admins may do this.' });
    utils.withLockedListeners(app, res, listenerId, function () {
        var listenerInfos = webhooks.loadListeners(app);
        var index = webhooks.getIndex(listenerInfos, listenerId);
        if (index < 0)
            return res.status(404).jsonp({ message: 'Listener not found: ' + listenerId });

        listenerInfos.splice(index, 1);

        webhooks.saveListeners(app, listenerInfos);

        res.status(204).send('');
    });
};

webhooks.getListeners = function (app, res, users, loggedInUserId) {
    debug('getListeners()');
    var userInfo = users.loadUser(app, loggedInUserId);
    if (!userInfo ||
        !userInfo.admin)
        return res.status(403).jsonp({ message: 'Not allowed. Only Admins may do this.' });
    var listenerInfos = webhooks.loadListeners(app);
    res.json(listenerInfos);
};

webhooks.getEvents = function (app, res, users, loggedInUserId, listenerId) {
    debug('getEvents(): ' + listenerId);
    var userInfo = users.loadUser(app, loggedInUserId);
    if (!userInfo ||
        !userInfo.admin)
        return res.status(403).jsonp({ message: 'Not allowed. Only Admins may do this.' });
    var listener = webhooks.getListener(app, listenerId);
    if (!listener)
        return res.status(404).jsonp({ message: 'Listener not found: ' + listenerId });
    var events = webhooks.loadEvents(app, listenerId);
    res.json(events);
};

webhooks.flushEvents = function (app, res, users, loggedInUserId, listenerId) {
    debug('flushEvents(): ' + listenerId);
    var userInfo = users.loadUser(app, loggedInUserId);
    if (!userInfo ||
        !userInfo.admin)
        return res.status(403).jsonp({ message: 'Not allowed. Only Admins may do this.' });

    var listener = webhooks.getListener(app, listenerId);
    if (!listener)
        return res.status(404).jsonp({ message: 'Listener not found: ' + listenerId });

    utils.withLockedEvents(app, res, listenerId, function () {
        // Write empty event list
        webhooks.saveEvents(app, listenerId, []);

        res.status(204).send('');
    });
};

webhooks.deleteEvent = function (app, res, users, loggedInUserId, listenerId, eventId) {
    debug('deleteEvent(): ' + listenerId + ', eventId: ' + eventId);
    var userInfo = users.loadUser(app, loggedInUserId);
    if (!userInfo ||
        !userInfo.admin)
        return res.status(403).jsonp({ message: 'Not allowed. Only Admins may do this.' });

    var listener = webhooks.getListener(app, listenerId);
    if (!listener)
        return res.status(404).jsonp({ message: 'Listener not found: ' + listenerId });

    utils.withLockedEvents(app, res, listenerId, function () {
        var events = webhooks.loadEvents(app, listenerId);
        var index = webhooks.getIndex(events, eventId);
        if (index < 0)
            return res.status(404).jsonp({ message: 'Event not found: ' + eventId });

        events.splice(index, 1);

        webhooks.saveEvents(app, listenerId, events);

        res.status(204).send('');
    });
};

// FIRING WEB HOOKS

webhooks.checkAndFireHooks = function (app) {
    debug('checkAndFireHooks()');
    if (webhooks._disableAllHooks) {
        debug('checkAndFireHooks() - currently disabled.');
        return;
    }

    var listenerInfos = webhooks.loadListeners(app);

    async.map(listenerInfos, function (listener, callback) {
        var listenerId = listener.id;
        var listenerUrl = listener.url;

        var listenerEvents = webhooks.loadEvents(app, listenerId);

        if (listenerEvents.length > 0) {
            debug('Posting events to ' + listenerId);
            request.post({
                url: listenerUrl,
                json: true,
                body: listenerEvents,
            }, function (err, apiResponse, apiBody) {
                if (err)
                    return callback(err);
                if (200 != apiResponse.statusCode) {
                    var err2 = new Error('Calling the web hook "' + listenerId + '" failed.');
                    err2.status = apiResponse.statusCode;
                    return callback(err);
                }
                callback(null, apiBody);
            });
        }
    }, function (err, results) {
        if (err) {
            debug(err);
            console.error(err);
        }
    });
};

module.exports = webhooks;