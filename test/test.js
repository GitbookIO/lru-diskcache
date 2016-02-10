var tmp = require('tmp');
var path = require('path');
var fs = require('fs');
require('should');

var LRU = require('../');

function createCache(max) {
    var tmpobj = tmp.dirSync();
    var cache = LRU(tmpobj.name, {
        max: max
    })
    cache.init();

    return cache;
}


describe('Diskcache', function() {
    var cache = createCache();

    describe('#set', function() {
        it('should accept a string', function() {
            cache.set('test_string', 'hello');
        });

        it('should accept a buffer', function() {
            cache.set('test_buffer', new Buffer('hello', 'utf8'));
        });

        it('should accept a strean', function() {
            cache.set('test_stream', fs.createReadStream(path.join(__dirname, '../package.json')));
        });
    });

    describe('#get', function() {
        it('should read as a buffer', function() {
            return cache.get('test_string').should.be.finally.an.instanceof(Buffer);
        });

        it('should accept an encoding options', function() {
            return cache.get('test_string', { encoding: 'utf8' }).should.be.finally.a.String;
        });
    });

    describe('#has', function() {
        it('should return false if key doesn\'t exists', function() {
            cache.has('test_nonexistant').should.equal(false);
        });

        it('should return true if key exists', function() {
            cache.has('test_string').should.equal(true);
        });
    });

});

