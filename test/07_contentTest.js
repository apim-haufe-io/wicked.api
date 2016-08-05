var assert = require('chai').assert;
var request = require('request');
var utils = require('./testUtils');
var consts = require('./testConsts');

var baseUrl = consts.BASE_URL;

describe('/content', function() {
    
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
    
    function hasValidMetaHeader(response) {
        try {
            var metaInfo64 = response.headers['x-metainfo'];
            if (!metaInfo64)
                return false;
            var metaInfo = JSON.parse(new Buffer(metaInfo64, 'base64'));
            return true;
        } catch (err) {
            throw Error("Could not extract meta information: " + err);
        }
    }
    
    function isMarkdown(response) {
        var contentType = response.headers['content-type'];
        if (!contentType)
            return false;
        return contentType.startsWith('text/markdown');
    }
    
    describe('GET', function() {
        it('should return the index for empty subpaths', function(done) {
            request(
                {
                    uri: baseUrl + 'content'
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    assert.isTrue(hasValidMetaHeader(res));
                    assert.isTrue(isMarkdown(res));
                    done();
                });
        });
        
        it('should ignore invalid X-UserId for the index', function(done) {
            request(
                {
                    uri: baseUrl + 'content',
                    headers: { 'X-UserId': 'somethinginvalid' }
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    assert.isTrue(hasValidMetaHeader(res));
                    assert.isTrue(isMarkdown(res));
                    done();
                });
        });
        
        it('should return a 404 if resource is not found', function(done) {
            request(
                {
                    uri: baseUrl + 'content/invaliduri'
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(404, res.statusCode);
                    done();
                });
        });
        
        it('should return unrestricted resources without user id', function(done) {
            request(
                {
                    uri: baseUrl + 'content/example'
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    assert.isTrue(hasValidMetaHeader(res));
                    assert.isTrue(isMarkdown(res));
                    done();
                });
        });
        
        it('should return unrestricted resources with valid user id', function(done) {
            request(
                {
                    uri: baseUrl + 'content/example',
                    headers: { 'X-UserId': devUserId }
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    assert.isTrue(hasValidMetaHeader(res));
                    assert.isTrue(isMarkdown(res));
                    done();
                });
        });

        it('should allow access to restricted resources for users belonging to the group', function(done) {
            request(
                {
                    uri: baseUrl + 'content/restricted',
                    headers: { 'X-UserId': devUserId }
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    assert.isTrue(hasValidMetaHeader(res));
                    assert.isTrue(isMarkdown(res));
                    done();
                });
        });
        
        it('should allow access to restricted resources for admins', function(done) {
            request(
                {
                    uri: baseUrl + 'content/restricted',
                    headers: { 'X-UserId': adminUserId }
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    assert.isTrue(hasValidMetaHeader(res));
                    assert.isTrue(isMarkdown(res));
                    done();
                });
        });
        
        it('should return a 403 if user groups prevents access', function(done) {
            request(
                {
                    uri: baseUrl + 'content/restricted',
                    headers: { 'X-UserId': noobUserId }
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(403, res.statusCode);
                    done();
                });
        });
        
        it('should return a 403 if accessing restricted content without user', function(done) {
            request(
                {
                    uri: baseUrl + 'content/restricted'
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(403, res.statusCode);
                    done();
                });
        });

        it('should return image resources without authentication', function(done) {
            request(
                {
                    uri: baseUrl + 'content/images/animal.jpg'
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    done();
                });
        });
        
        it('should return image resources even with invalid authentication', function(done) {
            request(
                {
                    uri: baseUrl + 'content/images/animal.jpg',
                    headers: { 'X-UserId': 'invaliduserid' }
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    done();
                });
        });

        it('should return correct content types for images', function(done) {
            request(
                {
                    uri: baseUrl + 'content/images/animal.jpg'
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    assert.isTrue(res.headers['content-type'].startsWith('image/jpeg'));
                    done();
                });
        });
    });
});