var assert = require('chai').assert;
var request = require('request');
var utils = require('./testUtils');
var consts = require('./testConsts');

var baseUrl = consts.BASE_URL;

describe('/verifications', function() {
    it('should be possible to create a new email verification request', function(done) {
        request.post({
            url: baseUrl + 'verifications',
            body: {
                type: 'email',
                email: 'unvalidated@user.com',
                userId: '9876543210'
            },
            json: true
        }, function(err, res, body) {
            assert.isNotOk(err);
            assert.equal(204, res.statusCode);
            done();
        });
    });

    it('should, as a normal user, not be possible to retrieve the verifications', function (done) {
        request.get({
            url: baseUrl + 'verifications',
            headers: { 'X-UserId': '9876543210' }
        }, function(err, res, body) {
            assert.isNotOk(err);
            assert.equal(403, res.statusCode);
            done(); 
        });
    });
    
    var verifId;
    
    it('should, as an admin, be possible to retrieve the verifications', function (done) {
        request.get({
            url: baseUrl + 'verifications',
            headers: { 'X-UserId': '1' }
        }, function(err, res, body) {
            assert.isNotOk(err);
            assert.equal(200, res.statusCode);
            var jsonBody = utils.getJson(body);
            assert.equal(1, jsonBody.length);
            verifId = jsonBody[0].id;
            done(); 
        });
    });
    
    it('should be possible to retrieve the verification by id without user', function (done) {
        request.get({
            url: baseUrl + 'verifications/' + verifId
        }, function (err, res, body) {
            assert.isNotOk(err);
            assert.equal(200, res.statusCode);
            done();
        });
    });

    it('should not be possible to patch a user\'s name with the validation ID as authorization', function (done) {
        request.patch({
            url: baseUrl + 'users/9876543210',
            body: {
                firstName: 'Validated'
            },
            json: true,
            headers: { 'X-VerificationId': verifId }
        }, function (err, res, body) {
            assert.isNotOk(err);
            assert.equal(400, res.statusCode);
            done();  
        });
    });
    
    it('should be possible to patch a user with the validation ID as authorization', function (done) {
        request.patch({
            url: baseUrl + 'users/9876543210',
            body: {
                validated: true
            },
            json: true,
            headers: { 'X-VerificationId': verifId }
        }, function (err, res, body) {
            assert.isNotOk(err);
            assert.equal(204, res.statusCode);
            done();  
        });
    });

    it('should be possible to patch a user password with the validation ID as authorization', function (done) {
        this.slow(500);
        request.patch({
            url: baseUrl + 'users/9876543210',
            body: {
                password: 'othersomething'
            },
            json: true,
            headers: { 'X-VerificationId': verifId }
        }, function (err, res, body) {
            assert.isNotOk(err);
            assert.equal(204, res.statusCode);
            done();  
        });
    });
        
    it('should render a validated user after that', function (done) {
        request.get({
            url: baseUrl + 'users/9876543210',
            headers: { 'X-UserId': '9876543210' }
        }, function (err, res, body) {
            assert.isNotOk(err);
            assert.equal(200, res.statusCode);
            var jsonBody = utils.getJson(body);
            assert.equal(true, jsonBody.validated);
            done();
        });
    });
    
    it('should be possible to delete a verification without authorization', function (done) {
        request.delete({
            url: baseUrl + 'verifications/' + verifId
        }, function (err, res, body) {
            assert.isNotOk(err);
            assert.equal(204, res.statusCode);
            done();
        });
    });
    
    it('should return a 404 for GET if the verification ID is invalid, e.g. already deleted', function (done) {
        request.get({
            url: baseUrl + 'verifications/' + verifId
        }, function (err, res, body) {
            assert.isNotOk(err);
            assert.equal(404, res.statusCode);
            done();
        });
    });
});