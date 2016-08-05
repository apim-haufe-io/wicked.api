var assert = require('chai').assert;
var request = require('request');
var utils = require('./testUtils');
var consts = require('./testConsts');

var baseUrl = consts.BASE_URL;

describe('/approvals', function () {

    var devUserId = '';
    var adminUserId = '';
    var noobUserId = '';

    var appId = 'approval-test';
    var publicApi = 'superduper';
    var privateApi = 'partner';

    // Let's create some users and an application to play with
    before(function (done) {
        utils.createUser('Dev', 'dev', true, function (id) {
            devUserId = id;
            utils.createUser('Admin', 'admin', true, function (id) {
                adminUserId = id;
                utils.createUser('Noob', null, true, function (id) {
                    noobUserId = id;
                    utils.createApplication(appId, 'My Application', devUserId, done);
                });
            });
        });
    });

    // And delete them afterwards    
    after(function (done) {
        utils.deleteApplication(appId, devUserId, function () {
            utils.deleteUser(noobUserId, function () {
                utils.deleteUser(adminUserId, function () {
                    utils.deleteUser(devUserId, function () {
                        done();
                    });
                });
            });
        });
    });

    describe('GET', function () {
        it('should generate an approval request for subscriptions to plans requiring approval', function (done) {
            utils.addSubscription(appId, devUserId, privateApi, 'unlimited', null, function () {
                request(
                    {
                        url: baseUrl + 'approvals',
                        headers: { 'X-UserId': adminUserId }
                    },
                    function (err, res, body) {
                        utils.deleteSubscription(appId, devUserId, privateApi, function () {
                            assert.isNotOk(err);
                            assert.equal(200, res.statusCode);
                            var jsonBody = utils.getJson(body);
                            assert.equal(1, jsonBody.length);
                            done();
                        });
                    });
            });
        });

        it('should not generate an approval request for subscriptions to plans not requiring approval', function (done) {
            utils.addSubscription(appId, devUserId, privateApi, 'basic', null, function () {
                request(
                    {
                        url: baseUrl + 'approvals',
                        headers: { 'X-UserId': adminUserId }
                    },
                    function (err, res, body) {
                        utils.deleteSubscription(appId, devUserId, privateApi, function () {
                            assert.isNotOk(err);
                            assert.equal(200, res.statusCode);
                            var jsonBody = utils.getJson(body);
                            assert.equal(0, jsonBody.length);
                            done();
                        });
                    });
            });
        });

        it('should remove an approval request after approving via patch subscription', function (done) {
            utils.addSubscription(appId, devUserId, privateApi, 'unlimited', null, function () {
                request.patch(
                    {
                        url: baseUrl + 'applications/' + appId + '/subscriptions/' + privateApi,
                        headers: { 'X-UserId': adminUserId },
                        json: true,
                        body: { approved: true }
                    },
                    function (err, res, body) {
                        request(
                            {
                                url: baseUrl + 'approvals',
                                headers: { 'X-UserId': adminUserId }
                            },
                            function (err, res, body) {
                                utils.deleteSubscription(appId, devUserId, privateApi, function () {
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

        it('should not be possible to approve your own subscription requests', function (done) {
            utils.addSubscription(appId, devUserId, privateApi, 'unlimited', null, function () {
                request.patch(
                    {
                        url: baseUrl + 'applications/' + appId + '/subscriptions/' + privateApi,
                        headers: { 'X-UserId': devUserId },
                        json: true,
                        body: { approved: true }
                    },
                    function (err, res, body) {
                        utils.deleteSubscription(appId, devUserId, privateApi, function () {
                            assert.isNotOk(err);
                            assert.equal(403, res.statusCode);
                            done();
                        });
                    });
            });
        });

        it('should generate an apikey after approving', function (done) {
            utils.addSubscription(appId, devUserId, privateApi, 'unlimited', null, function () {
                request.patch(
                    {
                        url: baseUrl + 'applications/' + appId + '/subscriptions/' + privateApi,
                        headers: { 'X-UserId': adminUserId },
                        json: true,
                        body: { approved: true }
                    },
                    function (err, res, body) {
                        request(
                            {
                                url: baseUrl + 'applications/' + appId + '/subscriptions/' + privateApi,
                                headers: { 'X-UserId': devUserId }
                            },
                            function (err, res, body) {
                                utils.deleteSubscription(appId, devUserId, privateApi, function () {
                                    assert.isNotOk(err);
                                    assert.equal(200, res.statusCode);
                                    var jsonBody = utils.getJson(body);
                                    assert.isOk(jsonBody.approved);
                                    assert.isOk(jsonBody.apikey, "After approval, subscription must have an API key");
                                    done();
                                });
                            });
                    });
            });
        });

        it('should remove pending approvals if the subscription is deleted', function (done) {
            utils.addSubscription(appId, devUserId, privateApi, 'unlimited', null, function () {
                utils.deleteSubscription(appId, devUserId, privateApi, function () {
                    request(
                        {
                            url: baseUrl + 'approvals',
                            headers: { 'X-UserId': adminUserId }
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

        it('should remove pending approvals if the application is deleted', function (done) {
            utils.createApplication('second-app', 'Second App', devUserId, function () {
                utils.addSubscription('second-app', devUserId, privateApi, 'unlimited', null, function () {
                    utils.deleteApplication('second-app', devUserId, function () {
                        request(
                            {
                                url: baseUrl + 'approvals',
                                headers: { 'X-UserId': adminUserId }
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
    });
});