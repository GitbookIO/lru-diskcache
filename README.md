# lru-diskcache

[![Build Status](https://travis-ci.org/GitbookIO/lru-diskcache.svg?branch=master)](https://travis-ci.org/GitbookIO/lru-diskcache)

A disk cache object that deletes the least-recently-used items. Based on [lru-cache](https://github.com/isaacs/node-lru-cache).

### Usage

```js
var LRU = require("lru-diskcache")

var cache = LRU('./cache', {
    max: 50
});

cache.init()

cache.set("myfile.md", "A string content")
cache.get("file").then(function() { ... }) // Buffer("A string content")

// with a buffer or stream
cache.set("image.png", new Buffer([ ... ]))
cache.set("index.html", request.get("https://www.google.fr"))

cache.reset()    // empty the cache
```

If you put more stuff in it, then items will fall out.

If you try to put an oversized thing in it, then it'll fall out right away.

### API

```js
// Initialize the cache
cache.init()

// Get content as a buffer (return a promise)
cache.get(key)

// Get content as a string
cache.get(key, { encoding: 'utf8' })

// Get content as a stream (return a promise)
cache.getStream(key)

// Check if a key is in the cache, without updating the recent-ness or deleting it for being stale.
cache.has(key)

// Delete a key from the cache
cache.del(key)

// Return total length of objects in cache taking into account
cache.size()

// Manually iterates over the entire cache proactively pruning old entries
cache.prune()
```
