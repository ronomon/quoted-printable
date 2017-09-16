var Node = { crypto: require('crypto') };

var Test = {};

Test.equal = function(value, expected, namespace, description) {
  value = JSON.stringify(value) + '';
  expected = JSON.stringify(expected) + '';
  if (value === expected) {
    Test.pass(namespace, description, expected);
  } else {
    Test.fail(namespace, description, value + ' !== ' + expected);
  }
};

Test.fail = function(namespace, description, message) {
  console.log('');
  throw 'FAIL: ' + Test.message(namespace, description, message);
};

Test.message = function(namespace, description, message) {
  if ((namespace = namespace || '')) namespace += ': ';
  if ((description = description || '')) description += ': ';
  return namespace + description + (message || '');
};

Test.pass = function(namespace, description, message) {
  console.log('PASS: ' + Test.message(namespace, description, message));
};

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

var namespace = 'QuotedPrintable';

var ALPHABET = '';
ALPHABET += 'abcdefghijklmnopqrstuvwxyz';
ALPHABET += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
ALPHABET += '0123456789';
ALPHABET += '!@#$%^&*()-_=+[{]};:\'"\\|,<.>/?`~';
ALPHABET += '                          ';
ALPHABET += '\t\t\t\t\t\t\t\t\t\t\t\t\t';
ALPHABET += '==========================';
var code = 0;
while (code <= 32) ALPHABET += String.fromCharCode(code++);
var code = 127;
while (code <= 255) ALPHABET += String.fromCharCode(code++);
var CRLFS = [
  '\r\n',
  '\r',
  '\n'
];

function assertValidEncoding(buffer, qEncoding) {
  function hexDigit(code) {
    return (
      (code >= 48 && code <= 57) || // 0-9 [48-57]
      (code >= 65 && code <= 70) || // A-F [65-70]
      (code >= 97 && code <= 102)   // a-f [97-102]
    );
  }
  function hexDigitStrict(code) {
    return (
      (code >= 48 && code <= 57) || // 0-9 [48-57]
      (code >= 65 && code <= 70)    // A-F [65-70]
    );
  }
  for (var index = 0, length = buffer.length; index < length; index++) {
    var code = buffer[index];
    if (
      (code >= 0 && code <= 8) ||
      (code === 11) ||
      (code === 12) ||
      (code >= 14 && code <= 31) ||
      (code > 126)
    ) {
      throw new Error(
        'Control characters other than TAB, or CR and LF must not appear.'
      );
    }
    if (qEncoding) {
      // RFC 2047:

      // A "Q"-encoded 'encoded-word' which appears in a 'comment' MUST NOT
      // contain the characters "(", ")" or "\"
      // 'encoded-word' that appears in a 'comment' MUST be separated from
      // any adjacent 'encoded-word' or 'ctext' by 'linear-white-space'.
      //
      // It is important to note that 'comment's are only recognized inside
      // "structured" field bodies.  In fields whose bodies are defined as
      // '*text', "(" and ")" are treated as ordinary characters rather than
      // comment delimiters, and rule (1) of this section applies.  (See RFC
      // 822, sections 3.1.2 and 3.1.3)

      // In this case [`phrase`] the set of characters that may be used in a
      // "Q"-encoded 'encoded-word' is restricted to: <upper and lower case
      // ASCII letters, decimal digits, "!", "*", "+", "-", "/", "=", and "_"
      // (underscore, ASCII 95.)>.
      if (
        (code >= 48 && code <= 57) ||  // 0-9
        (code >= 65 && code <= 90) ||  // A-Z
        (code >= 97 && code <= 122) || // a-z
        (code === 33) ||               // "!"
        (code === 40) ||               // "("
        (code === 41) ||               // ")"
        (code === 42) ||               // "*"
        (code === 43) ||               // "+"
        (code === 45) ||               // "-"
        (code === 47) ||               // "/"
        (code === 61) ||               // "="
        (code === 95)                  // "_"
      ) {
        // Good.
        // We choose to allow "(" or ")" when asserting validity.
        // They are not allowed for comments (possibly within address fields).
        // They are allowed for *text headers such as "Subject".
        // If we were to raise an exception instead, it may be a false positive.
      } else {
        throw new Error(
          'Code ' + code + ' must not appear as a literal in Q-encoding.'
        );
      }
    }
    if (
      (code === 13) &&
      (index === length - 1 || buffer[index + 1] !== 10)
    ) {
      throw new Error('CR must appear as part of CRLF.');
    }
    if (
      (code === 10) &&
      (index === 0 || buffer[index - 1] !== 13)
    ) {
      throw new Error('LF must appear as part of CRLF.');
    }
    if (code === 61) {
      if (index + 1 < length && buffer[index + 1] === 13) {
        // Followed by CR.
      } else if (
        (index + 1 < length && hexDigit(buffer[index + 1]) === false) ||
        (index + 2 < length && hexDigit(buffer[index + 2]) === false)
      ) {
        throw new Error(
          'An "=" must be followed by two hexadecimal digits or a CR.'
        );
      } else if (
        (index + 1 < length && hexDigitStrict(buffer[index + 1]) === false) ||
        (index + 2 < length && hexDigitStrict(buffer[index + 2]) === false)
      ) {
        throw new Error('Hexadecimal digits must be uppercase.');
      }
    }
  }
  if (!qEncoding) {
    var lines = buffer.toString('ascii').split('\r\n');
    for (var index = 0, length = lines.length; index < length; index++) {
      var line = lines[index];
      if (line.length > 76) {
        throw new Error(
          'Line must not be longer than 76 characters: ' + JSON.stringify(line)
        );
      }
      if (/[ \t]+$/.test(line)) {
        throw new Error(
          'Line must not end with space or tab: ' + JSON.stringify(line)
        );
      }
    }
  }
  var index = Math.max(0, buffer.length - 2);
  while (index < buffer.length) {
    if (buffer[index++] === 61) {
      throw new Error('An "=" cannot be the ultimate/penultimate character.');
    }
  }
}

