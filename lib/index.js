var Q = require('q');
var _ = require('lodash');
var fs = require('fs-extra');
var path = require('path');
var crypto = require('crypto');
var destroy = require('destroy');
var lru = require('lru-cache');

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

        // Maximum age in ms
        maxAge: undefined,

        onError: function(err) {
            console.error(err.stack);
        }
    });

    // Bind methods
    _.bindAll(this);

    // Pending writes
    this.pending = {};

    // Setup LRU
    this.lru = lru({
        max: this.options.max,
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
    .then(function() {
        return Q.nfcall(fs.stat, that._filename(key));
    })
    .then(function(stat) {
        // Mark key as saved
        that.lru.set(key, stat.size);

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
        sha1(key)
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
    console.log('')
    // the value in memory is the size of the file
    return value;
};

function sha1(data) {
    var sum = crypto.createHash('sha1');
    sum.update(data);
    return sum.digest('hex');
}

module.exports = DiskCache;
