var assert = require('chai').assert;
var request = require('request');
var utils = require('./testUtils');
var consts = require('./testConsts');

var baseUrl = consts.BASE_URL;

describe('/ping', function() {
    describe('GET', function() {
        it('should return an OK message', function(done) {
            request({ url: baseUrl + 'ping' },
            function(err, res, body) {
                assert.isNotOk(err);
                assert.equal(200, res.statusCode);
                var jsonBody = utils.getJson(body);
                assert.equal('OK', jsonBody.message);
                done();
            });
        });
    });
});

describe('/globals', function () {
    it('should return global settings with correctly replaced env vars', function (done) {
        request({ url: baseUrl + 'globals' },
        function (err, res, body) {
            assert.isNotOk(err);
            assert.equal(200, res.statusCode);
            var jsonBody = utils.getJson(body);
            assert.equal('Portal Title', jsonBody.title);
            assert.equal('Recursive Recursive Recursive', jsonBody.footer);
            done();
        });
    });
});