function generateBuffer() {
  var lines = [];
  if (random() < 0.01) {
    var length = 0;
  } else {
    var length = Math.ceil(random() * 100);
  }
  while (length--) lines.push(generateLine());
  var crlf = CRLFS[Math.floor(random() * CRLFS.length)];
  return Buffer.from(lines.join(crlf), 'binary');
}

var illegals = [];
for (var code = 0; code < 32; code++) {
  if (code === 9) continue;
  if (code === 10) continue;
  if (code === 13) continue;
  illegals.push(code);
}
for (var code = 127; code < 256; code++) {
  illegals.push(code);
}

function generateIllegal(buffer) {
  // Control characters other than TAB, or CR and LF as
  // parts of CRLF pairs, must not appear. The same is true
  // for octets with decimal values greater than 126. If
  // found in incoming quoted-printable data by a decoder, a
  // robust implementation might exclude them from the
  // decoded data and warn the user that illegal characters
  // were discovered.
  var count = 1 + Math.floor(random() * 16);
  while (count--) {
    var index = Math.floor(random() * buffer.length);
    var head = buffer.slice(0, index);
    var code = illegals[Math.floor(random() * illegals.length)];
    var tail = buffer.slice(index);
    buffer = Buffer.concat([
      head,
      Buffer.from([code]),
      tail
    ]);
  }
  return buffer;
}

function generateLine() {
  var tokens = [];
  var length = Math.ceil(random() * 5);
  while (length--) tokens.push(generateToken());
  return tokens.join(' ');
}

function generateToken() {
  var token = [];
  var length = Math.ceil(random() * 10);
  while (length--) {
    token.push(ALPHABET[Math.floor(random() * ALPHABET.length)]);
  }
  return token.join('');
}

function hash(buffer) {
  var hash = Node.crypto.createHash('SHA256');
  hash.update(buffer);
  return hash.digest('hex').slice(0, 32);
}

function withTransportPadding(buffer) {
  var string = buffer.toString('ascii');
  return Buffer.from(string.split(/(\r?\n|\r)/).map(
    function(line) {
      if (line.trim().length === 0) return line;
      // An "=" followed by two hexadecimal digits, one or both
      // of which are lowercase letters in "abcdef", is formally
      // illegal. A robust implementation might choose to
      // recognize them as the corresponding uppercase letters.
      line = line.replace(/=[0-9A-F]{2}/g,
        function(match) {
          if (random() < 0.5) return match.toLowerCase();
          return match;
        }
      );

      var length = Math.floor(random() * Math.max(0, 76 - line.length));
      while (length--) line += (random() < 0.5 ? ' ' : '\t'); // LWSP
      return line;
    }
  ).join(''), 'ascii');
}

var sources = [];
var length = 1000;
while (length--) sources.push(generateBuffer());

var qp = require('./index.js');
var bindingNames = [
  'javascript'
];
if (qp.binding.native) bindingNames.push('native');

