var Q = require('q');
var fs = require('fs');
var mkdirp = require('mkdirp');
var path = require('path');
var crypto = require('crypto');
var destroy = require('destroy');

var _ = require('lodash');
var lru = require('lru-cache');

function DiskCache(rootPath, lruOptions) {
    if(!(this instanceof DiskCache)) {
        return new DiskCache(rootPath, lruOptions);
    }

    // Root folder to cache files in
    this.path = rootPath;

    // Bind methods
    _.bindAll(this);

    // Setup options correctly
    var options = _.defaults(lruOptions || {}, {
        dispose: this._dispose
    });

    // Pending writes
    this.pending = {};

    // Setup LRU
    this.lru = lru(options);
}

DiskCache.prototype.init = function() {
    // Dir exists, no need to create
    if(fs.existsSync(this.path)) return;

    // Dir does not exist, must be created
    mkdirp.sync(this.path);
};

DiskCache.prototype.has = function(key) {
    return this.lru.has(key);
};

// Wait's until a potential set is finished
// So you know when it's safe to write
DiskCache.prototype.wait = function(key) {
    // Return pending promise
    if(key in this.pending) {
        return this.pending[key];
    }

    // Update recentness
    this.lru.get(key);

    // No pending set, you're good to go
    return Q(key);
};

// Get data
DiskCache.prototype.get = function(key) {
    return this.wait(key)
    .then(this._read);
};

// Get a streams
DiskCache.prototype.getStream = function(key) {
    return this.wait(key)
    .then(this._readStream);
};

// Writes a data or stream to disk
DiskCache.prototype.set = function(key, dataOrStream) {
    var that = this;

    // Return pending promise promise
    if(key in this.pending) {
        return this.pending[key];
    }

    // Promise of writes etc ...
    var p = this._write(key, dataOrStream)
    .then(function() {
        // Mark key as saved
        that.lru.set(key, 'done');

        // Cleanup pending
        delete that.pending[key];

        // Return key
        return key;
    }, function(err) {
        // Remove key due to a failed write
        that.lru.del(key);

        // Cleanup pending
        delete that.pending[key];

        // Throw error
        throw err;
    });

    // Set promise as pending for now
    this.pending[key] = p;

    // Return promise
    return p;
};

// What's the filename of a key on the disk ?
DiskCache.prototype._filename = function(key) {
    return path.join(
        this.path,
        sha1(key)
    );
};

DiskCache.prototype._read = function(key) {
    var d = Q.defer();

    fs.readFile(this._filename(key), d.makeNodeResolver());

    return d.promise;
};

DiskCache.prototype._readStream = function(key) {
    return Q(fs.createReadStream(this._filename(key)));
};


DiskCache.prototype._write = function(key, dataOrStream) {
    return (
        // Is this a stream ?
        (dataOrStream.pipe !== undefined) ?

        // If so, write as stream to disk
        this._writeStream(key, dataOrStream) :

        // Else, write as buffer to disk
        this._writeData(key, dataOrStream)
    );
};

DiskCache.prototype._writeStream = function(key, stream) {
    var d = Q.defer();

    var w = fs.createWriteStream(this._filename(key));
    var cleanup = function() {
        destroy(w);
        w.removeAllListeners();
    };

    w.once('error', function(err) { cleanup(); d.reject(err); });
    w.once('finish', function() { cleanup(); d.resolve(); });

    // Pipe stream to file
    stream.pipe(w);

    return d.promise;
};

DiskCache.prototype._writeData = function(key, data) {
    var d = Q.defer();

    // Write data to disk
    fs.writeFile(this._filename(key), data, d.makeNodeResolver());

    return d.promise;
};

DiskCache.prototype._dispose = function(key, value) {
    // If the file didn't go to disk there's nothing to destroy
    if(key in this.pending) {
        return;
    }

    try {
        fs.unlinkSync(this._filename(key));
    } catch(err) {
        logger.error('Failed unlinking', key);
        logger.exception(err);
    }
};

function sha1(data) {
    var sum = crypto.createHash('sha1');
    sum.update(data);
    return sum.digest('hex');
}

module.exports = DiskCache;