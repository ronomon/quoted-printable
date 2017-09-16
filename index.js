'use strict';

var QuotedPrintable = {};

QuotedPrintable.assertBinding = function(binding) {
  var self = this;
  if (!binding) throw new Error('binding must be defined');
  if (!binding.decode) throw new Error('binding.decode must be defined');
  if (!binding.encode) throw new Error('binding.encode must be defined');
  if (typeof binding.decode != 'function') {
    throw new Error('binding.decode must be a function');
  }
  if (typeof binding.encode != 'function') {
    throw new Error('binding.encode must be a function');
  }
};

QuotedPrintable.assertQEncoding = function(qEncoding) {
  var self = this;
  if (qEncoding !== true && qEncoding !== false) {
    throw new Error('qEncoding must be a boolean');
  }
};

QuotedPrintable.binding = {};

QuotedPrintable.binding.javascript = {};

QuotedPrintable.binding.javascript.decode = function(
  source, target, qEncoding, tableDecoding, tableLegal
) {
  if (!Buffer.isBuffer(source)) {
    throw new Error('source must be a buffer');
  }
  if (!Buffer.isBuffer(target)) {
    throw new Error('target must be a buffer');
  }
  if (
    typeof qEncoding !== 'number' ||
    Math.floor(qEncoding) !== qEncoding ||
    qEncoding < 0
  ) {
    throw new Error('qEncoding must be a positive integer');
  }
  if (!Buffer.isBuffer(tableDecoding)) {
    throw new Error('tableDecoding must be a buffer');
  }
  if (!Buffer.isBuffer(tableLegal)) {
    throw new Error('tableLegal must be a buffer');
  }
  if (target.length < source.length) {
    throw new Error('target too small');
  }
  if (qEncoding !== 0 && qEncoding !== 1) {
    throw new Error('qEncoding must be 0 or 1');
  }
  if (tableDecoding.length !== 256) {
    throw new Error('tableDecoding must be 256 bytes');
  }
  if (tableLegal.length !== 256) {
    throw new Error('tableLegal must be 256 bytes');
  }

  function removeTransportPaddingThenTestSoftLineBreak() {
    // We assume here that if we see a TAB or SPACE in the source, then we can
    // trim the target. This requires that TAB or SPACE will not form part of
    // any encoded symbol. This should always hold, since if the previous code
    // in the source is part of a symbol, i.e. not a literal TAB or SPACE, then
    // none of its [equals/hexadecimal] codes would match 9 or 32.
    var rewindIndex = sourceIndex;
    while (
      (targetIndex > 0) &&
      (rewindIndex > 0) &&
      (source[rewindIndex - 1] === 9 || source[rewindIndex - 1] === 32)
    ) {
      targetIndex--;
      rewindIndex--;
    }
    return (
      targetIndex > 0 &&
      rewindIndex > 0 &&
      source[rewindIndex - 1] === 61
    );
  }

  function sizeCRLF() {
    // If the current position contains a CRLF, return the number of characters.
    // Assume at least one code is available to read.
    // i.e. We are within the for loop.
    if (
      source[sourceIndex] === 13 &&
      sourceIndex + 1 < sourceLength &&
      source[sourceIndex + 1] === 10
    ) {
      return 2;
    } else if (
      source[sourceIndex] === 13 ||
      source[sourceIndex] === 10
    ) {
      return 1;
    } else {
      return 0;
    }
  }

  var sourceIndex = 0;
  var sourceLength = source.length;
  var targetIndex = 0;
  var targetLength = target.length;
  while (sourceIndex < sourceLength) {
    if (
      source[sourceIndex] === 61 &&
      sourceIndex + 2 < sourceLength &&
      tableDecoding[source[sourceIndex + 1]] &&
      tableDecoding[source[sourceIndex + 2]]
    ) {
      // Symbol:
      target[targetIndex++] = (
        ((tableDecoding[source[sourceIndex + 1]] - 1) << 4) +
        ((tableDecoding[source[sourceIndex + 2]] - 1))
      );
      sourceIndex += 3;
    } else if (source[sourceIndex] === 13 || source[sourceIndex] === 10) {
      if (removeTransportPaddingThenTestSoftLineBreak()) {
        // Soft Line Break:
        targetIndex--; // Remove "="
        sourceIndex += sizeCRLF(); // Pass over CRLF.
      } else if (sizeCRLF() === 2) {
        // CRLF:
        target[targetIndex++] = source[sourceIndex++];
        target[targetIndex++] = source[sourceIndex++];
      } else {
        // CR/LF:
        target[targetIndex++] = source[sourceIndex++];
      }
    } else if (qEncoding && source[sourceIndex] === 95) {
      // Replace "_" with " " (independent of charset):
      target[targetIndex++] = 32;
      sourceIndex++;
    } else if (tableLegal[source[sourceIndex]]) {
      // Literal:
      target[targetIndex++] = source[sourceIndex++];
    } else {
      // Illegal:
      sourceIndex++;
      // throw new Error('illegal character');
    }
  }
  removeTransportPaddingThenTestSoftLineBreak();
  if (sourceIndex > sourceLength) {
    throw new Error('source overflow');
  }
  if (targetIndex > targetLength) {
    throw new Error('target overflow');
  }
  return targetIndex;
};