var empty = Buffer.alloc(0);
var exceptions = {
  decode: [
    {
      args: [[], empty, 0, qp.tableDecoding, qp.tableLegal],
      error: 'source must be a buffer'
    },
    {
      args: [empty, [], 0, qp.tableDecoding, qp.tableLegal],
      error: 'target must be a buffer'
    },
    {
      args: [
        Buffer.alloc(1),
        empty,
        0,
        qp.tableDecoding,
        qp.tableLegal
      ],
      error: 'target too small'
    },
    {
      args: [empty, empty, '0', qp.tableDecoding, qp.tableLegal],
      error: 'qEncoding must be a positive integer'
    },
    {
      args: [empty, empty, -1, qp.tableDecoding, qp.tableLegal],
      error: 'qEncoding must be a positive integer'
    },
    {
      args: [empty, empty, 2, qp.tableDecoding, qp.tableLegal],
      error: 'qEncoding must be 0 or 1'
    },
    {
      args: [empty, empty, 0, [], qp.tableLegal],
      error: 'tableDecoding must be a buffer'
    },
    {
      args: [empty, empty, 0, empty, qp.tableLegal],
      error: 'tableDecoding must be 256 bytes'
    },
    {
      args: [empty, empty, 0, qp.tableDecoding, []],
      error: 'tableLegal must be a buffer'
    },
    {
      args: [empty, empty, 0, qp.tableDecoding, empty],
      error: 'tableLegal must be 256 bytes'
    }
  ],
  encode: [
    {
      args: [[], empty, 0, qp.tableEncoding, qp.tableLiterals],
      error: 'source must be a buffer'
    },
    {
      args: [empty, [], 0, qp.tableEncoding, qp.tableLiterals],
      error: 'target must be a buffer'
    },
    {
      args: [
        Buffer.alloc(100),
        Buffer.alloc(308),
        0,
        qp.tableEncoding,
        qp.tableLiterals
      ],
      error: 'target too small'
    },
    {
      args: [empty, empty, '0', qp.tableEncoding, qp.tableLiterals],
      error: 'qEncoding must be a positive integer'
    },
    {
      args: [empty, empty, -1, qp.tableEncoding, qp.tableLiterals],
      error: 'qEncoding must be a positive integer'
    },
    {
      args: [empty, empty, 2, qp.tableEncoding, qp.tableLiterals],
      error: 'qEncoding must be 0 or 1'
    },
    {
      args: [empty, empty, 0, [], qp.tableLiterals],
      error: 'tableEncoding must be a buffer'
    },
    {
      args: [empty, empty, 0, empty, qp.tableLiterals],
      error: 'tableEncoding must be 512 bytes'
    },
    {
      args: [empty, empty, 0, qp.tableEncoding, []],
      error: 'tableLiterals must be a buffer'
    },
    {
      args: [empty, empty, 0, qp.tableEncoding, empty],
      error: 'tableLiterals must be 256 bytes'
    }
  ]
};

