var assert = require('chai').assert;
var request = require('request');
var utils = require('./testUtils');
var consts = require('./testConsts');
var http = require('http');
var async = require('async');

var baseUrl = consts.BASE_URL;

var HOOK_PORT = 3003;
var HOOK_URL = 'http://localhost:' + HOOK_PORT;

var __server = null;

function hookServer(callback, serverHooked) {
    if (__server)
        throw new Error('server is already hooked, release it first!');
    __server = http.createServer(function (req, res) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');

        __server.close(function() {
            __server = null;
            callback();
        });
    });
    __server.listen(HOOK_PORT, serverHooked);
}

function findEvent(eventList, action, entity) {
    var e = null;
    for (var i=0; i<eventList.length; ++i) {
        var thisE = eventList[i];
        if (thisE.action == action &&
            thisE.entity == entity) {
            e = thisE;
            break;
        }
    }
    return e;
}

describe('/webhooks', function () {

    beforeEach(function() {
        utils.correlationId = utils.createRandomId();
        console.log('Correlation ID: ' + utils.correlationId);
    });

    afterEach(function() {
        utils.correlationId = null;
    });

    describe('/listeners/:listenerId', function () {
        it('should be possible to add a listener', function (done) {
            request.put({
                url: baseUrl + 'webhooks/listeners/sample',
                json: true,
                headers: utils.makeHeaders('1'),
                body: {
                    id: 'sample',
                    url: 'http://localhost:3002'
                }
            }, function (err, res, body) {
                assert.isNotOk(err);
                assert.equal(200, res.statusCode);
                done();
            });
        });

        it('should return a list of listeners', function (done) {
            request.get({
                url: baseUrl + 'webhooks/listeners',
                headers: utils.makeHeaders('1')
            }, function (err, res, body) {
                assert.isNotOk(err);
                assert.equal(200, res.statusCode);
                var jsonBody = utils.getJson(body);
                assert.equal(1, jsonBody.length);
                assert.equal('sample', jsonBody[0].id);
                done();
            });
        });

        it('should not return a list of listeners without admin user', function (done) {
            request.get({
                url: baseUrl + 'webhooks/listeners',
                headers: utils.makeHeaders()
            }, function (err, res, body) {
                assert.isNotOk(err);
                assert.equal(403, res.statusCode);
                done();
            });
        });

        it('should be possible to update a listener', function (done) {
            request.put({
                url: baseUrl + 'webhooks/listeners/sample',
                headers: utils.makeHeaders('1'),
                json: true,
                body: {
                    id: 'sample',
                    url: 'http://lostalllocals:3002'
                }
            }, function (err, res, body) {
                assert.isNotOk(err);
                assert.equal(200, res.statusCode);
                done();
            });
        });

        it('should return the updated list of listeners', function (done) {
            request.get({
                url: baseUrl + 'webhooks/listeners',
                headers: utils.makeHeaders('1')
            }, function (err, res, body) {
                assert.isNotOk(err);
                assert.equal(200, res.statusCode);
                var jsonBody = utils.getJson(body);
                assert.equal(1, jsonBody.length);
                assert.equal('http://lostalllocals:3002', jsonBody[0].url);
                done();
            });
        });

        it('should be possible to delete a listener', function (done) {
            request.delete({
                url: baseUrl + 'webhooks/listeners/sample',
                headers: utils.makeHeaders('1')
            }, function (err, res, body) {
                assert.isNotOk(err);
                assert.equal(204, res.statusCode);
                done();
            });
        });

        it('should return an empty list of listeners after the delete', function (done) {
            request.get({
                url: baseUrl + 'webhooks/listeners',
                headers: utils.makeHeaders('1')
            }, function (err, res, body) {
                assert.isNotOk(err);
                assert.equal(200, res.statusCode);
                var jsonBody = utils.getJson(body);
                assert.equal(0, jsonBody.length);
                done();
            });
        });
    });
    /*
    describe('/events/:listenerId', function() {
         it('should look good', function(done) {
             done();
         });
    });
    */

    describe('/events/:listenerId', function () {
        this.slow(500);

        var devUserId = '';
        var privateApi = 'users';

        before(function (done) {
            utils.createUser('Developer', 'dev', true, function (id) {
                devUserId = id;
                done();
            });
        });

        after(function (done) {
            utils.deleteUser(devUserId, done);
        });

        var LISTENER = 'test-listener';

        /*
        afterEach(function (done) {
            if (server) {
                server.close(function () {
                    server = null;
                    done();
                });
            } else {
                done();
            }
        });
        */

        it('should work to get called by a webhook', function (done) {
            // Totally brainfucking execution order. This is run
            // after the server is called.
            hookServer(function () {
                utils.deleteListener(LISTENER, done);
            }, function () {
                utils.createListener(LISTENER, HOOK_URL, function () {
                    utils.createUser('Dvolla', 'dev', true, function () {
                        // We don't need to do anything here.
                    });
                });
            });

        });

        it('should return expected events (create application)', function (done) {
            hookServer(function () {
                request({ url: baseUrl + 'webhooks/events/' + LISTENER, headers: { 'X-UserId': '1' } },
                    function (err, apiResponse, apiBody) {
                        utils.deleteListener(LISTENER, function () {
                            utils.deleteApplication('dvolla', devUserId, function () {

                                assert.isNotOk(err);
                                assert.equal(200, apiResponse.statusCode);
                                var jsonBody = utils.getJson(apiBody);
                                var wh = findEvent(jsonBody, 'add', 'application');
                                assert.isOk(wh);
                                assert.isOk(wh.data);
                                assert.equal(devUserId, wh.data.userId);
                                assert.equal('dvolla', wh.data.applicationId);

                                done();
                            });
                        });
                    });
            }, function () {
                utils.createListener(LISTENER, HOOK_URL, function () {
                    utils.createApplication('dvolla', 'Dvolla App', devUserId, function () {
                        // We don't need to do anything here.
                    });
                });
            });
        });

        it('should return expected events (delete application)', function (done) {
            hookServer(function () {
                request({ url: baseUrl + 'webhooks/events/' + LISTENER, headers: utils.makeHeaders('1') },
                    function (err, apiResponse, apiBody) {
                        utils.deleteListener(LISTENER, function () {

                            assert.isNotOk(err);
                            assert.equal(200, apiResponse.statusCode);
                            var jsonBody = utils.getJson(apiBody);
                            var wh = findEvent(jsonBody, 'delete', 'application');
                            assert.isOk(wh);
                            assert.equal('delete', wh.action);
                            assert.equal('application', wh.entity);
                            assert.isOk(wh.data);
                            assert.equal(devUserId, wh.data.userId);
                            assert.equal('dvolla', wh.data.applicationId);

                            done();
                        });
                    });
            }, function () {
                utils.createApplication('dvolla', 'Dvolla App', devUserId, function () {
                    utils.createListener(LISTENER, HOOK_URL, function () {
                        utils.deleteApplication('dvolla', devUserId, function () {
                            // We don't need to do anything here.
                        });
                    });
                });
            });

        });

        it('should return expected events (create subscription)', function (done) {
            hookServer(function () {
                request({ url: baseUrl + 'webhooks/events/' + LISTENER, headers: utils.makeHeaders('1') },
                    function (err, apiResponse, apiBody) {
                        utils.deleteListener(LISTENER, function () {
                            utils.deleteApplication('dvolla', devUserId, function () {

                                assert.isNotOk(err);
                                assert.equal(200, apiResponse.statusCode);
                                var jsonBody = utils.getJson(apiBody);
                                var wh = findEvent(jsonBody, 'add', 'subscription');
                                assert.isOk(wh);
                                assert.equal('add', wh.action);
                                assert.equal('subscription', wh.entity);
                                assert.isOk(wh.data);
                                assert.equal(devUserId, wh.data.userId);
                                assert.equal('dvolla', wh.data.applicationId);
                                assert.equal(privateApi, wh.data.apiId);

                                done();
                            });
                        });
                    });
            }, function () {
                utils.createApplication('dvolla', 'Dvolla App', devUserId, function () {
                    utils.createListener(LISTENER, HOOK_URL, function () {
                        utils.addSubscription('dvolla', devUserId, privateApi, 'basic', null, function () {
                            // We don't need to do anything here.
                        });
                    });
                });
            });
        });

        it('should return expected events (patch subscription)', function (done) {
            hookServer(function () {
                request({ url: baseUrl + 'webhooks/events/' + LISTENER, headers: utils.makeHeaders('1') },
                    function (err, apiResponse, apiBody) {
                        utils.deleteListener(LISTENER, function () {
                            utils.deleteApplication('dvolla', devUserId, function () {

                                assert.isNotOk(err);
                                assert.equal(200, apiResponse.statusCode);
                                var jsonBody = utils.getJson(apiBody);
                                var wh = findEvent(jsonBody, 'update', 'subscription');
                                assert.isOk(wh);
                                assert.equal('update', wh.action);
                                assert.equal('subscription', wh.entity);
                                assert.isOk(wh.data);
                                assert.equal('1', wh.data.userId);
                                assert.equal('dvolla', wh.data.applicationId);
                                assert.equal(privateApi, wh.data.apiId);

                                done();
                            });
                        });
                    });
            }, function () {
                utils.createApplication('dvolla', 'Dvolla App', devUserId, function () {
                    utils.addSubscription('dvolla', devUserId, privateApi, 'unlimited', null, function () {
                        utils.createListener(LISTENER, HOOK_URL, function () {
                            request.patch(
                                {
                                    url: baseUrl + 'applications/dvolla/subscriptions/' + privateApi,
                                    json: true,
                                    body: { approved: true },
                                    headers: utils.makeHeaders('1')
                                }, function (err, res, body) {
                                    assert.isNotOk(err);
                                    assert.equal(200, res.statusCode);
                                });
                        });
                    });
                });
            });

        });

        it('should return expected events (delete subscription)', function (done) {
            hookServer(function () {
                request({ url: baseUrl + 'webhooks/events/' + LISTENER, headers: utils.makeHeaders('1') },
                    function (err, apiResponse, apiBody) {
                        utils.deleteListener(LISTENER, function () {
                            utils.deleteApplication('dvolla', devUserId, function () {

                                assert.isNotOk(err);
                                assert.equal(200, apiResponse.statusCode);
                                var jsonBody = utils.getJson(apiBody);
                                var wh = findEvent(jsonBody, 'delete', 'subscription');
                                assert.isOk(wh);
                                assert.equal('delete', wh.action);
                                assert.equal('subscription', wh.entity);
                                assert.isOk(wh.data);
                                assert.equal(devUserId, wh.data.userId);
                                assert.equal('dvolla', wh.data.applicationId);
                                assert.equal(privateApi, wh.data.apiId);

                                done();
                            });
                        });
                    });
            }, function () {
                utils.createApplication('dvolla', 'Dvolla App', devUserId, function () {
                    utils.addSubscription('dvolla', devUserId, privateApi, 'unlimited', null, function () {
                        utils.createListener(LISTENER, HOOK_URL, function () {
                            utils.deleteSubscription('dvolla', devUserId, privateApi, function () {
                                // No need to do something here. 
                            });
                        });
                    });
                });
            });

        });

        it('should return expected events (create user)', function (done) {
            var noobUserId = '';
            hookServer(function () {
                request({ url: baseUrl + 'webhooks/events/' + LISTENER, headers: utils.makeHeaders('1') },
                    function (err, apiResponse, apiBody) {
                        utils.deleteListener(LISTENER, function () {
                            utils.deleteUser(noobUserId, function () {

                                assert.isNotOk(err);
                                assert.equal(200, apiResponse.statusCode);
                                var jsonBody = utils.getJson(apiBody);
                                var wh = findEvent(jsonBody, 'add', 'user');
                                assert.isOk(wh);
                                assert.equal('add', wh.action);
                                assert.equal('user', wh.entity);
                                assert.isOk(wh.data);
                                assert.equal(noobUserId, wh.data.userId);

                                done();
                            });
                        });
                    });
            }, function () {
                utils.createListener(LISTENER, HOOK_URL, function () {
                    utils.createUser('Noob', '', true, function (userId) {
                        noobUserId = userId;
                    });
                });
            });
        });

        it('should return expected events (patch user)', function (done) {
            var noobUserId = '';
            hookServer(function () {
                request({ url: baseUrl + 'webhooks/events/' + LISTENER, headers: utils.makeHeaders('1') },
                    function (err, apiResponse, apiBody) {
                        utils.deleteListener(LISTENER, function () {

                            assert.isNotOk(err);
                            assert.equal(200, apiResponse.statusCode);
                            var jsonBody = utils.getJson(apiBody);
                            var wh = findEvent(jsonBody, 'update', 'user');
                            assert.isOk(wh);
                            assert.equal('update', wh.action);
                            assert.equal('user', wh.entity);
                            assert.isOk(wh.data);
                            assert.equal(devUserId, wh.data.updatedUserId);
                            assert.equal('1', wh.data.userId);

                            done();
                        });
                    });
            }, function () {
                utils.createListener(LISTENER, HOOK_URL, function () {
                    request.patch({
                        url: baseUrl + 'users/' + devUserId,
                        headers: utils.makeHeaders('1'),
                        json: true,
                        body: {
                            firstName: 'Developer',
                            lastName: 'Doofus'
                        }
                    }, function () {
                        // Nothing to do here
                    });
                });
            });
        });

        it('should return expected events (delete user)', function (done) {
            var noobUserId = '';
            hookServer(function () {
                request({ url: baseUrl + 'webhooks/events/' + LISTENER, headers: utils.makeHeaders('1') },
                    function (err, apiResponse, apiBody) {
                        utils.deleteListener(LISTENER, function () {

                            assert.isNotOk(err);
                            assert.equal(200, apiResponse.statusCode);
                            var jsonBody = utils.getJson(apiBody);
                            var wh = findEvent(jsonBody, 'delete', 'user');
                            assert.isOk(wh);
                            assert.equal('delete', wh.action);
                            assert.equal('user', wh.entity);
                            assert.isOk(wh.data);
                            assert.equal(noobUserId, wh.data.deletedUserId);
                            assert.equal(noobUserId, wh.data.userId);

                            done();
                        });
                    });
            }, function () {
                utils.createUser('Noob', '', true, function (userId) {
                    noobUserId = userId;
                    utils.createListener(LISTENER, HOOK_URL, function () {
                        utils.deleteUser(noobUserId, function () {
                            // Nothing to do here.
                        });
                    });
                });
            });

        });

        describe('adding and deleting owners', function () {

            var noobUserId = '';

            beforeEach(function (done) {
                utils.createUser('Noob', '', true, function (userId) {
                    noobUserId = userId;
                    utils.createApplication('dvolla', 'Dvolla App', devUserId, done);
                });
            });

            afterEach(function (done) {
                utils.deleteApplication('dvolla', devUserId, function () {
                    utils.deleteUser(noobUserId, done);
                });
            });

            it('should return expected events (add owner)', function (done) {
                hookServer(function () {
                    request({ url: baseUrl + 'webhooks/events/' + LISTENER, headers: utils.makeHeaders('1') },
                        function (err, apiResponse, apiBody) {
                            utils.deleteListener(LISTENER, function () {
                                assert.isNotOk(err);
                                assert.equal(200, apiResponse.statusCode);
                                var jsonBody = utils.getJson(apiBody);
                                var wh = findEvent(jsonBody, 'add', 'owner');
                                assert.isOk(wh);
                                assert.equal('add', wh.action);
                                assert.equal('owner', wh.entity);
                                assert.isOk(wh.data);
                                assert.equal(noobUserId, wh.data.addedUserId);
                                assert.equal(devUserId, wh.data.userId);
                                assert.equal('dvolla', wh.data.applicationId);
                                assert.equal('collaborator', wh.data.role);

                                done();
                            });
                        });
                }, function () {
                    utils.createListener(LISTENER, HOOK_URL, function () {
                        utils.addOwner('dvolla', devUserId, 'noob@random.org', 'collaborator', function () {
                            // Nothing to do here.
                        });
                    });
                });
            });

            it('should return expected events (delete owner)', function (done) {
                hookServer(function () {
                    request({ url: baseUrl + 'webhooks/events/' + LISTENER, headers: utils.makeHeaders('1') },
                        function (err, apiResponse, apiBody) {
                            utils.deleteListener(LISTENER, function () {
                                assert.isNotOk(err);
                                assert.equal(200, apiResponse.statusCode);
                                var jsonBody = utils.getJson(apiBody);
                                var wh = findEvent(jsonBody, 'delete', 'owner');
                                assert.isOk(wh);
                                assert.equal('delete', wh.action);
                                assert.equal('owner', wh.entity);
                                assert.isOk(wh.data);
                                assert.equal(noobUserId, wh.data.deletedUserId);
                                assert.equal(devUserId, wh.data.userId);
                                assert.equal('dvolla', wh.data.applicationId);

                                done();
                            });
                        });
                }, function () {
                    utils.addOwner('dvolla', devUserId, 'noob@random.org', 'collaborator', function () {
                        utils.createListener(LISTENER, HOOK_URL, function () {
                            utils.deleteOwner('dvolla', devUserId, 'noob@random.org', function () {
                                // Nothing to do here.
                            });
                        });
                    });
                });
            });
        });
    });
});