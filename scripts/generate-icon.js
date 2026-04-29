// Generates assets/tray-icon.png — Trailhead branding: a mountain peak with
// a small pennant flag at the summit, in the app's accent orange. Tuned for
// recognizability at Windows tray sizes (16-24px) by keeping every stroke
// at least 2 source pixels wide so it survives downscaling.
// No external image deps; raw PNG bytes via zlib.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 32;
const OUT = path.join(__dirname, '..', 'assets', 'tray-icon.png');

const ORANGE = [217, 119, 87, 255];       // #d97757
const ORANGE_DARK = [165, 82, 56, 255];   // shadow on right slope + pole
const ORANGE_LIGHT = [240, 158, 124, 255]; // peak highlight + flag
const TRANSPARENT = [0, 0, 0, 0];

// Mountain triangle: peak at (15-16, 8), base spans (2-29, 27).
function mountainHalfWidth(y) {
  if (y < 8 || y > 27) return -1;
  // Linear from 1 at y=8 (peak ~2px) to 14 at y=27 (~28px base).
  return Math.floor(((y - 8) * 13) / 19) + 1;
}

function colorAt(x, y) {
  // Flag pole — vertical 2px column from y=2 down to where it meets the peak.
  if ((x === 15 || x === 16) && y >= 2 && y <= 8) return ORANGE_DARK;

  // Flag pennant — rectangle to the right of the pole.
  if (y >= 3 && y <= 6 && x >= 17 && x <= 22) return ORANGE_LIGHT;

  // Mountain body.
  const hw = mountainHalfWidth(y);
  if (hw > 0) {
    const cx = 15;
    const left = cx - hw + 1;
    const right = cx + hw;
    if (x >= left && x <= right) {
      // Right slope shadow — last 2 columns on the right edge of each row.
      if (x >= right - 1 && hw > 1) return ORANGE_DARK;
      // Soft peak highlight — top 2 rows, painted lighter.
      if (y <= 9) return ORANGE_LIGHT;
      return ORANGE;
    }
  }

  return TRANSPARENT;
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
