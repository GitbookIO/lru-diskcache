var Q = require('q');
var _ = require('lodash');
var fs = require('fs-extra');
var path = require('path');
var crc = require('crc');
var lru = require('lru-cache');
var fsWriteStream = require('fswrite-stream');

function DiskCache(rootPath, options) {
    if(!(this instanceof DiskCache)) {
        return new DiskCache(rootPath, options);
    }

    // Root folder to cache files in
    this.path = rootPath;

    // Options
    this.options = _.defaults(options || {}, {
        // Maximum size of the cache
        max: 10*1024*1024,

        // If maxEntries is defined, max is not taken in consideration
        maxEntries: null,

        // Maximum age in ms
        maxAge: undefined,

        onError: function(err) {
            console.error(err.stack);
        }
    });

    // Bind methods
    _.bindAll(this, _.keys(DiskCache.prototype));

    // Pending writes
    this.pending = {};

    // Setup LRU
    this.lru = lru({
        max: this.options.maxEntries || this.options.max,
        maxAge: this.options.maxAge,
        dispose: this._dispose,
        length: this._length
    });
}

// Initialize and prepare the cache
DiskCache.prototype.init = function() {
    this.reset();
};

// Reset the whole cache
DiskCache.prototype.reset = function() {
    var that = this;

    if (fs.existsSync(this.path)) {
        fs.removeSync(this.path);
    }

    fs.mkdirsSync(this.path);
    this.lru.reset();
};

// Return true if key exists
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

// Get data as a buffer or string
DiskCache.prototype.get = function(key, opts) {
    var that = this;
    opts = opts || {};

    return this.wait(key)
    .then(function(key) {
        return that._read(key, { encoding: opts.encoding });
    });
};

// Get a stream
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
    .then(function(size) {
        // Mark key as saved
        that.lru.set(key, size);

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

// Deletes a key out of the cache.
DiskCache.prototype.del = function(key) {
    this.lru.del(key);
};

// Return total size of objects in cache taking into account
DiskCache.prototype.size = function() {
    return this.lru.length;
};

// Manually iterates over the entire cache proactively pruning old entries
DiskCache.prototype.prune = function() {
    return this.lru.prune();
};

// What's the filename of a key on the disk ?
DiskCache.prototype._filename = function(key) {
    return path.join(
        this.path,
        crc.crc32(key).toString(16)
    );
};

DiskCache.prototype._read = function(key, opts) {
    var d = Q.defer();

    fs.readFile(this._filename(key), opts || {}, d.makeNodeResolver());

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

    fsWriteStream(this._filename(key), stream, d.makeNodeResolver());

    return d.promise;
};

DiskCache.prototype._writeData = function(key, data) {
    var d = Q.defer();
    var filename = this._filename(key);

    // Write data to disk
    fs.writeFile(filename, data, d.makeNodeResolver());

    return d.promise

    // Return size
    .then(function() {
        return Q.nfcall(fs.stat, filename)
            .get('size');
    });
};

//// Methods for lru-cache

DiskCache.prototype._dispose = function(key, value) {
    // If the file didn't go to disk there's nothing to destroy
    if(key in this.pending) {
        return;
    }

    try {
        fs.unlinkSync(this._filename(key));
    } catch(err) {
        this.options.onError(err);
    }
};

DiskCache.prototype._length = function(value, key) {
    // the value in memory is the size of the file
    return this.options.maxEntries? 1 : value;
};

module.exports = DiskCache;
