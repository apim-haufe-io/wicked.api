var assert = require('chai').assert;
var request = require('request');
var utils = require('./testUtils');
var consts = require('./testConsts');

var baseUrl = consts.BASE_URL;

describe('/plans', function() {
    describe('GET', function() {
        it('should return all plans', function(done) {
            request({
                url: baseUrl + 'plans'
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    var jsonBody = utils.getJson(body);
                    assert.isOk(jsonBody.plans);
                    assert.equal(6, jsonBody.plans.length);                    
                    done(); 
                });
        });

        it('should return also the internal health Plan', function(done) {
            request({
                url: baseUrl + 'plans'
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    var jsonBody = utils.getJson(body);
                    assert.isOk(jsonBody.plans);
                    var foundHealthPlan = false;
                    for (var i=0; i<jsonBody.plans.length; ++i) {
                        if ("__internal_health" == jsonBody.plans[i].id)
                            foundHealthPlan = true;
                    }
                    assert.isOk(foundHealthPlan);
                    done(); 
                });
        });
        
        it('should not care about logged in users', function(done) {
            request({
                url: baseUrl + 'plans',
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
                url: baseUrl + 'plans'
                },
                function(err, res, body) {
                    assert.isNotOk(err);
                    assert.equal(200, res.statusCode);
                    var jsonBody = utils.getJson(body);
                    assert.isOk(jsonBody._links);
                    assert.isOk(jsonBody._links.self);
                    assert.equal(jsonBody._links.self.href, '/plans');                    
                    done(); 
                });
        });
    });
});