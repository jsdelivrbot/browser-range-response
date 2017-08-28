# browser-range-response

## Why?

While experimenting with [`CacheStorage`](https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage) 
in service workers, I discovered that if we use `cache.add()` / `cache.put()`
on a full HTTP `Response`, that response is returned by `cache.match()` even
if the request it is matching is for partial content. 

This seems to cause problems for the browser - I was using it with an `<audio>` tag,
which uses partial content requests extensively when seeking back and forth. Despite
the fact that the entire response was available, I could no longer set `currentTime`
and have the file seek immediately. 

## What does this do?

This library manually constructs partial responses from full ones, given any request.
If the request does not contains a `Range` header it will simply pass through the
response untouched. But if it does, it uses `Response.body.getReader()` to grab a
`ReadableStreamReader`, and listen for the data as it passes through - discarding
the data it doesn't need, and piping the data it does need through a new stream.

## How do I use it?

First off, install it:

    npm install browser-range-response

The most common usage for this is in response to a service worker `fetch` event.
Simply add it to the end of the promise chain you've used to identify responses,
like so:

    import checkForRangeRequest from 'browser-range-response';

    self.addEventListener('fetch', function(e) {
        e.respondWith(
            caches.match(e.request)
            .then(function (res) {
                return checkForRangeRequest(e.request, res);
            })
            .then(function(res) {
                if (res) {
                    return res;
                } else {

                    // No cached version, go to remote
                    return fetch(e.request);
                }
            })
        )
    })

While this will work fine with remote responses (i.e. those from `fetch()`) I don't 
recommend using it that way, as you might end up making multiple full requests when
you don't mean to. The code outlined above only uses the check for cached responses.

## Testing

To test the library, clone this repo, run `npm install`, then `npm test`. This will
set up a server, and a Browserify watch script to recompile the code whenever you
make a change. Go to `http://localhost:4001` in your browser to run the Mocha tests
there.