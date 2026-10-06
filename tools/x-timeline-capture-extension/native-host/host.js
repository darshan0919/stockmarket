#!/usr/bin/env node
'use strict';

/**
 * Chrome native-messaging host. Protocol: each message is a 4-byte little-endian length + UTF-8 JSON,
 * on stdin (from Chrome) and stdout (to Chrome). Chrome starts one process per sendNativeMessage call.
 * Never write anything else to stdout.
 */
const { safeHandle } = require('./handlers');

function frame(obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length, 0);
  return Buffer.concat([head, body]);
}

let buf = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  while (buf.length >= 4) {
    const len = buf.readUInt32LE(0);
    if (buf.length < 4 + len) return;
    const body = buf.subarray(4, 4 + len);
    buf = buf.subarray(4 + len);
    let reply;
    try {
      reply = safeHandle(JSON.parse(body.toString('utf8')));
    } catch (e) {
      reply = { ok: false, error: `bad message: ${e.message}` };
    }
    process.stdout.write(frame(reply));
  }
});
process.stdin.on('end', () => process.exit(0));

module.exports = { frame };