QuotedPrintable.binding.javascript.encode = function(
  source, target, qEncoding, tableEncoding, tableLiterals
) {
  if (arguments.length !== 5) {
    throw new Error('bad number of arguments');
  }
  if (!Buffer.isBuffer(source)) {
    throw new Error('source must be a buffer');
  }
  if (!Buffer.isBuffer(target)) {
    throw new Error('target must be a buffer');
  }
  if (
    typeof qEncoding !== 'number' ||
    Math.floor(qEncoding) !== qEncoding ||
    qEncoding < 0
  ) {
    throw new Error('qEncoding must be a positive integer');
  }
  if (qEncoding !== 0 && qEncoding !== 1) {
    throw new Error('qEncoding must be 0 or 1');
  }
  if (!Buffer.isBuffer(tableEncoding)) {
    throw new Error('tableEncoding must be a buffer');
  }
  if (!Buffer.isBuffer(tableLiterals)) {
    throw new Error('tableLiterals must be a buffer');
  }
  if (target.length < QuotedPrintable.encodeTargetLength(source.length)) {
    throw new Error('target too small');
  }
  if (tableEncoding.length !== 512) {
    throw new Error('tableEncoding must be 512 bytes');
  }
  if (tableLiterals.length !== 256) {
    throw new Error('tableLiterals must be 256 bytes');
  }

  // Regarding qEncoding:
  // We do not use "_" to represent " " since decoders may not support this.
  // Instead, we represent " " using "=20".
  // This is compatible with the spec and also simplifies the implementation.

  // Regarding non-qEncoding:
  // We do not use "_" as a literal since some decoders may decode this as " ".
  // Instead, we represent "_" using "=5F".

  function encodeSoftLineBreak(size) {
    // (Soft Line Breaks) The Quoted-Printable encoding
    // REQUIRES that encoded lines be no more than 76
    // characters long.
    if (line + size >= 76 && !qEncoding) {
      target[targetIndex++] = 61; // =
      target[targetIndex++] = 13; // \r
      target[targetIndex++] = 10; // \n
      line = 0;
    }
    line += size;
  }

  function encodeSymbol(code) {
    encodeSoftLineBreak(3);
    target[targetIndex++] = 61; // =
    var tableIndex = code << 1;
    target[targetIndex++] = tableEncoding[tableIndex];
    target[targetIndex++] = tableEncoding[tableIndex + 1];
  }

  function encodeTrailingSpace() {
    if (
      (targetIndex > 0) &&
      (target[targetIndex - 1] === 9 || target[targetIndex - 1] === 32)
    ) {
      encodeSymbol(target[--targetIndex]);
    }
  }

  var line = 0;
  var sourceIndex = 0;
  var sourceLength = source.length;
  var targetIndex = 0;
  var targetLength = target.length;
  while (sourceIndex < sourceLength) {
    if (tableLiterals[source[sourceIndex]]) {
      encodeSoftLineBreak(1);
      target[targetIndex++] = source[sourceIndex++];
    } else if (
      (source[sourceIndex] === 13) &&
      (sourceIndex + 1 < sourceLength) &&
      (source[sourceIndex + 1] === 10) &&
      !qEncoding
    ) {
      encodeTrailingSpace();
      target[targetIndex++] = 13;
      target[targetIndex++] = 10;
      sourceIndex += 2;
      line = 0;
    } else {
      encodeSymbol(source[sourceIndex++]);
    }
  }
  encodeTrailingSpace();
  if (sourceIndex > sourceLength) {
    throw new Error('source overflow');
  }
  if (targetIndex > targetLength) {
    throw new Error('target overflow');
  }
  return targetIndex;
};

try {
  QuotedPrintable.binding.native = require('./binding.node');
  QuotedPrintable.binding.active = QuotedPrintable.binding.native;
} catch (exception) {
  // We use the Javascript binding if the native binding has not been compiled.
  QuotedPrintable.binding.active = QuotedPrintable.binding.javascript;
}

QuotedPrintable.decode = function(source, options) {
  var self = this;
  var binding = self.binding.active;
  var qEncoding = 0;
  if (options) {
    if (options.hasOwnProperty('binding')) {
      self.assertBinding(options.binding);
      binding = options.binding;
    }
    if (options.hasOwnProperty('qEncoding')) {
      self.assertQEncoding(options.qEncoding);
      qEncoding = options.qEncoding ? 1 : 0;
    }
  }
  var target = Buffer.alloc(source.length);
  var targetSize = binding.decode(
    source,
    target,
    qEncoding,
    self.tableDecoding,
    self.tableLegal
  );
  if (targetSize > target.length) {
    throw new Error('target overflow');
  }
  return target.slice(0, targetSize);
};

