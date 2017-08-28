const express = require("express");
const sendSeekable = require("send-seekable");
const serveStatic = require("serve-static");
const PassThrough = require("stream").PassThrough;

var serve = serveStatic(__dirname + "/test", {
    index: ["index.html", "index.htm"]
});
var app = express();

app.use(serve);
app.use(sendSeekable);

app.get("/test-file", (req, res, next) => {
    let stream = new PassThrough();

    // just sufficiently random that we'll be able to tell if our range indexing is incorrect
    let textToRepeat =
        "asdfadsfw345r2w43e95rwjuslkdnvgb;xsfkiprgbhna94euyt5aq9-p30w4orth;pwrsghnzdsfbg";

    res.set("Cache-Control", "no-cache");

    let i = 0;
    if (req.query.slow) {
        function doSend() {
            i++;
            if (i === 1000) {
                stream.push(null);
            } else {
                stream.push(textToRepeat);
                setTimeout(doSend, 10);
            }
        }
        doSend();
    } else {
        while (i < 1000) {
            i++;
            stream.push(textToRepeat);
        }
        stream.push(null);
    }

    res.sendSeekable(stream, {
        length: textToRepeat.length * 1000
    });
});

app.listen(4001);
console.log("Test server listening on port 4001...");
