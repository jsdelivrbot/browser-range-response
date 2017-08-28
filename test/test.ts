import checkForRangeRequest from "../src/index";
import "mocha";
import * as expectLib from "../node_modules/expect.js";

// stupid TS definitions
let expect = (expectLib as any) as (any) => Expect.Root;

mocha.setup({
    ui: "bdd"
});

xdescribe("Existing browser behaviour (should fail)", function() {
    afterEach(() => {
        return caches.delete("test-cache");
    });
    it("Should ignore ranged request headers", function() {
        let testResponse = new Response("this is a test response", {
            headers: {
                "Content-Length": 23
            }
        });
        let testRequest = new Request("/test");
        return caches.open("test-cache").then(cache => {
            return cache
                .put(testRequest, testResponse)
                .then(() => {
                    let rangedRequest = new Request("/test", {
                        headers: {
                            Range: "bytes=0-3"
                        }
                    });

                    return cache.match(rangedRequest);
                })
                .then(res => {
                    // Should equal 3! But we want this test to pass as a method of
                    // tracking existing browser behaviour.
                    expect(res.headers.get("Content-Length")).to.equal("3");
                    return res.text();
                })
                .then(text => {
                    expect(text).to.equal("thi");
                });
        });
    });
});

describe("Ranged Request handler", function() {
    it("should pass a non-ranged request through without touching it", function() {
        let testResponse = new Response("this is a test response", {
            headers: {
                "Content-Length": 23
            }
        });
        let testRequest = new Request("/test");

        return checkForRangeRequest(testRequest, testResponse)
            .then(res => {
                return res!.text();
            })
            .then(body => {
                expect(body).to.be("this is a test response");
            });
    });

    it("should cut a response from the start", function() {
        let testResponse = new Response("this is a test response", {
            headers: {
                "Content-Length": 23
            }
        });
        let testRequest = new Request("/test", {
            headers: {
                Range: "bytes=0-3"
            }
        });

        return checkForRangeRequest(testRequest, testResponse)
            .then(res => {
                expect(res!.headers.get("content-length")).to.equal("4");
                return res!.text();
            })
            .then(body => {
                expect(body).to.equal("this");
            });
    });

    it("should cut a response from the middle", function() {
        let testResponse = new Response("this is a test response", {
            headers: {
                "Content-Length": 23
            }
        });
        let testRequest = new Request("/test", {
            headers: {
                Range: "bytes=5-8"
            }
        });

        return checkForRangeRequest(testRequest, testResponse)
            .then(res => {
                expect(res!.headers.get("content-length")).to.be("4");
                return res!.text();
            })
            .then(body => {
                expect(body).to.be("is a");
            });
    });

    it("should cut a response from the end", function() {
        let testResponse = new Response("this is a test response", {
            headers: {
                "Content-Length": 23
            }
        });
        let testRequest = new Request("/test", {
            headers: {
                Range: "bytes=15-"
            }
        });

        return checkForRangeRequest(testRequest, testResponse)
            .then(res => {
                expect(res!.headers.get("content-length")).to.equal("8");
                return res!.text();
            })
            .then(body => {
                expect(body).to.be("response");
            });
    });

    it("should work with large responses", function() {
        let responseString = "";
        let i = 0;
        while (i < 10000) {
            i++;
            responseString += "aaaaaaaaaa";
        }

        let testResponse = new Response(responseString, {
            headers: {
                "Content-Length": responseString.length
            }
        });
        let testRequest = new Request("/test", {
            headers: {
                Range: "bytes=80000-80019"
            }
        });

        return checkForRangeRequest(testRequest, testResponse)
            .then(res => {
                expect(res!.headers.get("content-length")).to.equal("20");
                return res!.text();
            })
            .then(body => {
                expect(body).to.be("aaaaaaaaaaaaaaaaaaaa");
            });
    });
});

describe("Cache", function() {
    afterEach(() => {
        return caches.delete("test-cache");
    });

    function storeFullResponse() {
        let testResponse = new Response("TEST", {
            headers: {
                "content-length": 4,
                "accept-ranges": "bytes"
            }
        });
        let testRequest = new Request("/test");

        return caches.open("test-cache").then(cache => {
            return cache.put(testRequest, testResponse);
        });
    }

    it("should not allow caching of partial responses", function() {
        let partialResponse = new Response("TEST", {
            status: 206,
            headers: {
                "accept-ranges": "bytes",
                "content-range": "bytes 0-3/10"
            }
        });

        let caught: Error;

        return caches
            .open("test-cache")
            .then(cache => {
                return cache.put(new Request("/test"), partialResponse);
            })
            .catch(err => {
                caught = err;
            })
            .then(() => {
                expect(caught).to.be.ok();
            });
    });

    it("should cache a full response, return full even when partial is requested", function() {
        return storeFullResponse()
            .then(() => {
                let partialRequest = new Request("/test", {
                    headers: {
                        Range: "bytes=0-1"
                    }
                });
                return caches
                    .open("test-cache")
                    .then(cache => cache.match(partialRequest));
            })
            .then(response => {
                expect(response).to.be.ok();
                expect(response.headers.get("content-length")).to.equal("4");
                expect(response.status).to.equal(200);
                return response.text();
            })
            .then(text => {
                expect(text).to.equal("TEST");
            });
    });

    it("should cache full response, and trim it when handler is used", function() {
        return storeFullResponse()
            .then(() => {
                let partialRequest = new Request("/test", {
                    headers: {
                        Range: "bytes=0-1"
                    }
                });
                return caches
                    .open("test-cache")
                    .then(cache => cache.match(partialRequest))
                    .then(res => checkForRangeRequest(partialRequest, res));
            })
            .then(response => {
                expect(response).to.be.ok();
                expect(response.headers.get("content-length")).to.equal("2");
                expect(response.status).to.equal(206);
                return response.text();
            })
            .then(text => {
                expect(text).to.equal("TE");
            });
    });
});

describe("Compare with server", function() {
    it("should return same response from server as through handler", function() {
        let partialOptions = {
            headers: {
                Range: "bytes=60000-60249"
            }
        };

        return fetch("/test-file", partialOptions).then(partialRes => {
            expect(partialRes.headers.get("content-length")).to.equal("250");

            return fetch("/test-file").then(fullRes => {
                let freshRequest = new Request("/test-file", partialOptions);

                return checkForRangeRequest(
                    freshRequest,
                    fullRes
                ).then(manualPartialRes => {
                    return Promise.all([
                        partialRes.text(),
                        manualPartialRes!.text()
                    ]).then(results => {
                        expect(results[0]).to.equal(results[1]);
                    });
                });
            });
        });
    });

    // Can't cancel fetches, of course. D'oh.

    // it("should cancel a response when we're done with it", function () {
    //     return fetch('/test-file?slow=1')
    //         .then((res) => {

    //             let partialRequest = new Request("/test-file?slow=1", {
    //                 headers: {
    //                     range: 'bytes=20000-20249'
    //                 }
    //             });

    //             return checkForRangeRequest(partialRequest, res)
    //                 .then((res) => {
    //                     expect(res.headers.get('content-length')).to.equal('250')
    //                     return res.text()
    //                         .then(() => {

    //                         })
    //                 })
    //         })
    // })
});

mocha.run();
