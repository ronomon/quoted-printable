#include <nan.h>
#include <stdint.h>

uint32_t ceil_div(uint32_t x, uint32_t y) {
  return (x % y) ? ((x / y) + 1) : (x / y);
}

void encodeSoftLineBreak(
  uint8_t* target,
  uint32_t &targetIndex,
  const uint8_t qEncoding,
  uint32_t &line,
  const uint8_t size
) {
  if (line + size >= 76 && !qEncoding) {
    target[targetIndex++] = 61;
    target[targetIndex++] = 13;
    target[targetIndex++] = 10;
    line = 0;
  }
  line += size;
}

void encodeSymbol(
  uint8_t* target,
  uint32_t &targetIndex,
  const uint8_t qEncoding,
  const uint8_t* tableEncoding,
  uint32_t &line,
  uint8_t code
) {
  encodeSoftLineBreak(target, targetIndex, qEncoding, line, 3);
  target[targetIndex++] = 61;
  target[targetIndex++] = tableEncoding[(code << 1)];
  target[targetIndex++] = tableEncoding[(code << 1) + 1];
}

uint32_t encodeTargetLength(const uint32_t sourceLength) {
  uint32_t lines = ceil_div(sourceLength * 3, 76 - 1);
  uint32_t softLineBreaks = lines > 0 ? lines - 1 : 0;
  return (sourceLength * 3) + (softLineBreaks * 3);
}

void encodeTrailingSpace(
  uint8_t* target,
  uint32_t &targetIndex,
  const uint8_t qEncoding,
  const uint8_t* tableEncoding,
  uint32_t &line
) {
  if (
    (targetIndex > 0) &&
    (target[targetIndex - 1] == 9 || target[targetIndex - 1] == 32)
  ) {
    encodeSymbol(
      target,
      targetIndex,
      qEncoding,
      tableEncoding,
      line,
      target[--targetIndex]
    );
  }
}

NAN_METHOD(decode) {
  if (info.Length() != 5) {
    return Nan::ThrowError("bad number of arguments");
  }
  if (!node::Buffer::HasInstance(info[0])) {
    return Nan::ThrowError("source must be a buffer");
  }
  if (!node::Buffer::HasInstance(info[1])) {
    return Nan::ThrowError("target must be a buffer");
  }
  if (!info[2]->IsUint32()) {
    return Nan::ThrowError("qEncoding must be a positive integer");
  }
  if (!node::Buffer::HasInstance(info[3])) {
    return Nan::ThrowError("tableDecoding must be a buffer");
  }
  if (!node::Buffer::HasInstance(info[4])) {
    return Nan::ThrowError("tableLegal must be a buffer");
  }
  v8::Local<v8::Object> sourceHandle = info[0].As<v8::Object>();
  v8::Local<v8::Object> targetHandle = info[1].As<v8::Object>();
  const uint8_t qEncoding = info[2]->Uint32Value();
  v8::Local<v8::Object> tableDecodingHandle = info[3].As<v8::Object>();
  v8::Local<v8::Object> tableLegalHandle = info[4].As<v8::Object>();
  const uint32_t sourceLength = node::Buffer::Length(sourceHandle);
  const uint32_t targetLength = node::Buffer::Length(targetHandle);
  if (targetLength < sourceLength) {
    return Nan::ThrowError("target too small");
  }
  if (qEncoding != 0 && qEncoding != 1) {
    return Nan::ThrowError("qEncoding must be 0 or 1");
  }
  if (node::Buffer::Length(tableDecodingHandle) != 256) {
    return Nan::ThrowError("tableDecoding must be 256 bytes");
  }
  if (node::Buffer::Length(tableLegalHandle) != 256) {
    return Nan::ThrowError("tableLegal must be 256 bytes");
  }
  const uint8_t* source = reinterpret_cast<const uint8_t*>(
    node::Buffer::Data(sourceHandle)
  );
  uint8_t* target = reinterpret_cast<uint8_t*>(
    node::Buffer::Data(targetHandle)
  );
  const uint8_t* tableDecoding = reinterpret_cast<const uint8_t*>(
    node::Buffer::Data(tableDecodingHandle)
  );
  const uint8_t* tableLegal = reinterpret_cast<const uint8_t*>(
    node::Buffer::Data(tableLegalHandle)
  );
  uint8_t crlf = 0;
  uint32_t rewindIndex = 0;
  uint32_t sourceIndex = 0;
  uint32_t targetIndex = 0;
  while (sourceIndex < sourceLength) {
    if (
      source[sourceIndex] == 61 &&
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
    } else if (source[sourceIndex] == 13 || source[sourceIndex] == 10) {
      // Remove transport padding:
      rewindIndex = sourceIndex;
      while (
        (targetIndex > 0) &&
        (rewindIndex > 0) &&
        (source[rewindIndex - 1] == 9 || source[rewindIndex - 1] == 32)
      ) {
        targetIndex--;
        rewindIndex--;
      }
      // Size of CRLF:
      if (
        source[sourceIndex] == 13 &&
        sourceIndex + 1 < sourceLength &&
        source[sourceIndex + 1] == 10
      ) {
        crlf = 2;
      } else {
        crlf = 1;
      }
      if (targetIndex > 0 && rewindIndex > 0 && source[rewindIndex - 1] == 61) {
        // Soft Line Break:
        targetIndex--; // Remove "="
        sourceIndex += crlf; // Pass over CRLF.
      } else if (crlf == 2) {
        // CRLF:
        target[targetIndex++] = source[sourceIndex++];
        target[targetIndex++] = source[sourceIndex++];
      } else {
        // CR/LF:
        target[targetIndex++] = source[sourceIndex++];
      }
    } else if (qEncoding && source[sourceIndex] == 95) {
      // Replace "_" with " " (independent of charset):
      target[targetIndex++] = 32;
      sourceIndex++;
    } else if (tableLegal[source[sourceIndex]]) {
      // Literal:
      target[targetIndex++] = source[sourceIndex++];
    } else {
      // Illegal:
      sourceIndex++;
      // return Nan::ThrowError("illegal character");
    }
  }
  // Remove transport padding:
  rewindIndex = sourceIndex;
  while (
    (rewindIndex > 0) &&
    (targetIndex > 0) &&
    (source[rewindIndex - 1] == 9 || source[rewindIndex - 1] == 32)
  ) {
    rewindIndex--;
    targetIndex--;
  }
  if (sourceIndex > sourceLength) {
    return Nan::ThrowError("source overflow");
  }
  if (targetIndex > targetLength) {
    return Nan::ThrowError("target overflow");
  }
  info.GetReturnValue().Set(targetIndex);
}

