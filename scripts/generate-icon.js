// Generates assets/tray-icon.png — a 32x32 folder pictogram in orange on a
// transparent background. No external image deps; raw PNG bytes via zlib.
// Replace with a designer asset when one is available.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 32;
const OUT = path.join(__dirname, '..', 'assets', 'tray-icon.png');

const ORANGE = [217, 119, 87, 255];
const ORANGE_DARK = [180, 92, 64, 255];
const TRANSPARENT = [0, 0, 0, 0];

function colorAt(x, y) {
  // Folder tab (top): smaller rectangle on the left
  const tabLeft = 4, tabRight = 13, tabTop = 7, tabBottom = 11;
  // Folder body: larger rectangle below
  const bodyLeft = 3, bodyRight = 28, bodyTop = 11, bodyBottom = 25;

  const inTab = x >= tabLeft && x <= tabRight && y >= tabTop && y <= tabBottom;
  const inBody = x >= bodyLeft && x <= bodyRight && y >= bodyTop && y <= bodyBottom;

  if (!inTab && !inBody) return TRANSPARENT;

  // Soft top edge on body where the tab steps down — paints a single-row
  // shadow line to give the folder some dimension at small sizes.
  if (inBody && y === bodyTop && x > tabRight + 1) return ORANGE_DARK;

  return ORANGE;
}

function buildRawImage() {
  const rowLen = SIZE * 4 + 1;
  const raw = Buffer.alloc(rowLen * SIZE);
  for (let y = 0; y < SIZE; y++) {
    raw[y * rowLen] = 0;
    for (let x = 0; x < SIZE; x++) {
      const [r, g, b, a] = colorAt(x, y);
      const off = y * rowLen + 1 + x * 4;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }
  return raw;
}

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let v = n;
      for (let k = 0; k < 8; k++) v = (v & 1) ? (0xedb88320 ^ (v >>> 1)) : (v >>> 1);
      t[n] = v >>> 0;
    }
    return t;
  })());
  c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function buildPng() {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace
  const idat = zlib.deflateSync(buildRawImage());
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, buildPng());
console.log(`Wrote ${OUT}`);
