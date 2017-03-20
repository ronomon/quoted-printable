var cpus = require('os').cpus();
var cpu = cpus[0].model;
var cores = cpus.length;
var concurrency = 1;

var QuotedPrintable = require('./index.js');
var Queue = require('@ronomon/queue');

var RNG = function(seed) {
  var self = this;
  if (seed === undefined) seed = Date.now();
  if (typeof seed !== 'number' || Math.round(seed) !== seed || seed < 0) {
    throw new Error('bad seed');
  }
  self.seed = seed % Math.pow(2, 31);
  self.hash = self.seed;
};

RNG.prototype.random = function() {
  var self = this;
  self.hash = ((self.hash + 0x7ED55D16) + (self.hash << 12)) & 0xFFFFFFF;
  self.hash = ((self.hash ^ 0xC761C23C) ^ (self.hash >>> 19)) & 0xFFFFFFF;
  self.hash = ((self.hash + 0x165667B1) + (self.hash << 5)) & 0xFFFFFFF;
  self.hash = ((self.hash + 0xD3A2646C) ^ (self.hash << 9)) & 0xFFFFFFF;
  self.hash = ((self.hash + 0xFD7046C5) + (self.hash << 3)) & 0xFFFFFFF;
  self.hash = ((self.hash ^ 0xB55A4F09) ^ (self.hash >>> 16)) & 0xFFFFFFF;
  return (self.hash & 0xFFFFFFF) / 0x10000000;
};

var rng = new RNG();
var random = rng.random.bind(rng);

function generateBuffer(size) {
  var buffer = Buffer.alloc(size);
  while (size--) buffer[size] = Math.floor(random() * 256);
  return buffer;
}

var bindings = [
  {
    name: 'Javascript',
    decode: function(buffer, end) {
      var options = { binding: QuotedPrintable.binding.javascript };
      QuotedPrintable.decode(buffer, options);
      end();
    },
    encode: function(buffer, end) {
      var options = { binding: QuotedPrintable.binding.javascript };
      QuotedPrintable.encode(buffer, options);
      end();
    }
  },
  {
    name: 'Native',
    decode: function(buffer, end) {
      var options = { binding: QuotedPrintable.binding.native };
      QuotedPrintable.decode(buffer, options);
      end();
    },
    encode: function(buffer, end) {
      var options = { binding: QuotedPrintable.binding.native };
      QuotedPrintable.encode(buffer, options);
      end();
    }
  }
];

var vectors = {};
var sizes = [
  32,
  128,
  512,
  2048,
  8192,
  32768
];
sizes.forEach(
  function(size) {
    var encode = [];
    var decode = [];
    var count = Math.ceil(1 * 1024 * 1024 / size);
    while (count-- > 0) {
      var buffer = generateBuffer(size);
      encode.push(buffer);
      decode.push(QuotedPrintable.encode(buffer));
    }
    vectors[size] = {
      encode: encode,
      decode: decode
    };
  }
);

function benchmark(binding, method, buffers, end) {
  var now = Date.now();
  var sum = 0;
  var time = 0;
  var count = 0;
  var queue = new Queue(1);
  queue.onData = function(buffer, end) {
    var hrtime = process.hrtime();
    binding[method](buffer,
      function(error) {
        if (error) return end(error);
        var difference = process.hrtime(hrtime);
        var ns = (difference[0] * 1e9) + difference[1];
        // Count the number of data bytes that can be processed per second:
        sum += buffer.length;
        time += ns;
        count++;
        end();
      }
    );
  };
  queue.onEnd = function(error) {
    if (error) return end(error);
    var elapsed = Date.now() - now;
    var latency = (time / count) / 1000000;
    var throughput = sum / elapsed / 1000;
    display([
      binding.name + ':',
      'Latency:',
      latency.toFixed(3) + 'ms',
      'Throughput:',
      throughput.toFixed(2) + ' MB/s'
    ]);
    // Rest between benchmarks to leave room for GC:
    setTimeout(end, 100);
  };
  queue.concat(buffers);
  queue.end();
}

function display(columns) {
  var string = columns[0];
  while (string.length < 15) string = ' ' + string;
  string += ' ' + columns.slice(1).join(' ');
  console.log(string);
}

console.log('');
display([ 'CPU:', cpu ]);
display([ 'Cores:', cores ]);
display([ 'Threads:', concurrency ]);

var queue = new Queue();
queue.onData = function(method, end) {
  console.log('');
  console.log('============================================================');
  var queue = new Queue();
  queue.onData = function(size, end) {
    var buffers = vectors[size][method];
    console.log('');
    display([
      method.slice(0, 1).toUpperCase() + method.slice(1) + ':',
      buffers.length + ' x ' + size + ' Bytes'
    ]);
    var queue = new Queue();
    queue.onData = function(binding, end) {
      benchmark(binding, method, buffers, end);
    };
    queue.onEnd = end;
    queue.concat(bindings);
    queue.end();
  };
  queue.onEnd = end;
  queue.concat(sizes);
  queue.end();
};
queue.onEnd = function(error) {
  if (error) throw error;
  console.log('');
};
queue.push('encode');
queue.push('decode');
queue.end();
