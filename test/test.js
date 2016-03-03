var Q = require('q');
var tmp = require('tmp');
var path = require('path');
var Stream = require('stream');
var fs = require('fs');
require('should');

var LRU = require('../');

function createCache(opts) {
    var tmpobj = tmp.dirSync();
    var cache = LRU(tmpobj.name, opts);
    cache.init();

    return cache;
}


describe('Diskcache', function() {
    var cache = createCache();

    describe('#set', function() {
        it('should accept a string', function() {
            return cache.set('test_string', 'hello');
        });

        it('should accept a buffer', function() {
            return cache.set('test_buffer', new Buffer('hello', 'utf8'));
        });

        it('should accept a strean', function() {
            return cache.set('test_stream', fs.createReadStream(path.join(__dirname, '../package.json')));
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

    describe('#getStream', function() {
        it('should return a stream', function() {
            return cache.getStream('test_string').should.be.finally.an.instanceof(Stream);
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

    describe('#del', function() {
        it('should remove the key', function() {
            cache.del('test_string');
            cache.has('test_string').should.equal(false);
        });
    });

    describe('#size', function() {
        var lcache = createCache({
            max: 10
        });

        before(function() {
            return lcache.set('test', 'hello');
        });

        it('should return total length of cache', function() {
            lcache.size().should.equal(5);
        });

        it('should correctly limit size', function() {
            return lcache.set('test2', 'hello 2')
            .then(function() {
                lcache.has('test').should.equal(false);
                lcache.size().should.equal(7);
            });
        })
    });

    describe('#entries', function() {
        var lcache = createCache({
            maxEntries: 3
        });

        before(function() {
            return lcache.set('test', 'hello')
            .then(function() {
                return lcache.set('test2', 'hello2');
            })
            .then(function() {
                return lcache.set('test3', 'hello3');
            });
        });

        it('should return total number of keys in cache', function() {
            lcache.size().should.equal(3);
        });

        it('should correctly limit size', function() {
            return lcache.set('test4', 'hello4')
            .then(function() {
                lcache.size().should.equal(3);
                lcache.has('test').should.equal(false);
            });
        })
    });

});

