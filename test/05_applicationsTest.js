var assert = require('chai').assert;
var request = require('request');
var utils = require('./testUtils');
var consts = require('./testConsts');

var baseUrl = consts.BASE_URL;

describe('/applications', function () {

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

    describe('POST', function () {
        it('should be possible to create a new application', function (done) {
            request.post(
                {
                    url: baseUrl + 'applications',
                    headers: { 'X-UserId': devUserId },
                    json: true,
                    body: {
                        id: 'application',
                        name: 'Application'
                    }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(201, res.statusCode);
                    var jsonBody = utils.getJson(body);
                    assert.isOk(jsonBody);
                    utils.deleteApplication('application', devUserId, function () {
                        done();
                    });
                });
        });

        it('should not be possible to add a duplicate appId', function (done) {
            request.post(
                {
                    url: baseUrl + 'applications',
                    headers: { 'X-UserId': devUserId },
                    json: true,
                    body: {
                        id: appId,
                        name: appName
                    }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(409, res.statusCode);
                    done();
                });
        });

        it('should not be possible to create a new application without user', function (done) {
            request.post(
                {
                    url: baseUrl + 'applications',
                    json: true,
                    body: {
                        id: 'application',
                        name: 'Application'
                    }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(403, res.statusCode);
                    done();
                });
        });

        it('should not be possible to create a new application with invalid user', function (done) {
            request.post(
                {
                    url: baseUrl + 'applications',
                    headers: { 'X-UserId': 'invaliduser' },
                    json: true,
                    body: {
                        id: 'application',
                        name: 'Application'
                    }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(403, res.statusCode);
                    done();
                });
        });

        it('should rule out invalid appId characters', function (done) {
            request.post(
                {
                    url: baseUrl + 'applications',
                    headers: { 'X-UserId': devUserId },
                    json: true,
                    body: {
                        id: 'my-app$id',
                        name: appName
                    }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(400, res.statusCode);
                    done();
                });
        });

        it('should rule out too short appIds', function (done) {
            request.post(
                {
                    url: baseUrl + 'applications',
                    headers: { 'X-UserId': devUserId },
                    json: true,
                    body: {
                        id: 'app',
                        name: appName
                    }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(400, res.statusCode);
                    done();
                });
        });

        it('should rule out too long appIds', function (done) {
            request.post(
                {
                    url: baseUrl + 'applications',
                    headers: { 'X-UserId': devUserId },
                    json: true,
                    body: {
                        id: 'app456789012345678901',
                        name: appName
                    }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(400, res.statusCode);
                    done();
                });
        });

        it('should be possible to create a new application with 4 char appId', function (done) {
            request.post(
                {
                    url: baseUrl + 'applications',
                    headers: { 'X-UserId': devUserId },
                    json: true,
                    body: {
                        id: 'appl',
                        name: appName
                    }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(201, res.statusCode);
                    var jsonBody = utils.getJson(body);
                    assert.isOk(jsonBody);
                    utils.deleteApplication('appl', devUserId, function () {
                        done();
                    });
                });
        });

        it('should be possible to create a new application with 20 char appId', function (done) {
            request.post(
                {
                    url: baseUrl + 'applications',
                    headers: { 'X-UserId': devUserId },
                    json: true,
                    body: {
                        id: 'appl5678901234567890',
                        name: appName
                    }
                },
                function (err, res, body) {
                    utils.deleteApplication('appl5678901234567890', devUserId, function () {
                        assert.isNotOk(err);
                        assert.equal(201, res.statusCode);
                        var jsonBody = utils.getJson(body);
                        assert.isOk(jsonBody);
                        done();
                    });
                });
        });
    }); // POST

    describe('GET', function () {
        it('should set the user as owner of the application', function (done) {
            request(
                {
                    url: baseUrl + 'applications/' + appId,
                    headers: { 'X-UserId': devUserId }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    var jsonBody = utils.getJson(body);
                    assert.isOk(jsonBody);
                    assert.equal(1, jsonBody.owners.length);
                    assert.equal(jsonBody.owners[0].userId, devUserId);
                    done();
                });
        });
        it('should provide correct _links', function (done) {
            request(
                {
                    url: baseUrl + 'applications/' + appId,
                    headers: { 'X-UserId': devUserId }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    var jsonBody = utils.getJson(body);
                    assert.isOk(jsonBody);
                    assert.isOk(jsonBody._links);
                    assert.isOk(jsonBody._links.self);
                    assert.equal(jsonBody._links.self.href, '/applications/' + appId);
                    assert.equal(1, jsonBody.owners.length);
                    var owner = jsonBody.owners[0];
                    assert.isOk(owner._links);
                    assert.isOk(owner._links.user);
                    assert.equal(owner._links.user.href, '/users/' + devUserId);
                    done();
                });
        });

        it('should let an admin retrieve the application', function (done) {
            request(
                {
                    url: baseUrl + 'applications/' + appId,
                    headers: { 'X-UserId': adminUserId }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    done();
                });
        });

        it('should not let a different user retrieve the application', function (done) {
            request(
                {
                    url: baseUrl + 'applications/' + appId,
                    headers: { 'X-UserId': noobUserId }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(403, res.statusCode);
                    done();
                });
        });

        it('should not let an invalid user retrieve the application', function (done) {
            request(
                {
                    url: baseUrl + 'applications/' + appId,
                    headers: { 'X-UserId': 'invaliduser' }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(403, res.statusCode);
                    done();
                });
        });
    }); // GET

    describe('PATCH', function () {
        it('should allow for changing an application name', function (done) {
            request.patch(
                {
                    url: baseUrl + 'applications/' + appId,
                    headers: { 'X-UserId': devUserId },
                    json: true,
                    body: {
                        id: appId,
                        name: 'A different name'
                    }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    var jsonBody = utils.getJson(body);
                    assert.equal('A different name', jsonBody.name);
                    done();
                });
        });

        it('should not allow for changing an application name for other user', function (done) {
            request.patch(
                {
                    url: baseUrl + 'applications/' + appId,
                    headers: { 'X-UserId': noobUserId },
                    json: true,
                    body: {
                        id: appId,
                        name: 'A different name'
                    }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(403, res.statusCode);
                    done();
                });
        });

        it('should allow for changing an application name for admin user', function (done) {
            request.patch(
                {
                    url: baseUrl + 'applications/' + appId,
                    headers: { 'X-UserId': adminUserId },
                    json: true,
                    body: {
                        id: appId,
                        name: 'A different name'
                    }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    done();
                });
        });

        /*
        it('sometimes takes some debugging', function(done) {
            request(
                {
                    url: baseUrl + 'users',
                    headers: { 'X-UserId': adminUserId }
                },
                function(err, res, body) {
                    assert.equal(200, res.statusCode);
                    console.log(body);
                    done();
                });
        });
        */

        it('should allow for changing an application name for co-owner', function (done) {
            utils.addOwner(appId, devUserId, "noob@random.org", "owner", function () {
                request.patch(
                    {
                        url: baseUrl + 'applications/' + appId,
                        headers: { 'X-UserId': noobUserId },
                        json: true,
                        body: {
                            id: appId,
                            name: 'A different name'
                        }
                    },
                    function (err, res, body) {
                        assert.isNotOk(err);
                        assert.equal(200, res.statusCode);
                        done();
                    });
            });
        });
    }); // PATCH

    describe('DELETE', function () {
        it('should return 404 if application is not found', function (done) {
            request.delete(
                {
                    url: baseUrl + 'applications/unknownApp',
                    headers: { 'X-UserId': adminUserId }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(404, res.statusCode);
                    done();
                });
        });

        it('should not allow delete for unknown userId', function (done) {
            request.delete(
                {
                    url: baseUrl + 'applications/' + appId,
                    headers: { 'X-UserId': 'invaliduser' }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(403, res.statusCode);
                    done();
                });
        });

        it('should not allow delete without userId', function (done) {
            request.delete(
                {
                    url: baseUrl + 'applications/' + appId
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(403, res.statusCode);
                    done();
                });
        });

        it('should return 204 if successful', function (done) {
            utils.createApplication('otherapp', 'My Application', devUserId, function () {
                request.delete(
                    {
                        url: baseUrl + 'applications/otherapp',
                        headers: { 'X-UserId': devUserId }
                    },
                    function (err, res, body) {
                        assert.isNotOk(err);
                        assert.equal(204, res.statusCode);
                        done();
                    });
            });
        });

        it('should allow co-owners to delete applications', function (done) {
            utils.createApplication('otherapp', 'My Application', devUserId, function () {
                utils.addOwner('otherapp', devUserId, 'noob@random.org', 'owner', function () {
                    request.delete(
                        {
                            url: baseUrl + 'applications/otherapp',
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

        it('should not allow collaborators to delete application', function (done) {
            utils.addOwner(appId, devUserId, 'noob@random.org', 'collaborator', function () {
                request.delete(
                    {
                        url: baseUrl + 'applications/' + appId,
                        headers: { 'X-UserId': noobUserId }
                    },
                    function (err, res, body) {
                        assert.isNotOk(err);
                        assert.equal(403, res.statusCode);
                        done();
                    });
            });
        });

        it('should not allow readers to delete application', function (done) {
            utils.addOwner(appId, devUserId, 'noob@random.org', 'reader', function () {
                request.delete(
                    {
                        url: baseUrl + 'applications/' + appId,
                        headers: { 'X-UserId': noobUserId }
                    },
                    function (err, res, body) {
                        assert.isNotOk(err);
                        assert.equal(403, res.statusCode);
                        done();
                    });
            });
        });

        it('should remove application from owner', function (done) {
            utils.createApplication('otherapp', 'My Application', noobUserId, function () {
                utils.deleteApplication('otherapp', noobUserId, function () {
                    request(
                        {
                            url: baseUrl + 'users/' + noobUserId,
                            headers: { 'X-UserId': noobUserId }
                        },
                        function (err, res, body) {
                            assert.isNotOk(err);
                            assert.equal(200, res.statusCode);
                            var jsonBody = utils.getJson(body);
                            assert.equal(0, jsonBody.applications.length);
                            done();
                        });
                });
            });
        });

        it('should remove application from collaborator', function (done) {
            utils.createApplication('otherapp', 'My Application', devUserId, function () {
                utils.addOwner('otherapp', devUserId, 'noob@random.org', 'collaborator', function () {
                    utils.deleteApplication('otherapp', devUserId, function () {
                        request(
                            {
                                url: baseUrl + 'users/' + noobUserId,
                                headers: { 'X-UserId': noobUserId }
                            },
                            function (err, res, body) {
                                assert.isNotOk(err);
                                assert.equal(200, res.statusCode);
                                var jsonBody = utils.getJson(body);
                                assert.equal(0, jsonBody.applications.length);
                                done();
                            });
                    });
                });
            });
        }); // DELETE
    }); // /applications

    describe('/roles', function() {
        it('should return a list of roles (3)', function(done) {
            request(
                {
                    url: baseUrl + 'applications/roles'
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    var jsonBody = utils.getJson(body);
                    assert.equal(3, jsonBody.length);
                    done();
                });
        });
    }); // /applications/roles

    describe('/<appId>/owners', function () {
        describe('POST', function() {
            it('should be possible to add an owner', function (done) {
                request.post(
                    {
                        url: baseUrl + 'applications/' + appId + '/owners',
                        headers: { 'X-UserId': devUserId },
                        json: true,
                        body: {
                            email: 'admin@random.org',
                            role: 'owner'
                        }
                    },
                    function (err, res, body) {
                        //console.log(body);
                        assert.isNotOk(err);
                        assert.equal(201, res.statusCode);
                        done();
                    });
            });

            it('should be possible for co-owners to add a collaborator', function (done) {
                utils.addOwner(appId, devUserId, 'noob@random.org', 'owner', function() {
                    request.post(
                        {
                            url: baseUrl + 'applications/' + appId + '/owners',
                            headers: { 'X-UserId': noobUserId },
                            json: true,
                            body: {
                                email: 'admin@random.org',
                                role: 'collaborator'
                            }
                        },
                        function (err, res, body) {
                            //console.log(body);
                            assert.isNotOk(err);
                            assert.equal(201, res.statusCode);
                            done();
                        });
                });
            });
            
            it('should not be allowed for collaborators to add owners', function(done) {
                utils.addOwner(appId, devUserId, 'noob@random.org', 'collaborator', function() {
                    request.post(
                        {
                            url: baseUrl + 'applications/' + appId + '/owners',
                            headers: { 'X-UserId': noobUserId },
                            json: true,
                            body: {
                                email: 'admin@random.org',
                                role: 'collaborator'
                            }
                        },
                        function (err, res, body) {
                            //console.log(body);
                            assert.isNotOk(err);
                            assert.equal(403, res.statusCode);
                            done();
                        });
                });
            });
            
            it('should reflect in the users applications after he was added', function (done) {
                utils.addOwner(appId, devUserId, 'noob@random.org', 'reader', function() {
                    utils.getUser(noobUserId, function(user) {
                        // console.log(utils.getText(user));
                        assert.equal(1, user.applications.length);
                        assert.equal(appId, user.applications[0].id);
                        done();
                    });
                });
            });
        }); // /owners POST
        
        describe('DELETE', function() {
            it('should be possible for an owner to delete a co-owner', function(done) {
                utils.addOwner(appId, devUserId, 'noob@random.org', 'owner', function() {
                    request.delete(
                        {
                            url: baseUrl + 'applications/' + appId + '/owners?userEmail=noob@random.org',
                            headers: { 'X-UserId': devUserId }
                        },
                        function(err, res, body) {
                            assert.isNotOk(err);
                            assert.equal(200, res.statusCode);
                            done();
                        });
                });
            });

            it('should be possible for a co-owner to delete an owner', function(done) {
                utils.addOwner(appId, devUserId, 'noob@random.org', 'owner', function() {
                    request.delete(
                        {
                            url: baseUrl + 'applications/' + appId + '/owners?userEmail=dev@random.org',
                            headers: { 'X-UserId': noobUserId }
                        },
                        function(err, res, body) {
                            // We have to re-add devUserId as owner to fulfill postcondition (for afterEach)
                            utils.addOwner(appId, noobUserId, 'dev@random.org', 'owner', function() {
                                assert.isNotOk(err);
                                assert.equal(200, res.statusCode);
                                done();
                            });
                        });
                });
            });

            it('should not be possible for a collaborator to delete an owner', function(done) {
                utils.addOwner(appId, devUserId, 'noob@random.org', 'collaborator', function() {
                    request.delete(
                        {
                            url: baseUrl + 'applications/' + appId + '/owners?userEmail=dev@random.org',
                            headers: { 'X-UserId': noobUserId }
                        },
                        function(err, res, body) {
                            assert.isNotOk(err);
                            assert.equal(403, res.statusCode);
                            done();
                        });
                });
            });
                        
            it('should not be possible to delete the last owner', function(done) {
                request.delete(
                    {
                        url: baseUrl + 'applications/' + appId + '/owners?userEmail=dev@random.org',
                        headers: { 'X-UserId': devUserId }
                    },
                    function(err, res, body) {
                        assert.isNotOk(err);
                        assert.equal(409, res.statusCode);
                        done();
                    }
                );
            });

            it('should react gracefully to non-existing user emails', function(done) {
                request.delete(
                    {
                        url: baseUrl + 'applications/' + appId + '/owners?userEmail=non@existing.com',
                        headers: { 'X-UserId': devUserId }
                    },
                    function(err, res, body) {
                        assert.isNotOk(err);
                        assert.equal(400, res.statusCode);
                        done();
                    }
                );
            });

            it('should not allow deleting owners without giving a user', function(done) {
                utils.addOwner(appId, devUserId, 'noob@random.org', 'collaborator', function() {
                request.delete(
                    {
                        url: baseUrl + 'applications/' + appId + '/owners?userEmail=noob@random.org',
                    },
                    function(err, res, body) {
                        assert.isNotOk(err);
                        assert.equal(403, res.statusCode);
                        done();
                    });
                });
            });
        }); // DELETE
    });
});
