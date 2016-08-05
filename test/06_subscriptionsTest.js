var assert = require('chai').assert;
var request = require('request');
var utils = require('./testUtils');
var consts = require('./testConsts');

var baseUrl = consts.BASE_URL;

describe('/applications/<appId>/subscriptions', function () {

    var devUserId = '';
    var adminUserId = '';
    var noobUserId = '';

    // Let's create some users to play with
    before(function (done) {
        utils.createUser('Dev', 'dev', true, function (id) {
            devUserId = id;
            utils.createUser('Admin', 'admin', true, function (id) {
                adminUserId = id;
                utils.createUser('Noob', null, true, function (id) {
                    noobUserId = id;
                    done();
                });
            });
        });
    });

    // And delete them afterwards    
    after(function (done) {
        utils.deleteUser(noobUserId, function () {
            utils.deleteUser(adminUserId, function () {
                utils.deleteUser(devUserId, function () {
                    done();
                });
            });
        });
    });

    var appId = 'myapp';
    var appName = 'My Application';

    // Let's create a standard application to play with for each test case
    beforeEach(function (done) {
        utils.createApplication(appId, appName, devUserId, function () {
            done();
        });
    });

    afterEach(function (done) {
        utils.deleteApplication(appId, devUserId, function () {
            done();
        });
    });

    // ------------

    var subsUrl = baseUrl + 'applications/' + appId + '/subscriptions';
    var publicApi = 'superduper';
    var privateApi = 'partner';

    describe('POST', function () {
        it('should be possible to add a subscription', function (done) {
            request.post(
                {
                    url: subsUrl,
                    headers: { 'X-UserId': devUserId },
                    json: true,
                    body: {
                        application: appId,
                        api: publicApi,
                        plan: 'unlimited'
                    }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(201, res.statusCode);
                    done();
                });
        });

        it('should be possible for co-owners to add a subscription', function (done) {
            utils.addOwner(appId, devUserId, 'noob@random.org', 'owner', function () {
                request.post(
                    {
                        url: subsUrl,
                        headers: { 'X-UserId': noobUserId },
                        json: true,
                        body: {
                            application: appId,
                            api: publicApi,
                            plan: 'unlimited'
                        }
                    },
                    function (err, res, body) {
                        assert.isNotOk(err);
                        assert.equal(201, res.statusCode);
                        done();
                    });
            });
        });

        it('should be possible for collaborators to add a subscription', function (done) {
            utils.addOwner(appId, devUserId, 'noob@random.org', 'collaborator', function () {
                request.post(
                    {
                        url: subsUrl,
                        headers: { 'X-UserId': noobUserId },
                        json: true,
                        body: {
                            application: appId,
                            api: publicApi,
                            plan: 'godlike'
                        }
                    },
                    function (err, res, body) {
                        assert.isNotOk(err);
                        assert.equal(201, res.statusCode);
                        done();
                    });
            });
        });

        it('should not be possible for readers to add a subscription', function (done) {
            utils.addOwner(appId, devUserId, 'noob@random.org', 'reader', function () {
                request.post(
                    {
                        url: subsUrl,
                        headers: { 'X-UserId': noobUserId },
                        json: true,
                        body: {
                            application: appId,
                            api: publicApi,
                            plan: 'basic'
                        }
                    },
                    function (err, res, body) {
                        assert.isNotOk(err);
                        assert.equal(403, res.statusCode);
                        done();
                    });
            });
        });

        it('should not be possible to add a subscription with an invalid user', function (done) {
            request.post(
                {
                    url: subsUrl,
                    headers: { 'X-UserId': 'invaliduser' },
                    json: true,
                    body: {
                        application: appId,
                        api: publicApi,
                        plan: 'basic'
                    }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(403, res.statusCode);
                    done();
                });
        });

        it('should not be possible to add a subscription with an invalid plan', function (done) {
            request.post(
                {
                    url: subsUrl,
                    headers: { 'X-UserId': devUserId },
                    json: true,
                    body: {
                        application: appId,
                        api: publicApi,
                        plan: 'invalidplan'
                    }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(400, res.statusCode);
                    done();
                });
        });

        it('should not be possible to add a subscription with a restricted plan', function (done) {
            request.post(
                {
                    url: subsUrl,
                    headers: { 'X-UserId': devUserId },
                    json: true,
                    body: {
                        application: appId,
                        api: 'orders',
                        plan: 'restricted_basic'
                    }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(403, res.statusCode);
                    done();
                });
        });

        it('should, with the required group, be possible to add a subscription to a restricted plan', function (done) {
            utils.setGroups(devUserId, ["dev", "superdev"], function () {
                utils.addSubscription(appId, devUserId, 'orders', 'restricted_basic', null, function () {
                    utils.deleteSubscription(appId, devUserId, 'orders', function () {
                        done();
                    });
                });
            });

        });

        it('should, as an admin, be possible to add a subscription to a restricted plan', function (done) {
            utils.addSubscription(appId, adminUserId, 'orders', 'restricted_basic', null, function () {
                utils.deleteSubscription(appId, adminUserId, 'orders', function () {
                    done();
                });
            });
        });

        it('should not be possible to add a subscription with an invalid API', function (done) {
            request.post(
                {
                    url: subsUrl,
                    headers: { 'X-UserId': devUserId },
                    json: true,
                    body: {
                        application: appId,
                        api: 'invalid-api',
                        plan: 'basic'
                    }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(400, res.statusCode);
                    done();
                });
        });

        it('should not be possible to add a subscription without a user', function (done) {
            request.post(
                {
                    url: subsUrl,
                    json: true,
                    body: {
                        application: appId,
                        api: publicApi,
                        plan: 'basic'
                    }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(403, res.statusCode);
                    done();
                });
        });

        it('should not be possible to add a subscription to an invalid app', function (done) {
            request.post(
                {
                    url: baseUrl + 'applications/invalid-app/subscriptions',
                    headers: { 'X-UserId': devUserId },
                    json: true,
                    body: {
                        application: 'invalid-app',
                        api: publicApi,
                        plan: 'basic'
                    }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(404, res.statusCode);
                    done();
                });
        });
        it('should not be possible to add a subscription to a restricted API', function (done) {
            utils.createApplication('noobapp', 'Noob App', noobUserId, function () {
                request.post(
                    {
                        url: baseUrl + 'applications/noobapp/subscriptions',
                        headers: { 'X-UserId': noobUserId },
                        json: true,
                        body: {
                            application: 'noobapp',
                            api: 'restricted',
                            plan: 'restricted_basic'
                        }
                    },
                    function (err, res, body) {
                        utils.deleteApplication('noobapp', noobUserId, function () {
                            // console.log(utils.getText(body));
                            assert.isNotOk(err);
                            assert.equal(403, res.statusCode);
                            done();
                        });
                    });
            });
        });

        it('should not return an apikey for plans which require approval', function (done) {
            utils.addSubscription(appId, devUserId, privateApi, 'unlimited', null, function () {
                request(
                    {
                        url: subsUrl,
                        headers: { 'X-UserId': devUserId }
                    },
                    function (err, res, body) {
                        assert.isNotOk(err);
                        assert.equal(200, res.statusCode);
                        var jsonBody = utils.getJson(body);
                        assert.isNotOk(jsonBody[0].apikey);
                        assert.isNotOk(jsonBody[0].approved);
                        done();
                    });
            });
        });

        it('should, for admins, return an apikey for plans which require approval', function (done) {
            utils.addSubscription(appId, adminUserId, privateApi, 'unlimited', null, function () {
                request(
                    {
                        url: subsUrl,
                        headers: { 'X-UserId': adminUserId }
                    },
                    function (err, res, body) {
                        assert.isNotOk(err);
                        assert.equal(200, res.statusCode);
                        var jsonBody = utils.getJson(body);
                        assert.isOk(jsonBody[0].apikey, "Admins must get the apikey back, no approval needed.");
                        assert.isOk(jsonBody[0].approved, "Subscriptions must be marked as approved.");
                        done();
                    });
            });
        });
    }); // /subscriptions POST

    describe('GET', function () {
        it('should be possible to get all subscriptions', function (done) {
            utils.addSubscription(appId, devUserId, privateApi, 'basic', null, function () {
                request(
                    {
                        url: subsUrl,
                        headers: { 'X-UserId': devUserId }
                    },
                    function (err, res, body) {
                        assert.isNotOk(err);
                        assert.equal(200, res.statusCode);
                        var jsonBody = utils.getJson(body);
                        assert.equal(1, jsonBody.length);
                        done();
                    });
            });
        });

        it('should be possible for collaborators to get all subscriptions', function (done) {
            utils.addSubscription(appId, devUserId, privateApi, 'basic', null, function () {
                utils.addOwner(appId, devUserId, 'noob@random.org', 'collaborator', function () {
                    request(
                        {
                            url: subsUrl,
                            headers: { 'X-UserId': noobUserId }
                        },
                        function (err, res, body) {
                            assert.isNotOk(err);
                            assert.equal(200, res.statusCode);
                            var jsonBody = utils.getJson(body);
                            assert.equal(1, jsonBody.length);
                            done();
                        });
                });
            });
        });

        it('should be possible for readers to get all subscriptions', function (done) {
            utils.addSubscription(appId, devUserId, privateApi, 'basic', null, function () {
                utils.addOwner(appId, devUserId, 'noob@random.org', 'reader', function () {
                    request(
                        {
                            url: subsUrl,
                            headers: { 'X-UserId': noobUserId }
                        },
                        function (err, res, body) {
                            assert.isNotOk(err);
                            assert.equal(200, res.statusCode);
                            var jsonBody = utils.getJson(body);
                            assert.equal(1, jsonBody.length);
                            done();
                        });
                });
            });
        });

        it('should be possible for admins to get all subscriptions, even if not owner', function (done) {
            utils.addSubscription(appId, devUserId, privateApi, 'basic', null, function () {
                request(
                    {
                        url: subsUrl,
                        headers: { 'X-UserId': adminUserId }
                    },
                    function (err, res, body) {
                        assert.isNotOk(err);
                        assert.equal(200, res.statusCode);
                        var jsonBody = utils.getJson(body);
                        assert.equal(1, jsonBody.length);
                        done();
                    });
            });
        });

        it('should not be possible for unrelated users to get all subscriptions', function (done) {
            utils.addSubscription(appId, devUserId, privateApi, 'basic', null, function () {
                request(
                    {
                        url: subsUrl,
                        headers: { 'X-UserId': noobUserId }
                    },
                    function (err, res, body) {
                        assert.isNotOk(err);
                        assert.equal(403, res.statusCode);
                        done();
                    });
            });
        });
    }); // /subscriptions GET

    describe('/<apiId>', function () {
        describe('GET', function () {
            it('should be possible to get subscription', function (done) {
                utils.addSubscription(appId, devUserId, privateApi, 'basic', null, function () {
                    request(
                        {
                            url: subsUrl + '/' + privateApi,
                            headers: { 'X-UserId': devUserId }
                        },
                        function (err, res, body) {
                            assert.isNotOk(err);
                            assert.equal(200, res.statusCode);
                            var jsonBody = utils.getJson(body);
                            assert.equal(privateApi, jsonBody.api);
                            done();
                        });
                });
            });

            it('should return the correct apikey for a subscription', function (done) {
                var APIKEY = 'abcdefghijklmno';
                utils.addSubscription(appId, devUserId, privateApi, 'basic', APIKEY, function () {
                    request(
                        {
                            url: subsUrl + '/' + privateApi,
                            headers: { 'X-UserId': devUserId }
                        },
                        function (err, res, body) {
                            assert.isNotOk(err);
                            assert.equal(200, res.statusCode);
                            var jsonBody = utils.getJson(body);
                            assert.equal(privateApi, jsonBody.api);
                            assert.equal(APIKEY, jsonBody.apikey);
                            done();
                        });
                });
            });

            it('should be possible for collaborators to get subscription', function (done) {
                utils.addSubscription(appId, devUserId, privateApi, 'basic', null, function () {
                    utils.addOwner(appId, devUserId, 'noob@random.org', 'collaborator', function () {
                        request(
                            {
                                url: subsUrl + '/' + privateApi,
                                headers: { 'X-UserId': noobUserId }
                            },
                            function (err, res, body) {
                                assert.isNotOk(err);
                                assert.equal(200, res.statusCode);
                                var jsonBody = utils.getJson(body);
                                assert.equal(privateApi, jsonBody.api);
                                done();
                            });
                    });
                });
            });

            it('should be possible for readers to get subscription', function (done) {
                utils.addSubscription(appId, devUserId, privateApi, 'basic', null, function () {
                    utils.addOwner(appId, devUserId, 'noob@random.org', 'reader', function () {
                        request(
                            {
                                url: subsUrl + '/' + privateApi,
                                headers: { 'X-UserId': noobUserId }
                            },
                            function (err, res, body) {
                                assert.isNotOk(err);
                                assert.equal(200, res.statusCode);
                                var jsonBody = utils.getJson(body);
                                assert.equal(privateApi, jsonBody.api);
                                done();
                            });
                    });
                });
            });

            it('should be possible for admins to get subscription, even if not owner', function (done) {
                utils.addSubscription(appId, devUserId, privateApi, 'basic', null, function () {
                    request(
                        {
                            url: subsUrl + '/' + privateApi,
                            headers: { 'X-UserId': adminUserId }
                        },
                        function (err, res, body) {
                            assert.isNotOk(err);
                            assert.equal(200, res.statusCode);
                            var jsonBody = utils.getJson(body);
                            assert.equal(privateApi, jsonBody.api);
                            done();
                        });
                });
            });

            it('should not be possible for unrelated users to get subscription', function (done) {
                utils.addSubscription(appId, devUserId, privateApi, 'basic', null, function () {
                    request(
                        {
                            url: subsUrl + '/' + privateApi,
                            headers: { 'X-UserId': noobUserId }
                        },
                        function (err, res, body) {
                            assert.isNotOk(err);
                            assert.equal(403, res.statusCode);
                            done();
                        });
                });
            });

            it('should return valid _links', function (done) {
                utils.addSubscription(appId, devUserId, privateApi, 'basic', null, function () {
                    request(
                        {
                            url: subsUrl + '/' + privateApi,
                            headers: { 'X-UserId': devUserId }
                        },
                        function (err, res, body) {
                            assert.isNotOk(err);
                            assert.equal(200, res.statusCode);
                            var jsonBody = utils.getJson(body);
                            assert.isOk(jsonBody._links);
                            assert.isOk(jsonBody._links.self);
                            assert.isOk(jsonBody._links.application);
                            assert.isOk(jsonBody._links.plans);
                            assert.isOk(jsonBody._links.apis);
                            assert.equal(jsonBody._links.self.href, '/applications/' + appId + '/subscriptions/' + privateApi);
                            assert.equal(jsonBody._links.application.href, '/applications/' + appId);
                            assert.equal(jsonBody._links.plans.href, '/plans');
                            assert.equal(jsonBody._links.apis.href, '/apis');
                            done();
                        });
                });
            });

        }); // /subscriptions/<apiId> GET

        describe('DELETE', function () {
            it('should be possible to delete a subscription', function (done) {
                utils.addSubscription(appId, devUserId, privateApi, 'basic', null, function () {
                    request.delete(
                        {
                            url: subsUrl + '/' + privateApi,
                            headers: { 'X-UserId': devUserId }
                        },
                        function (err, res, body) {
                            assert.isNotOk(err);
                            assert.equal(204, res.statusCode);
                            done();
                        });
                });
            });

            it('should return a 404 if the application is invalid', function (done) {
                request.delete(
                    {
                        url: baseUrl + 'applications/invalid-app/subscriptions/' + privateApi,
                        headers: { 'X-UserId': devUserId }
                    },
                    function (err, res, body) {
                        assert.isNotOk(err);
                        assert.equal(404, res.statusCode);
                        done();
                    });
            });

            it('should return a 403 if the user is invalid', function (done) {
                request.delete(
                    {
                        url: subsUrl + '/' + privateApi,
                        headers: { 'X-UserId': 'invaliduser' }
                    },
                    function (err, res, body) {
                        assert.isNotOk(err);
                        assert.equal(403, res.statusCode);
                        done();
                    });
            });

            it('should return a 404 if trying to delete a non-existing subscription', function (done) {
                request.delete(
                    {
                        url: subsUrl + '/' + privateApi,
                        headers: { 'X-UserId': devUserId }
                    },
                    function (err, res, body) {
                        assert.isNotOk(err);
                        assert.equal(404, res.statusCode);
                        done();
                    });
            });

            it('should be possible to delete a subscription for a collaborator', function (done) {
                utils.addOwner(appId, devUserId, 'noob@random.org', 'collaborator', function () {
                    utils.addSubscription(appId, devUserId, privateApi, 'basic', null, function () {
                        request.delete(
                            {
                                url: subsUrl + '/' + privateApi,
                                headers: { 'X-UserId': noobUserId }
                            },
                            function (err, res, body) {
                                assert.isNotOk(err);
                                assert.equal(204, res.statusCode);
                                done();
                            });
                    });
                });
            });

            it('should not be possible to delete a subscription for a reader', function (done) {
                utils.addOwner(appId, devUserId, 'noob@random.org', 'reader', function () {
                    utils.addSubscription(appId, devUserId, privateApi, 'basic', null, function () {
                        request.delete(
                            {
                                url: subsUrl + '/' + privateApi,
                                headers: { 'X-UserId': noobUserId }
                            },
                            function (err, res, body) {
                                assert.isNotOk(err);
                                assert.equal(403, res.statusCode);
                                done();
                            });
                    });
                });
            });

            it('should be removed from subscriptions after deleting', function (done) {
                utils.addSubscription(appId, devUserId, privateApi, 'basic', null, function () {
                    request(
                        {
                            url: subsUrl,
                            headers: { 'X-UserId': devUserId }
                        },
                        function (err, res, body) {
                            assert.isNotOk(err);
                            assert.equal(200, res.statusCode);
                            var jsonBody = utils.getJson(body);
                            assert.equal(1, jsonBody.length);

                            utils.deleteSubscription(appId, devUserId, privateApi, function () {
                                request(
                                    {
                                        url: subsUrl,
                                        headers: { 'X-UserId': devUserId }
                                    },
                                    function (err, res, body) {
                                        assert.isNotOk(err);
                                        assert.equal(200, res.statusCode);
                                        var jsonBody = utils.getJson(body);
                                        assert.equal(0, jsonBody.length);
                                        done();
                                    });
                            });
                        });
                });
            });

        }); // /subscriptions/<apiId> DELETE
    }); // /subscriptions/<apiId>
}); // /applications/<appId>/subscriptions