import * as rangeParser from 'range-parser';

// TS definition is wrong, so let's ignore it
const ReadableStreamEx = ReadableStream as any;

function cloneHeaders(headers: Headers): Headers {

    let newHeaders = new Headers();

    let keys = headers.forEach((value, key) => {
        newHeaders.append(key, value);
    })

    return newHeaders;
}


export default function checkForRangeRequest(req: Request, res: Response): Promise<Response> {

    return Promise.resolve()
        .then(() => {

            if (!res) {

                // cache.match() and the like will return null when there is no match
                // so rather than force people to do a null check, let's just immediately
                // return if there is no response

                return res;
            }

            let rangeHeader = req.headers.get('range');

            if (!rangeHeader) {

                // If it isn't a range request, cool, just send it
                // straight through.

                return res;
            }

            if (res.status === 216) {
                // This response is already partial, so we're good
                return res;
            }

            let contentLength = res.headers.get('content-length');

            if (!contentLength) {
                throw new Error("Response does not have a content length. Cannot use range.")
            }

            let ranges = rangeParser(parseInt(contentLength), rangeHeader);

            if (ranges === -2) {
                return new Response("Malformed range header", {
                    status: 400
                });
            } else if (ranges === -1) {
                return new Response("Unsatisfiable range", {
                    status: 416
                })
            }

            if (ranges.type !== "bytes") {
                throw new Error("Can only support byte ranges for now.");
            }
            if (ranges.length > 1) {
                throw new Error("Can only return a single range for now.")
            }

            let { start, end } = ranges[0];

            let newHeaders = cloneHeaders(res.headers);
            newHeaders.set("Content-Length", String(end - start + 1)); // end is inclusive
            newHeaders.set("Content-Range", `bytes ${start}-${end}/${contentLength}`);
            newHeaders.set("Accept-Ranges", "bytes");


            let reader: ReadableStreamReader;
            let currentReaderPosition: number;
            let controllerClosed: boolean;

            function performRead(controller: ReadableStreamController) {
                reader.read()
                    .then((readResponse: ReaderReadResult) => {

                        if (readResponse.done) {

                            // Our underlying stream is complete, so we can close this
                            // one too.

                            if (controllerClosed === false) {

                                // More than likely, this will have been closed below,
                                // where the last chunk is cut. But if our range matches
                                // exactly the size of a chunk, it won't have.

                                controllerClosed = true;
                                controller.close();
                            }

                            return;
                        }

                        // Get the start and end of our current read value.
                        let currentStart = currentReaderPosition;
                        let currentEnd = currentStart + readResponse.value.length;

                        // Now move the position along - that way, no matter what we return
                        // below, we know it's up to date.
                        currentReaderPosition += readResponse.value.length;

                        if (currentStart < start && currentEnd < start) {

                            // Before the part we want. So we return this function
                            // again - keeping the promise chain going until we reach
                            // the part of the response we want.
                            return performRead(controller);

                        } else if (currentStart > end) {

                            // We've gone past the end of what we want. So now we can close
                            // this stream *and* the underlying stream. Might save some bandwidth
                            // if a remote server doesn't support range requests.

                            controller.close();
                            controllerClosed = true;
                            return reader.cancel();

                        } else if (currentStart >= start && currentEnd < end) {

                            // This whole chunk is within our range, so we can very easily just
                            // push it directly into our stream.
                            controller.enqueue(readResponse.value);

                        } else if (currentStart >= start && currentEnd >= end) {

                            // We need this chunk, but it is longer than the length we're looking
                            // for. So we slice it and only return the first part.

                            let segment = readResponse.value.slice(0, end - currentStart + 1);
                            controller.enqueue(segment);

                        }
                        else if (currentStart < start && currentEnd >= end) {

                            // This one chunk is actually larger than the entire range we want.
                            // So we need to slice somewhere in the middle.

                            let startIndex = start - currentStart;
                            controller.enqueue(readResponse.value.slice(startIndex, startIndex + end - start + 1));

                        }
                        else if (currentStart < start && currentEnd > start) {

                            // So what's left? Yes - the case when we only need the end of a
                            // chunk. Much like before, we slice, except from some midpoint
                            // to the end (by not providing a second slice() parameter)

                            let sliceStart = start - currentStart;
                            let segment = readResponse.value.slice(sliceStart);
                            controller.enqueue(segment);

                        } else {
                            throw new Error("Unrecognised range error. File a bug!")
                        }

                    });
            }

            let responseStream = new ReadableStreamEx({

                start(controller: ReadableStreamController) {
                    // I don't know why we need to clone this, but this doesn't
                    // work if we don't
                    reader = res.clone().body!.getReader();
                    currentReaderPosition = 0;
                    controllerClosed = false;
                },

                pull(controller: ReadableStreamController) {


                    return performRead(controller);
                },
                cancel(reason: any) {

                }
            });

            return new Response(responseStream, {
                headers: newHeaders,
                status: 206
            });
        })


}