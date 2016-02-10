# lru-diskcache

A disk cache object that deletes the least-recently-used items. Based on [lru-cache](https://github.com/isaacs/node-lru-cache).

### Usage

```js
var LRU = require("lru-diskcache")

var cache = LRU({
    max: 50
});

cache.set("myfile.md", "A string content")
cache.get("file") // Buffer("A string content")

// with a buffer or stream
cache.set("image.png", new Buffer([ ... ]))
cache.set("index.html", request.get("https://www.google.fr"))

cache.reset()    // empty the cache
```

If you put more stuff in it, then items will fall out.

If you try to put an oversized thing in it, then it'll fall out right away.

### API

```js
// Get content as a buffer
cache.get(key)

// Get content as a string
cache.get(key, { encoding: 'utf8' })

// Get content as a stream
cache.getStream(key)

// Check if a key is in the cache, without updating the recent-ness or deleting it for being stale.
cache.has(key)

// Delete a key from the cache
cache.del(key)
```