bindingNames.forEach(
  function(bindingName) {
    var binding = qp.binding[bindingName];
    Test.equal(bindingName, bindingName, namespace, 'binding');

    Object.keys(exceptions).forEach(
      function(method) {
        exceptions[method].forEach(
          function(test) {
            try {
              binding[method].apply(binding, test.args);
              Test.equal('', test.error, namespace, method + ' exception');
            } catch (error) {
              Test.equal(
                error.message,
                test.error,
                namespace,
                method + ' exception'
              );
            }
          }
        );
      }
    );

    Test.equal(
      qp.decode(
        Buffer.from('_', 'ascii'),
        { binding: binding, qEncoding: false }
      ).toString('binary'),
      '_',
      namespace,
      'qEncoding=false: decode "_"'
    );

    Test.equal(
      qp.decode(
        Buffer.from('_', 'ascii'),
        { binding: binding, qEncoding: true }
      ).toString('binary'),
      ' ',
      namespace,
      'qEncoding=true: decode "_"'
    );

    // An implementation might decide to add a soft line break instead of
    // replacing trailing space with a symbol. This would add an extra 3 bytes
    // (in addition to the 1 byte for the space) and overflow a simple 3x target
    // buffer allocation.
    Test.equal(
      qp.encode(
        Buffer.from(' ', 'ascii'),
        { binding: binding, qEncoding: false }
      ).toString('binary'),
      '=20',
      namespace,
      'encode(" ")'
    );

    // Test that target buffer allocation takes soft line breaks into account:
    Test.equal(
      qp.encode(
        Buffer.from(new Array((75 * 2) + 1).join('='), 'ascii'),
        { binding: binding, qEncoding: false }
      ).toString('binary'),
      [
        new Array(25 + 1).join('=3D'),
        new Array(25 + 1).join('=3D'),
        new Array(25 + 1).join('=3D'),
        new Array(25 + 1).join('=3D'),
        new Array(25 + 1).join('=3D'),
        new Array(25 + 1).join('=3D')
      ].join('=\r\n'),
      namespace,
      'target must not overflow'
    );

    Test.equal(
      qp.encode(
        Buffer.alloc(0),
        { binding: binding, qEncoding: false }
      ).toString('binary'),
      '',
      namespace,
      'encode("")'
    );

    Test.equal(
      qp.decode(
        Buffer.alloc(0),
        { binding: binding, qEncoding: false }
      ).toString('binary'),
      '',
      namespace,
      'decode("")'
    );

    Test.equal(
      qp.decode(
        Buffer.from('=0Z==', 'ascii'),
        { binding: binding, qEncoding: false }
      ).toString('binary'),
      '=0Z==',
      namespace,
      'decode(false positive)'
    );

    Test.equal(
      qp.decode(
        Buffer.from('=0Z==', 'ascii'),
        { binding: binding, qEncoding: true }
      ).toString('binary'),
      '=0Z==',
      namespace,
      'decode(false positive)'
    );

    Test.equal(
      qp.decode(
        Buffer.from('=0', 'ascii'),
        { binding: binding, qEncoding: false }
      ).toString('binary'),
      '=0',
      namespace,
      'decode(truncated)'
    );

    sources.forEach(
      function(source) {
        try {
          Test.equal(bindingName, bindingName, namespace, 'binding');
          var qEncoding = random() < 0.2;
          var options = { binding: binding, qEncoding: qEncoding };
          Test.equal(qEncoding, qEncoding, namespace, 'qEncoding');
          Test.equal(source.length, source.length, namespace, 'source.length');
          var sourceHash = hash(source);
          var encoding = qp.encode(source, options);
          Test.equal(
            hash(source) === sourceHash,
            true,
            namespace,
            'source unchanged by encode()'
          );
          var encodingHash = hash(encoding);
          Test.equal(
            encoding.length,
            encoding.length,
            namespace,
            'encoding.length'
          );
          Test.equal(
            assertValidEncoding(encoding, qEncoding) === undefined,
            true,
            namespace,
            'valid encoding'
          );
          if (hash(encoding) !== encodingHash) {
            Test.equal(
              hash(encoding) === encodingHash,
              true,
              namespace,
              'encoding unchanged by validEncoding()'
            );
          }
          var decoding = qp.decode(encoding, options);
          Test.equal(
            hash(encoding) === encodingHash,
            true,
            namespace,
            'encoding unchanged by decode()'
          );
          Test.equal(
            decoding.length,
            source.length,
            namespace,
            'decoding.length'
          );
          Test.equal(hash(decoding), sourceHash, namespace, 'decoding');
          var encodingPadding = withTransportPadding(encoding);
          if (hash(encoding) !== encodingHash) {
            Test.equal(
              hash(encoding) === encodingHash,
              true,
              namespace,
              'encoding unchanged by transportPadding()'
            );
          }
          Test.equal(
            encodingPadding.length,
            encodingPadding.length,
            namespace,
            'encodingPadding.length'
          );
          var decodingPadding = qp.decode(encodingPadding, options);
          Test.equal(
            decodingPadding.length,
            source.length,
            namespace,
            'decodingPadding.length'
          );
          Test.equal(
            hash(decodingPadding),
            sourceHash,
            namespace,
            'decodingPadding'
          );
          var encodingIllegal = generateIllegal(encoding);
          try {
            var decodingIllegal = qp.decode(encodingIllegal, options);
            var decodingIllegalException = null;
          } catch (error) {
            var decodingIllegalException = error;
          }
          // Test.equal(
          //   decodingIllegalException.message,
          //   'illegal character',
          //   namespace,
          //   'decodingIllegal'
          // );
        } catch (error) {
          if (source) {
            console.log(
              '  Source: ' + JSON.stringify(source.toString('binary'))
            );
          }
          if (decoding) {
            console.log('');
            console.log(
              'Decoding: ' + JSON.stringify(decoding.toString('binary'))
            );
          }
          if (decodingPadding) {
            console.log('');
            console.log(
              'DPadding: ' + JSON.stringify(decodingPadding.toString('binary'))
            );
          }
          if (decodingIllegal) {
            console.log('');
            console.log(
              'DIllegal: ' + JSON.stringify(decodingIllegal.toString('binary'))
            );
          }
          if (encoding) {
            console.log('');
            console.log(
              'Encoding: ' + JSON.stringify(encoding.toString('binary'))
            );
          }
          if (encodingPadding) {
            console.log('');
            console.log(
              'EPadding: ' + JSON.stringify(encodingPadding.toString('binary'))
            );
          }
          if (encodingIllegal) {
            console.log('');
            console.log(
              'EIllegal: ' + JSON.stringify(encodingIllegal.toString('binary'))
            );
          }
          throw error;
        }
      }
    );
  }
);
console.log('Bindings Tested: ' + bindingNames.join(', '));
console.log('================');
console.log('PASSED ALL TESTS');
console.log('================');
