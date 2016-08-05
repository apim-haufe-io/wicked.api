var assert = require('chai').assert;
var request = require('request');
var utils = require('./testUtils');
var consts = require('./testConsts');

var baseUrl = consts.BASE_URL;

describe('/users', function () {

    var adminUserId = '';
    var devUserId = '';
    var noobUserId = '';

    describe('POST', function () {
        it('should return the new ID of a newly created user', function (done) {
            var myBody = {
                customId: 'xyz',
                firstName: 'Unit',
                lastName: 'Tester',
                email: 'foo@foo.foo',
                validated: true,
                groups: ["dev"]
            };
            request({
                method: 'POST',
                url: baseUrl + 'users',
                json: true,
                body: myBody
            },
                function (err, res, body) {
                    assert.equal(201, res.statusCode, "status code not 201");
                    jsonBody = utils.getJson(body);
                    devUserId = jsonBody.id;
                    assert.isOk(devUserId);
                    done();
                });
        });

        it('should return a 409 if the email address is duplicate.', function (done) {
            var myBody = {
                customId: 'zyx',
                firstName: 'Unit',
                lastName: 'Tester',
                email: 'foo@foo.foo',
                validated: true,
                groups: ["dev"]
            };
            request({
                method: 'POST',
                url: baseUrl + 'users',
                json: true,
                body: myBody
            },
                function (err, res, body) {
                    assert.equal(409, res.statusCode, "status code not 409, duplicate not detected");
                    done();
                });
        });

        it('should return a 409 if the custom ID is duplicate.', function (done) {
            var myBody = {
                customId: 'xyz',
                firstName: 'Unit',
                lastName: 'Tester',
                email: 'foo2@foo.foo',
                validated: true,
                groups: ["dev"]
            };
            request({
                method: 'POST',
                url: baseUrl + 'users',
                json: true,
                body: myBody
            },
                function (err, res, body) {
                    assert.equal(409, res.statusCode, "status code not 409, duplicate not detected");
                    done();
                });
        });

        it('should be possible to add a user without a group', function (done) {
            var myBody = {
                customId: '123',
                firstName: 'Noob',
                lastName: 'User',
                email: 'noob@noob.com',
                validated: false,
                groups: []
            };
            request({
                method: 'POST',
                url: baseUrl + 'users',
                json: true,
                body: myBody
            },
                function (err, res, body) {
                    assert.equal(201, res.statusCode, "status code not 201");
                    jsonBody = utils.getJson(body);
                    noobUserId = jsonBody.id;
                    assert.isOk(noobUserId);
                    done();
                });
        });

        it('should be possible to add an admin user', function (done) {
            var myBody = {
                customId: 'abc',
                firstName: 'Admin',
                lastName: 'User',
                email: 'admin@admin.com',
                validated: false,
                groups: ["admin"]
            };
            request({
                method: 'POST',
                url: baseUrl + 'users',
                json: true,
                body: myBody
            },
                function (err, res, body) {
                    assert.equal(201, res.statusCode, "status code not 201");
                    jsonBody = utils.getJson(body);
                    adminUserId = jsonBody.id;
                    assert.isOk(adminUserId);
                    done();
                });
        });

        it('should render OAuth credentials if belonging to correct group', function (done) {
            utils.createUser('OAuth', 'dev', true, function (userId) {
                utils.getUser(userId, function (userInfo) {
                    utils.deleteUser(userId, function () {
                        assert.isOk(userInfo);
                        assert.isOk(userInfo.clientId);
                        assert.isOk(userInfo.clientSecret);
                        done();
                    });
                });
            });
        });

        it('should not render OAuth credentials if not belonging to correct group', function (done) {
            utils.createUser('OAuth', null, false, function (userId) {
                utils.getUser(userId, function (userInfo) {
                    utils.deleteUser(userId, function () {
                        assert.isOk(userInfo);
                        assert.isNotOk(userInfo.clientId);
                        assert.isNotOk(userInfo.clientSecret);
                        done();
                    });
                });
            });
        });

        it('should not render OAuth credentials if not validated', function (done) {
            utils.createUser('OAuth', 'dev', false, function (userId) {
                utils.getUser(userId, function (userInfo) {
                    utils.deleteUser(userId, function () {
                        assert.isOk(userInfo);
                        assert.isNotOk(userInfo.clientId);
                        assert.isNotOk(userInfo.clientSecret);
                        done();
                    });
                });
            });
        });

        it('should not set the user group for a non-validated user', function (done) {
            utils.createUser('Whatever', null, false, function (userId) {
                utils.getUser(userId, function (userInfo) {
                    utils.deleteUser(userId, function () {
                        assert.isTrue(!userInfo.groups || userInfo.groups.length === 0);
                        done();
                    });
                });
            });
        });

        it('should set the user group for a validated user', function (done) {
            utils.createUser('Whatever', null, true, function (userId) {
                utils.getUser(userId, function (userInfo) {
                    utils.deleteUser(userId, function () {
                        assert.isOk(userInfo);
                        assert.isOk(userInfo.groups);
                        assert.equal(1, userInfo.groups.length);
                        assert.equal("dev", userInfo.groups[0]);
                        done();
                    });
                });
            });
        });
    }); // /users POST

    describe('GET', function () {
        it('should return a list of short infos', function (done) {
            request(
                {
                    url: baseUrl + 'users',
                    headers: { 'X-UserId': adminUserId }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    var jsonBody = utils.getJson(body);
                    // Admin and three Initial Users are predefined, we added three users
                    assert.equal(7, jsonBody.length);
                    done();
                }
            );
        });

        it('should return 403 if no user is passed', function (done) {
            request(
                {
                    url: baseUrl + 'users'
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(403, res.statusCode);
                    done();
                }
            );
        });

        it('should return 403 if non-admin user is passed', function (done) {
            request(
                {
                    url: baseUrl + 'users',
                    headers: { 'X-UserId': devUserId }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(403, res.statusCode);
                    done();
                }
            );
        });

        it('should return 400 if invalid user is passed', function (done) {
            request(
                {
                    url: baseUrl + 'users',
                    headers: { 'X-UserId': 'invaliduser' }
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(400, res.statusCode);
                    done();
                }
            );
        });

        it('should return a user by customId', function (done) {
            request(
                {
                    url: baseUrl + 'users?customId=xyz'
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    var jsonBody = utils.getJson(body);
                    assert.equal(1, jsonBody.length);
                    assert.equal("Unit Tester", jsonBody[0].name);
                    assert.equal(devUserId, jsonBody[0].id);
                    done();
                });
        });

        it('should return a 404 if customId is not found', function (done) {
            request(
                {
                    url: baseUrl + 'users?customId=invalidId'
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(404, res.statusCode);
                    done();
                });
        });

        it('should return a user by email', function (done) {
            request(
                {
                    url: baseUrl + 'users?email=noob@noob.com'
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    var jsonBody = utils.getJson(body);
                    assert.equal(1, jsonBody.length);
                    assert.equal('Noob User', jsonBody[0].name);
                    assert.equal(noobUserId, jsonBody[0].id);
                    done();
                });
        });

        it('should return a 404 if email is not found', function (done) {
            request(
                {
                    url: baseUrl + 'users?email=invalid@email.com'
                },
                function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(404, res.statusCode);
                    done();
                });
        });
    }); // /users GET

    describe('/<userId>', function () {
        describe('GET', function () {
            it('should return the user.', function (done) {
                request(
                    {
                        url: baseUrl + 'users/' + devUserId,
                        headers: { 'X-UserId': devUserId }
                    },
                    function (err, res, body) {
                        assert.equal(200, res.statusCode, 'status code not 200');
                        var jsonBody = utils.getJson(body);
                        assert.equal(devUserId, jsonBody.id);
                        done();
                    });
            });

            it('should return the user full name (generated).', function (done) {
                request(
                    {
                        url: baseUrl + 'users/' + devUserId,
                        headers: { 'X-UserId': devUserId }
                    },
                    function (err, res, body) {
                        assert.equal(200, res.statusCode, 'status code not 200');
                        var jsonBody = utils.getJson(body);
                        assert.equal(devUserId, jsonBody.id);
                        assert.isOk(jsonBody.name);
                        done();
                    });
            });

            it('should return valid HAL _links.', function (done) {
                request(
                    {
                        url: baseUrl + 'users/' + devUserId,
                        headers: { 'X-UserId': devUserId }
                    },
                    function (err, res, body) {
                        assert.equal(200, res.statusCode, 'status code not 200');
                        var jsonBody = utils.getJson(body);
                        assert.equal(devUserId, jsonBody.id);
                        assert.isOk(jsonBody._links);
                        assert.isOk(jsonBody._links.self);
                        assert.equal(jsonBody._links.self.href, '/users/' + devUserId);
                        done();
                    });
            });

            it('should return a 403 if X-UserId is not passed', function (done) {
                request(
                    { url: baseUrl + 'users/' + devUserId },
                    function (err, res, body) {
                        assert.equal(403, res.statusCode, 'status code not 403');
                        done();
                    });
            });

            it('should return a 403 if invalid X-UserId is passed', function (done) {
                request(
                    {
                        url: baseUrl + 'users/' + devUserId,
                        headers: { 'X-UserId': 'something invalid' }
                    },
                    function (err, res, body) {
                        assert.equal(403, res.statusCode, 'status code not 403');
                        done();
                    });
            });

            it('should return a 403 if X-UserId of different user is passed', function (done) {
                request(
                    {
                        url: baseUrl + 'users/' + devUserId,
                        headers: { 'X-UserId': noobUserId }
                    },
                    function (err, res, body) {
                        assert.equal(403, res.statusCode, 'status code not 403');
                        done();
                    });
            });

            it('should succeed if admin X-UserId is passed', function (done) {
                request(
                    {
                        url: baseUrl + 'users/' + devUserId,
                        headers: { 'X-UserId': adminUserId }
                    },
                    function (err, res, body) {
                        assert.equal(200, res.statusCode, 'status code not 200');
                        done();
                    });
            });

            it('should be able to read second user', function (done) {
                request(
                    {
                        url: baseUrl + 'users/' + noobUserId,
                        headers: { 'X-UserId': noobUserId }
                    },
                    function (err, res, body) {
                        assert.equal(200, res.statusCode, 'status code not 200');
                        done();
                    });
            });
        }); // /users/<userId> GET

        describe('PATCH', function () {
            it('should allow changing the name', function (done) {
                request(
                    {
                        method: 'PATCH',
                        url: baseUrl + 'users/' + noobUserId,
                        headers: { 'X-UserId': noobUserId },
                        json: true,
                        body: {
                            firstName: 'New',
                            lastName: 'Name',
                            email: 'new@new.com',
                            validated: true
                        }
                    },
                    function (err, res, body) {
                        assert.equal(200, res.statusCode);
                        var jsonBody = utils.getJson(body);
                        assert.equal('New', jsonBody.firstName);
                        assert.equal('Name', jsonBody.lastName);
                        assert.equal('new@new.com', jsonBody.email);
                        assert.equal(true, jsonBody.validated);
                        assert.equal('New Name', jsonBody.name);
                        done();
                    });
            });

            it('should allow changing the name', function (done) {
                request(
                    {
                        method: 'PATCH',
                        url: baseUrl + 'users/' + noobUserId,
                        headers: { 'X-UserId': noobUserId },
                        json: true,
                        body: {
                            firstName: 'New',
                            lastName: 'Name',
                            email: 'new@new.com',
                            validated: true
                        }
                    },
                    function (err, res, body) {
                        assert.isNotOk(err);
                        assert.equal(200, res.statusCode);
                        // Now GET the user and check it's okay
                        request(
                            {
                                url: baseUrl + 'users/' + noobUserId,
                                headers: { 'X-UserId': noobUserId }
                            },
                            function (err, res, body) {
                                assert.equal(200, res.statusCode);
                                var jsonBody = utils.getJson(body);
                                assert.equal('New', jsonBody.firstName);
                                assert.equal('Name', jsonBody.lastName);
                                assert.equal('new@new.com', jsonBody.email);
                                assert.equal(true, jsonBody.validated);
                                assert.equal('New Name', jsonBody.name);
                                done();
                            });
                    });
            });

            it('should forbid changing the custom ID', function (done) {
                request(
                    {
                        method: 'PATCH',
                        url: baseUrl + 'users/' + noobUserId,
                        headers: { 'X-UserId': noobUserId },
                        json: true,
                        body: { customId: 'fhkdjfhkdjf' }
                    },
                    function (err, res, body) {
                        assert.equal(400, res.statusCode);
                        done();
                    });
            });

            it('should forbid changing a different user', function (done) {
                request(
                    {
                        method: 'PATCH',
                        url: baseUrl + 'users/' + noobUserId,
                        headers: { 'X-UserId': devUserId },
                        json: true,
                        body: {
                            firstName: 'Helmer',
                            lastName: 'Fudd'
                        }
                    },
                    function (err, res, body) {
                        assert.equal(403, res.statusCode);
                        done();
                    });
            });

            it('... except if you\'re an admin', function (done) {
                request(
                    {
                        method: 'PATCH',
                        url: baseUrl + 'users/' + noobUserId,
                        headers: { 'X-UserId': adminUserId },
                        json: true,
                        body: {
                            firstName: 'Helmer',
                            lastName: 'Fudd'
                        }
                    },
                    function (err, res, body) {
                        assert.equal(200, res.statusCode);
                        var jsonBody = utils.getJson(body);
                        assert.equal('Helmer', jsonBody.firstName);
                        assert.equal('Fudd', jsonBody.lastName);
                        done();
                    });
            });

            it('should have actually changed things', function (done) {
                request(
                    {
                        url: baseUrl + 'users/' + noobUserId,
                        headers: { 'X-UserId': noobUserId }
                    },
                    function (err, res, body) {
                        assert.equal(200, res.statusCode, 'status code not 200');
                        var jsonBody = utils.getJson(body);
                        assert.equal('Helmer', jsonBody.firstName);
                        assert.equal('Fudd', jsonBody.lastName);
                        done();
                    });
            });

            it('should have actually changed things in the short list', function (done) {
                request(
                    {
                        url: baseUrl + 'users?customId=123'
                    },
                    function (err, res, body) {
                        assert.equal(200, res.statusCode, 'status code not 200');
                        var jsonBody = utils.getJson(body);
                        assert.equal(1, jsonBody.length);
                        assert.equal('Helmer Fudd', jsonBody[0].name);
                        assert.equal('new@new.com', jsonBody[0].email);
                        done();
                    });
            });
        }); // /users/<userId> PATCH

        describe('DELETE', function () {
            it('should return 404 if user does not exist', function (done) {
                request({
                    method: 'DELETE',
                    url: baseUrl + 'users/doesnotexist',
                    headers: { 'X-UserId': adminUserId }
                },
                    function (err, res, body) {
                        assert.equal(404, res.statusCode, 'status code not 404');
                        done();
                    });
            });

            it('should return 403 if user does not match X-UserId', function (done) {
                request({
                    method: 'DELETE',
                    url: baseUrl + 'users/' + devUserId,
                    headers: { 'X-UserId': noobUserId }
                },
                    function (err, res, body) {
                        assert.equal(403, res.statusCode, 'status code not 403');
                        done();
                    });
            });

            it('should return 403 if X-UserId is invalid', function (done) {
                request({
                    method: 'DELETE',
                    url: baseUrl + 'users/' + devUserId,
                    headers: { 'X-UserId': 'somethinginvalid' }
                },
                    function (err, res, body) {
                        assert.equal(403, res.statusCode, 'status code not 403');
                        done();
                    });
            });

            it('should return 409 if user has applications', function (done) {
                utils.createApplication('application', 'Application', devUserId, function () {
                    request.delete(
                        {
                            url: baseUrl + 'users/' + devUserId,
                            headers: { 'X-UserId': devUserId }
                        },
                        function (err, res, body) {
                            assert.isNotOk(err);
                            assert.equal(409, res.statusCode);
                            utils.deleteApplication('application', devUserId, function () {
                                done();
                            });
                        });
                });
            });

            it('should return 204 if successful', function (done) {
                request({
                    method: 'DELETE',
                    url: baseUrl + 'users/' + noobUserId,
                    headers: { 'X-UserId': noobUserId }
                },
                    function (err, res, body) {
                        assert.equal(204, res.statusCode);
                        done();
                    });
            });

            it('should allow admins to delete users', function (done) {
                request({
                    method: 'DELETE',
                    url: baseUrl + 'users/' + devUserId,
                    headers: { 'X-UserId': adminUserId }
                },
                    function (err, res, body) {
                        assert.equal(204, res.statusCode);
                        done();
                    });
            });

            it('should allow admins to delete themself', function (done) {
                request({
                    method: 'DELETE',
                    url: baseUrl + 'users/' + adminUserId,
                    headers: { 'X-UserId': adminUserId }
                },
                    function (err, res, body) {
                        assert.equal(204, res.statusCode);
                        done();
                    });
            });
        }); // /users/<userId> DELETE
    }); // /users/<userId>

    describe('with password,', function () {
        this.slow(500);

        var pwdUserId = '';
        var devUserId = '';

        after(function (done) {
            utils.deleteUser(pwdUserId, function () {
                utils.deleteUser(devUserId, done);
            });
        });

        it('should be possible to create a user with a password', function (done) {
            request.post(
                {
                    url: baseUrl + 'users',
                    json: true,
                    body: {
                        firstName: 'Secret',
                        lastName: 'User',
                        email: 'secret@user.com',
                        password: 'super$3cret!',
                        groups: [],
                        validated: true
                    }
                }, function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(201, res.statusCode);
                    var jsonBody = utils.getJson(body);
                    assert.isNotOk(jsonBody.password);
                    pwdUserId = jsonBody.id;
                    done();
                });
        });

        it('should be possible to login a user by email and password', function (done) {
            request.post({
                url: baseUrl + 'login',
                body: {
                    email: 'secret@user.com',
                    password: 'super$3cret!'
                },
                json: true
            }, function (err, res, body) {
                assert.isNotOk(err);
                assert.equal(200, res.statusCode);
                var jsonBody = utils.getJson(body);
                assert.equal(1, jsonBody.length);
                assert.equal(jsonBody[0].id, pwdUserId);
                assert.isNotOk(jsonBody[0].password);
                done();
            });
        });

        it('should return a 403 if email is correct and password wrong', function (done) {
            request.post({
                url: baseUrl + 'login',
                body: {
                    email: 'secret@user.com',
                    password: 'super$3cret'
                },
                json: true
            }, function (err, res, body) {
                assert.isNotOk(err);
                assert.equal(403, res.statusCode);
                done();
            });
        });

        it('should be possible to update the password', function (done) {
            request.patch({
                url: baseUrl + 'users/' + pwdUserId,
                headers: { 'X-UserId': pwdUserId },
                json: true,
                body: {
                    password: 'm0re$3kriT!'
                }
            }, function (err, res, body) {
                assert.isNotOk(err);
                assert.equal(200, res.statusCode);
                var jsonBody = utils.getJson(body);
                assert.isNotOk(jsonBody.password);
                done();
            });
        });

        it('should be possible to retrieve a user by email and the new password', function (done) {
            request({
                url: baseUrl + 'users',
                qs: {
                    email: 'secret@user.com',
                    password: 'm0re$3kriT!'
                }
            }, function (err, res, body) {
                assert.isNotOk(err);
                assert.equal(200, res.statusCode);
                var jsonBody = utils.getJson(body);
                assert.equal(1, jsonBody.length);
                assert.equal(jsonBody[0].id, pwdUserId);
                assert.isNotOk(jsonBody[0].password);
                done();
            });
        });

        it('should return a 400 if user has no password', function (done) {
            utils.createUser('Whatever', 'dev', true, function (userId) {
                devUserId = userId;
                request.post({
                    url: baseUrl + 'login',
                    body: {
                        email: 'whatever@random.org',
                        password: 'doesntmatter'
                    },
                    json: true
                }, function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(400, res.statusCode);
                    done();
                });
            });
        });

        it('should return a 404 if user email is not found', function (done) {
            request({
                url: baseUrl + 'users',
                qs: {
                    email: 'whenever@random.org',
                    password: 'doesntmatter'
                }
            }, function (err, res, body) {
                assert.isNotOk(err);
                assert.equal(404, res.statusCode);
                done();
            });
        });

        it('should not allow too short passwords', function (done) {
            request.post(
                {
                    url: baseUrl + 'users',
                    json: true,
                    body: {
                        firstName: 'Secret',
                        lastName: 'User',
                        email: 'secret@user.com',
                        password: 'short',
                        groups: [],
                        validated: true
                    }
                }, function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(400, res.statusCode);
                    done();
                });
        });

        it('should not allow too long passwords', function (done) {
            request.post(
                {
                    url: baseUrl + 'users',
                    json: true,
                    body: {
                        firstName: 'Secret',
                        lastName: 'User',
                        email: 'secret@user.com',
                        password: '1234567890123456789012345',
                        groups: [],
                        validated: true
                    }
                }, function (err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(400, res.statusCode);
                    done();
                });
        });

        it('should be possible to log in as the predefined user', function (done) {
            request.post({
                url: baseUrl + 'login',
                body: {
                    email: 'initial@user.com',
                    password: 'password'
                },
                json: true
            }, function (err, res, body) {
                assert.isNotOk(err);
                assert.equal(200, res.statusCode);
                var jsonBody = utils.getJson(body);
                assert.equal(1, jsonBody.length);
                assert.equal(jsonBody[0].id, '1234567890');
                assert.isNotOk(jsonBody[0].password);
                done();
            });
        });

        it('should be possible to remove the password from a user', function (done) {
            request.delete({
                url: baseUrl + 'users/1234567890/password',
                headers: { 'X-UserId': '1' }
            }, function (err, res, body) {
                assert.isNotOk(err);
                assert.equal(204, res.statusCode);
                done();
            });
        });

        it('should not be possible to log in to this user after removing password', function (done) {
            request.post({
                url: baseUrl + 'login',
                body: {
                    email: 'initial@user.com',
                    password: 'password'
                },
                json: true
            }, function (err, res, body) {
                assert.isNotOk(err);
                assert.equal(400, res.statusCode);
                done();
            });
        });

        it('should be possible to re-define the password', function (done) {
            request.patch({
                url: baseUrl + 'users/1234567890',
                json: true,
                body: { password: 'password' },
                headers: { 'X-UserId': '1' }
            }, function (err, res, body) {
                assert.isNotOk(err);
                assert.equal(200, res.statusCode);
                done();
            });
        });

        it('should be possible to log in as the predefined user again after re-defining password', function (done) {
            request.post({
                url: baseUrl + 'login',
                body: {
                    email: 'initial@user.com',
                    password: 'password'
                },
                json: true
            }, function (err, res, body) {
                assert.isNotOk(err);
                assert.equal(200, res.statusCode);
                var jsonBody = utils.getJson(body);
                assert.equal(1, jsonBody.length);
                assert.equal(jsonBody[0].id, '1234567890');
                assert.isNotOk(jsonBody[0].password);
                done();
            });
        });
    });
}); // /users
