# quoted-printable
Fast, robust RFC 2045 (Quoted-Printable) and RFC 2047 (Q-Encoding) encoder/decoder for Buffers in pure Javascript with an optional C++ binding. Avoids intermediary string allocations and regular expressions. Reduces branching through the use of lookup tables.

## Installation

#### Linux, OS X
This will compile the native binding automatically:
```
npm install @ronomon/quoted-printable
```

#### Windows
This will skip compiling the native binding automatically:
```
npm install --ignore-scripts @ronomon/quoted-printable
```

## Performance
```
           CPU: Intel(R) Xeon(R) CPU E3-1245 V2 @ 3.40GHz
         Cores: 8
       Threads: 1

============================================================

        Encode: 32768 x 32 Bytes
    Javascript: Latency: 0.003ms Throughput: 8.59 MB/s
        Native: Latency: 0.003ms Throughput: 10.81 MB/s

        Encode: 8192 x 128 Bytes
    Javascript: Latency: 0.006ms Throughput: 19.42 MB/s
        Native: Latency: 0.003ms Throughput: 33.83 MB/s

        Encode: 2048 x 512 Bytes
    Javascript: Latency: 0.017ms Throughput: 28.34 MB/s
        Native: Latency: 0.008ms Throughput: 58.25 MB/s

        Encode: 512 x 2048 Bytes
    Javascript: Latency: 0.063ms Throughput: 31.78 MB/s
        Native: Latency: 0.025ms Throughput: 80.66 MB/s

        Encode: 128 x 8192 Bytes
    Javascript: Latency: 0.244ms Throughput: 33.83 MB/s
        Native: Latency: 0.091ms Throughput: 95.33 MB/s

        Encode: 32 x 32768 Bytes
    Javascript: Latency: 0.970ms Throughput: 33.83 MB/s
        Native: Latency: 0.352ms Throughput: 95.33 MB/s

============================================================

        Decode: 32768 x 32 Bytes
    Javascript: Latency: 0.003ms Throughput: 19.89 MB/s
        Native: Latency: 0.002ms Throughput: 25.34 MB/s

        Decode: 8192 x 128 Bytes
    Javascript: Latency: 0.005ms Throughput: 61.42 MB/s
        Native: Latency: 0.003ms Throughput: 90.99 MB/s

        Decode: 2048 x 512 Bytes
    Javascript: Latency: 0.011ms Throughput: 107.33 MB/s
        Native: Latency: 0.005ms Throughput: 205.72 MB/s

        Decode: 512 x 2048 Bytes
    Javascript: Latency: 0.037ms Throughput: 129.93 MB/s
        Native: Latency: 0.015ms Throughput: 308.59 MB/s

        Decode: 128 x 8192 Bytes
    Javascript: Latency: 0.148ms Throughput: 130.03 MB/s
        Native: Latency: 0.054ms Throughput: 352.93 MB/s

        Decode: 32 x 32768 Bytes
    Javascript: Latency: 0.575ms Throughput: 137.31 MB/s
        Native: Latency: 0.210ms Throughput: 353.07 MB/s
```

## Native Binding (Optional)
The native binding will be installed automatically when installing `@ronomon/quoted-printable` without the `--ignore-scripts` argument. The Javascript binding will be used if the native binding could not be compiled or is not available. To compile the native binding manually after installing, install [node-gyp](https://www.npmjs.com/package/node-gyp) globally:
```
sudo npm install node-gyp -g
```
Then build the binding from within the `@ronomon/quoted-printable` module directory:
```
cd node_modules/@ronomon/quoted-printable
node-gyp rebuild
```

## Usage

#### Encoding
```javascript
var QuotedPrintable = require('@ronomon/quoted-printable');
var string = ' = ';
var options = { qEncoding: false };
var buffer = Buffer.from(string, 'utf-8');
var bufferEncoded = QuotedPrintable.encode(buffer, options);
console.log(bufferEncoded.toString('ascii'));
// " =3D=20"
```

#### Decoding
```javascript
var QuotedPrintable = require('@ronomon/quoted-printable');
var string = ' =3D=20';
var options = { qEncoding: false };
var bufferEncoded = Buffer.from(string, 'ascii');
var buffer = QuotedPrintable.decode(bufferEncoded, options);
console.log(buffer.toString('utf-8'));
// " = "
```

## Tests
To test the native and Javascript bindings:
```
node test.js
```

## Benchmark
To benchmark the native and Javascript bindings:
```
node benchmark.js
```
