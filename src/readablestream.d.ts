interface ReadableStreamController {
    enqueue(data: any);
    close();
    error(e: Error);
    desiredSize: number;
}

interface ReadableStreamConstructorOptions {
    start(ReadableStreamController);
    pull(ReadableStreamController);
    cancel(any);
}

interface ReaderReadResult {
    done: boolean;
    value: Uint8Array;
}

interface ReadableStreamExtend {
    new (ReadableStreamConstructorOptions, number?);
}