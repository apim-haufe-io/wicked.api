var assert = require('chai').assert;
var request = require('request');
var utils = require('./testUtils');
var consts = require('./testConsts');

var baseUrl = consts.BASE_URL;

describe('/groups', function() {
    describe('GET', function() {
        it('should return all groups', function(done) {
            request({
                url: baseUrl + 'groups'
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    var jsonBody = utils.getJson(body);
                    assert.isOk(jsonBody.groups);
                    assert.equal(3, jsonBody.groups.length);                    
                    done(); 
                });
        });
        
        it('should not care about logged in users', function(done) {
            request({
                url: baseUrl + 'groups',
                headers: { 'X-UserId': 'somethinginvalid' }
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    done(); 
                });
        });

        it('should return valid _links', function(done) {
            request({
                url: baseUrl + 'groups'
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    var jsonBody = utils.getJson(body);
                    assert.isOk(jsonBody._links);
                    assert.isOk(jsonBody._links.self);
                    assert.equal(jsonBody._links.self.href, '/groups');                    
                    done(); 
                });
        });
    });
});