NAN_METHOD(encode) {
  if (info.Length() != 5) {
    return Nan::ThrowError("bad number of arguments");
  }
  if (!node::Buffer::HasInstance(info[0])) {
    return Nan::ThrowError("source must be a buffer");
  }
  if (!node::Buffer::HasInstance(info[1])) {
    return Nan::ThrowError("target must be a buffer");
  }
  if (!info[2]->IsUint32()) {
    return Nan::ThrowError("qEncoding must be a positive integer");
  }
  if (!node::Buffer::HasInstance(info[3])) {
    return Nan::ThrowError("tableEncoding must be a buffer");
  }
  if (!node::Buffer::HasInstance(info[4])) {
    return Nan::ThrowError("tableLiterals must be a buffer");
  }
  v8::Local<v8::Object> sourceHandle = info[0].As<v8::Object>();
  v8::Local<v8::Object> targetHandle = info[1].As<v8::Object>();
  const uint8_t qEncoding = info[2]->Uint32Value();
  v8::Local<v8::Object> tableEncodingHandle = info[3].As<v8::Object>();
  v8::Local<v8::Object> tableLiteralsHandle = info[4].As<v8::Object>();
  const uint32_t sourceLength = node::Buffer::Length(sourceHandle);
  const uint32_t targetLength = node::Buffer::Length(targetHandle);
  if (targetLength < encodeTargetLength(sourceLength)) {
    return Nan::ThrowError("target too small");
  }
  if (qEncoding != 0 && qEncoding != 1) {
    return Nan::ThrowError("qEncoding must be 0 or 1");
  }
  if (node::Buffer::Length(tableEncodingHandle) != 512) {
    return Nan::ThrowError("tableEncoding must be 512 bytes");
  }
  if (node::Buffer::Length(tableLiteralsHandle) != 256) {
    return Nan::ThrowError("tableLiterals must be 256 bytes");
  }
  const uint8_t* source = reinterpret_cast<const uint8_t*>(
    node::Buffer::Data(sourceHandle)
  );
  uint8_t* target = reinterpret_cast<uint8_t*>(
    node::Buffer::Data(targetHandle)
  );
  const uint8_t* tableEncoding = reinterpret_cast<const uint8_t*>(
    node::Buffer::Data(tableEncodingHandle)
  );
  const uint8_t* tableLiterals = reinterpret_cast<const uint8_t*>(
    node::Buffer::Data(tableLiteralsHandle)
  );
  uint32_t line = 0;
  uint32_t sourceIndex = 0;
  uint32_t targetIndex = 0;
  while (sourceIndex < sourceLength) {
    if (tableLiterals[source[sourceIndex]]) {
      encodeSoftLineBreak(
        target,
        targetIndex,
        qEncoding,
        line,
        1
      );
      target[targetIndex++] = source[sourceIndex++];
    } else if (
      (source[sourceIndex] == 13) &&
      (sourceIndex + 1 < sourceLength) &&
      (source[sourceIndex + 1] == 10) &&
      !qEncoding
    ) {
      encodeTrailingSpace(
        target,
        targetIndex,
        qEncoding,
        tableEncoding,
        line
      );
      target[targetIndex++] = 13;
      target[targetIndex++] = 10;
      sourceIndex += 2;
      line = 0;
    } else {
      encodeSymbol(
        target,
        targetIndex,
        qEncoding,
        tableEncoding,
        line,
        source[sourceIndex++]
      );
    }
  }
  encodeTrailingSpace(
    target,
    targetIndex,
    qEncoding,
    tableEncoding,
    line
  );
  if (sourceIndex > sourceLength) {
    return Nan::ThrowError("source overflow");
  }
  if (targetIndex > targetLength) {
    return Nan::ThrowError("target overflow");
  }
  info.GetReturnValue().Set(targetIndex);
}

NAN_MODULE_INIT(Init) {
  NAN_EXPORT(target, decode);
  NAN_EXPORT(target, encode);
}

NODE_MODULE(binding, Init)

// S.D.G.
