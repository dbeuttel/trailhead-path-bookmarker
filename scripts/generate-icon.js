// Generates assets/tray-icon.png — Trailhead branding: a bookmark ribbon
// (vertical rectangle with a V-cut at the bottom — the universal "save"
// glyph) carrying a mountain peak motif inside it. The ribbon silhouette
// communicates the app's *function* (bookmarking); the inner peak ties to
// the Trailhead theme.
// Strokes are kept >=2 source pixels wide so the silhouette survives the
// downscale to 16-24px Windows tray sizes.
// No external image deps; raw PNG bytes via zlib.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 32;
const OUT = path.join(__dirname, '..', 'assets', 'tray-icon.png');

const ORANGE = [217, 119, 87, 255];        // #d97757 — ribbon fill
const ORANGE_DARK = [165, 82, 56, 255];    // shadow on right edge
const CREAM = [250, 230, 215, 255];        // mountain motif inside the ribbon
const TRANSPARENT = [0, 0, 0, 0];

// Ribbon spans 14px wide (x=9..22) and 25px tall (y=3..27). The bottom 5
// rows form a V-cut, narrowing the ribbon into two prongs.
function inRibbon(x, y) {
  if (x < 9 || x > 22) return false;
  if (y < 3 || y > 27) return false;
  if (y >= 23) {
    const depth = y - 23;       // 0..4
    const cutLeft = 15 - depth;
    const cutRight = 16 + depth;
    if (x >= cutLeft && x <= cutRight) return false;
  }
  return true;
}

// Mountain peak motif inside the upper half of the ribbon. Peak at y=7,
// base at y=14, max half-width 4 (so base spans 8 source pixels).
function inMountain(x, y) {
  if (y < 7 || y > 14) return false;
  const halfW = Math.floor((y - 7) / 2) + 1;
  return x >= 15 - halfW + 1 && x <= 15 + halfW;
}

function colorAt(x, y) {
  if (!inRibbon(x, y)) return TRANSPARENT;

  // Inner mountain silhouette painted in cream so it pops against the
  // orange ribbon at any size.
  if (inMountain(x, y)) return CREAM;

  // Right-edge shadow on the ribbon body (skip the V-cut zone so the cut
  // edges look clean rather than half-shaded).
  if (x === 22 && y >= 3 && y < 23) return ORANGE_DARK;

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