QuotedPrintable.encode = function(source, options) {
  var self = this;
  var binding = self.binding.active;
  var qEncoding = 0;
  if (options) {
    if (options.hasOwnProperty('binding')) {
      self.assertBinding(options.binding);
      binding = options.binding;
    }
    if (options.hasOwnProperty('qEncoding')) {
      self.assertQEncoding(options.qEncoding);
      qEncoding = options.qEncoding ? 1 : 0;
    }
  }
  var target = Buffer.alloc(self.encodeTargetLength(source.length));
  var targetSize = binding.encode(
    source,
    target,
    qEncoding,
    self.tableEncoding,
    qEncoding ? self.tableLiteralsRestricted : self.tableLiterals
  );
  if (targetSize > target.length) {
    throw new Error('target overflow');
  }
  return target.slice(0, targetSize);
};

QuotedPrintable.encodeTargetLength = function(sourceLength) {
  var self = this;
  if (
    typeof sourceLength !== 'number' ||
    Math.round(sourceLength) !== sourceLength ||
    sourceLength < 0
  ) {
    throw new Error('sourceLength must be a positive integer');
  }
  // Assume every byte must be represented by a symbol.
  // Assume there are no line-breaks and that soft line-breaks must be added.
  var lines = Math.ceil(sourceLength * 3 / (76 - 1));
  var softLineBreaks = lines > 0 ? lines - 1 : 0;
  return (sourceLength * 3) + (softLineBreaks * 3);
};

QuotedPrintable.generateTableDecoding = function() {
  var self = this;
  // This table does the following faster:
  // parseInt(String.fromCharCode(code), 16)
  var alphabet = '0123456789ABCDEFabcdef';
  var table = Buffer.alloc(256);
  for (var index = 0, length = alphabet.length; index < length; index++) {
    var char = alphabet[index];
    // Add 1 to all values so that we can detect hex digits with the same table.
    // Subtract 1 when needed to get to the integer value of the hex digit.
    table[char.charCodeAt(0)] = parseInt(char, 16) + 1;
  }
  return table;
};

QuotedPrintable.generateTableEncoding = function() {
  var self = this;
  // This table does the following faster:
  // var hex = code.toString(16).toUpperCase();
  // if (hex.length === 1) hex = '0' + hex;
  // hex.charCodeAt(0);
  // hex.charCodeAt(1);
  var table = Buffer.alloc(256 * 2);
  var tableIndex = 0;
  for (var code = 0; code < 256; code++) {
    var hex = code.toString(16).toUpperCase();
    if (hex.length === 1) hex = '0' + hex;
    table[tableIndex++] = hex.charCodeAt(0);
    table[tableIndex++] = hex.charCodeAt(1);
  }
  return table;
};

QuotedPrintable.generateTableLegal = function() {
  var self = this;
  var table = self.generateTableLiterals();
  table[61] = 1; // "="
  table[95] = 1; // "_"
  return table;
};

QuotedPrintable.generateTableLiterals = function() {
  var self = this;
  // This table does the following faster:
  // TAB (9) || SPACE (32)
  // 33 through 60 inclusive, and 62 through 126.
  // Except "_" (95) (some parsers may decode this as " ").
  // (code === 9) ||
  // (code >= 32 && code <= 60) ||
  // (code >= 62 && code <= 126 && code !== 95)
  var table = Buffer.alloc(256);
  for (var code = 0; code < 256; code++) {
    if (
      (code === 9) ||
      (code >= 32 && code <= 60) ||
      (code >= 62 && code <= 126 && code !== 95)
    ) {
      table[code] = 1;
    }
  }
  return table;
};

QuotedPrintable.generateTableLiteralsRestricted = function() {
  var self = this;
  // This table does the following faster:
  // 0-9 || A-Z || a-z
  // We use this for determining literals for qEncoding.

  // RFC 2047 Section 5 (3):
  // In this case [`phrase`] the set of characters that may be used in a
  // "Q"-encoded 'encoded-word' is restricted to: <upper and lower case ASCII
  // letters, decimal digits, "!", "*", "+", "-", "/", "=", and "_"
  // (underscore, ASCII 95.)>.

  // We support alphanumeric literals only:
  // "_" cannot be used literally.
  // "=" cannot be used literally.
  // We further give up "!", "*", "+", "-", "/" to avoid issues with decoders
  // and structured field parsers.
  var table = Buffer.alloc(256);
  for (var code = 0; code < 256; code++) {
    if (
      (code >= 48 && code <= 57) || // 0-9
      (code >= 65 && code <= 90) || // A-Z
      (code >= 97 && code <= 122)   // a-z
    ) {
      table[code] = 1;
    }
  }
  return table;
};

QuotedPrintable.tableDecoding = QuotedPrintable.generateTableDecoding();
QuotedPrintable.tableEncoding = QuotedPrintable.generateTableEncoding();
QuotedPrintable.tableLegal = QuotedPrintable.generateTableLegal();
QuotedPrintable.tableLiterals = QuotedPrintable.generateTableLiterals();
QuotedPrintable.tableLiteralsRestricted = (
  QuotedPrintable.generateTableLiteralsRestricted()
);

module.exports = QuotedPrintable;

// S.D.G.
