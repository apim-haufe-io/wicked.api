var assert = require('chai').assert;
var request = require('request');
var utils = require('./testUtils');
var consts = require('./testConsts');

var baseUrl = consts.BASE_URL;

describe('/apis', function () {
    
    var devUserId = '';
    var adminUserId = '';
    var noobUserId = '';
    
    // Let's create some users to play with
    before(function (done) {
        utils.createUser('Dev', 'dev', true, function (id) {
            devUserId = id;
            utils.createUser('Admin', 'admin', true, function (id) {
                adminUserId = id;
                utils.createUser('Noob', null, false, function (id) {
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
    
    describe('GET', function () {
        it('should return all matching APIs for a logged in user', function (done) {
            request({
                url: baseUrl + 'apis',
                headers: { 'X-UserId' : devUserId } },
                function(err, res, body) {
                    assert.isNotOk(err);
                    var jsonBody = utils.getJson(body);
                    assert.equal(5, jsonBody.apis.length);
                    assert.equal(200, res.statusCode);
                    done();
                });
        });
        
        it('should only return public APIs if not logged in', function(done) {
            request({
                url: baseUrl + 'apis' },
                function(err, res, body) {
                    assert.isNotOk(err);
                    var jsonBody = utils.getJson(body);
                    assert.equal(2, jsonBody.apis.length);
                    assert.equal(200, res.statusCode);
                    done();
                });
        });
        
        it('should only return public APIs if user does not have required group', function(done) {
            request({
                url: baseUrl + 'apis',
                headers: { 'X-UserId' : noobUserId } },
                function(err, res, body) {
                    assert.isNotOk(err);
                    var jsonBody = utils.getJson(body);
                    assert.equal(2, jsonBody.apis.length);
                    assert.equal(200, res.statusCode);
                    done();
                });
        });

        it('should return 403 if invalid user id is passed', function(done) {
            request({
                url: baseUrl + 'apis',
                headers: { 'X-UserId' : 'somethinginvalid' } },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(403, res.statusCode);
                    done();
                });
        });

        it('should not return the health API for a normal user', function (done) {
            request({
                url: baseUrl + 'apis',
                headers: { 'X-UserId' : devUserId } },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    var jsonBody = utils.getJson(body);
                    var healthApi = jsonBody.apis.find(function (a) { return a.id == 'portal-health'; } );
                    assert.isNotOk(healthApi);
                    done();
                });
        });

        it('should return the health API for an admin user', function (done) {
            request({
                url: baseUrl + 'apis',
                headers: { 'X-UserId' : adminUserId } },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    var jsonBody = utils.getJson(body);
                    var healthApi = jsonBody.apis.find(function (a) { return a.id == 'portal-health'; } );
                    assert.isOk(healthApi);
                    done();
                });
        });
    }); // /apis GET

    describe('/<apiID>', function() {
        it('should return a JSON representation', function(done) {
            request(
                {
                    uri: baseUrl + 'apis/brilliant'
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode, 'Body: ' + utils.getText(body));
                    assert.isTrue(res.headers['content-type'].startsWith('application/json'));
                    done(); 
                });            
        });
        
        it('should return a 404 if the API is not known', function(done) {
            request(
                {
                    uri: baseUrl + 'apis/invalidapi'
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(404, res.statusCode);
                    done(); 
                });            
        });

        it('should return a 403 for group-less users if the API is restricted', function(done) {
            request(
                {
                    uri: baseUrl + 'apis/users',
                    headers: { 'X-UserId': noobUserId }
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(403, res.statusCode);
                    done(); 
                });            
        });

        it('should succeed for users of right group if the API is restricted', function(done) {
            request(
                {
                    uri: baseUrl + 'apis/users',
                    headers: { 'X-UserId': devUserId }
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    assert.isTrue(res.headers['content-type'].startsWith('application/json'));
                    done(); 
                });            
        });

        it('should succeed for admin users if the API is restricted', function(done) {
            request(
                {
                    uri: baseUrl + 'apis/users',
                    headers: { 'X-UserId': adminUserId }
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    assert.isTrue(res.headers['content-type'].startsWith('application/json'));
                    done(); 
                });            
        });
    });
    
    describe('/desc', function() {
        it('should return the generic description', function(done) {
            request(
                {
                    url: baseUrl + 'apis/desc'
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    assert.isTrue(res.headers['content-type'].startsWith('text/markdown'));
                    done();
                });
        });
    });
    
    describe('/<apiID>/config', function() {
        it('should return a JSON config representation', function(done) {
            request(
                {
                    uri: baseUrl + 'apis/superduper/config'
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    assert.isTrue(res.headers['content-type'].startsWith('application/json'));
                    done(); 
                });            
        });
        
        it('should return a 404 if the API is not known', function(done) {
            request(
                {
                    uri: baseUrl + 'apis/invalidapi/config'
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(404, res.statusCode);
                    done(); 
                });            
        });
    });

    describe('/<apiID>/desc', function() {
        it('should return a markdown representation', function(done) {
            request(
                {
                    uri: baseUrl + 'apis/brilliant/desc'
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    assert.isTrue(res.headers['content-type'].startsWith('text/markdown'));
                    done(); 
                });            
        });
        
        it('should return a 404 if the API is not known', function(done) {
            request(
                {
                    uri: baseUrl + 'apis/invalidapi/desc'
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(404, res.statusCode);
                    done(); 
                });            
        });

        it('should return a 403 for group-less users if the API is restricted', function(done) {
            request(
                {
                    uri: baseUrl + 'apis/users/desc',
                    headers: { 'X-UserId': noobUserId }
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(403, res.statusCode);
                    done(); 
                });            
        });

        it('should succeed for users of right group if the API is restricted', function(done) {
            request(
                {
                    uri: baseUrl + 'apis/users/desc',
                    headers: { 'X-UserId': devUserId }
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    assert.isTrue(res.headers['content-type'].startsWith('text/markdown'));
                    done(); 
                });            
        });

        it('should succeed for admin users if the API is restricted', function(done) {
            request(
                {
                    uri: baseUrl + 'apis/users/desc',
                    headers: { 'X-UserId': adminUserId }
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    assert.isTrue(res.headers['content-type'].startsWith('text/markdown'));
                    done(); 
                });            
        });
    });

    describe('/<apiID>/swagger', function() {
        it('should return a JSON swagger representation', function(done) {
            request(
                {
                    uri: baseUrl + 'apis/brilliant/swagger'
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode, 'Body: ' + utils.getText(body));
                    assert.isTrue(res.headers['content-type'].startsWith('application/json'));
                    done(); 
                });            
        });
        
        it('should return a 404 if the API is not known', function(done) {
            request(
                {
                    uri: baseUrl + 'apis/invalidapi/swagger'
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(404, res.statusCode);
                    done(); 
                });            
        });

        it('should return a 403 for group-less users if the API is restricted', function(done) {
            request(
                {
                    uri: baseUrl + 'apis/users/swagger',
                    headers: { 'X-UserId': noobUserId }
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(403, res.statusCode);
                    done(); 
                });            
        });

        it('should succeed for users of right group if the API is restricted', function(done) {
            request(
                {
                    uri: baseUrl + 'apis/users/swagger',
                    headers: { 'X-UserId': devUserId }
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    assert.isTrue(res.headers['content-type'].startsWith('application/json'));
                    done(); 
                });            
        });

        it('should succeed for admin users if the API is restricted', function(done) {
            request(
                {
                    uri: baseUrl + 'apis/users/swagger',
                    headers: { 'X-UserId': adminUserId }
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    assert.isTrue(res.headers['content-type'].startsWith('application/json'));
                    done(); 
                });            
        });
    });

    describe('/:apiId/plans', function () {
        it('must not be possible to retrieve restricted plans without corresponding groups', function (done) {
            request({
                uri: baseUrl + 'apis/orders/plans',
                headers: { 'X-UserId': devUserId }
            }, function (err, res, body) {
                assert.isNotOk(err);
                assert.equal(200, res.statusCode);
                var jsonBody = utils.getJson(body);
                assert.equal(0, jsonBody.length);
                done();
            });
        });

        it('must be possible to retrieve restricted plans as an admin', function (done) {
            request({
                uri: baseUrl + 'apis/orders/plans',
                headers: { 'X-UserId': adminUserId }
            }, function (err, res, body) {
                assert.isNotOk(err);
                assert.equal(200, res.statusCode);
                var jsonBody = utils.getJson(body);
                assert.equal(2, jsonBody.length);
                done();
            });
        });

        it('should be possible to see restricted plans if in right group', function (done) {
            utils.setGroups(devUserId, ["dev", "superdev"], function () {
                request({
                    uri: baseUrl + 'apis/orders/plans',
                    headers: { 'X-UserId': devUserId }
                }, function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    var jsonBody = utils.getJson(body);
                    assert.equal(2, jsonBody.length);
                    done();
                });
            });
        });
    });
});