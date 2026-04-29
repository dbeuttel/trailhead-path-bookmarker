// Generates two PNGs from the same procedural Trailhead glyph:
//   assets/tray-icon.png — 32x32 (Windows tray)
//   assets/app-icon.png  — 256x256 (electron-builder requires >=256 for the
//                          win.icon used in the installer + .exe resource)
//
// Glyph: a vertical bookmark ribbon (rectangle with a V-cut bottom — the
// universal "save" mark) carrying a cream mountain peak inside it.
// Geometry is expressed as fractions of the canvas so a single set of rules
// renders cleanly at both sizes.
// No external image deps; raw PNG bytes via zlib.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ORANGE = [217, 119, 87, 255];        // #d97757 — ribbon fill
const ORANGE_DARK = [165, 82, 56, 255];    // shadow on right edge
const CREAM = [250, 230, 215, 255];        // mountain motif inside the ribbon
const TRANSPARENT = [0, 0, 0, 0];

// Geometry, in 0..1 fractions of canvas.
const G = {
  ribbonLeft: 9 / 32,
  ribbonRight: 23 / 32,    // exclusive
  ribbonTop: 3 / 32,
  ribbonBottom: 28 / 32,   // exclusive
  vCutTop: 23 / 32,        // V notch starts here, points up into the ribbon
  mountainTop: 7 / 32,
  mountainBottom: 15 / 32, // exclusive
  mountainBaseHalfW: 4.5 / 32,
  shadowWidth: 1 / 32,
};

function makeColorAt(size) {
  const rL = G.ribbonLeft * size;
  const rR = G.ribbonRight * size;
  const rT = G.ribbonTop * size;
  const rB = G.ribbonBottom * size;
  const vT = G.vCutTop * size;
  const mT = G.mountainTop * size;
  const mB = G.mountainBottom * size;
  const sw = G.shadowWidth * size;
  const cx = (rL + rR) / 2;
  const baseHalf = G.mountainBaseHalfW * size;

  return function colorAt(x, y) {
    // Sample at pixel center so geometry edges land cleanly.
    const px = x + 0.5;
    const py = y + 0.5;

    if (px < rL || px >= rR) return TRANSPARENT;
    if (py < rT || py >= rB) return TRANSPARENT;

    // V-cut: triangular notch carved from the bottom of the ribbon.
    if (py >= vT) {
      const depth = (py - vT) / (rB - vT);    // 0..1
      const cutHalfW = depth * ((rR - rL) / 2);
      if (Math.abs(px - cx) < cutHalfW) return TRANSPARENT;
    }

    // Mountain peak silhouette inside the upper half of the ribbon.
    if (py >= mT && py < mB) {
      const t = (py - mT) / (mB - mT);        // 0..1 (top..base)
      const halfW = t * baseHalf;
      if (Math.abs(px - cx) <= halfW) return CREAM;
    }

    // Right-edge shadow on the ribbon body, stopping before the V-cut so the
    // notch edges read clean rather than half-shaded.
    if (px >= rR - sw && py < vT) return ORANGE_DARK;

    return ORANGE;
  };
}

function buildRawImage(size) {
  const colorAt = makeColorAt(size);
  const rowLen = size * 4 + 1;
  const raw = Buffer.alloc(rowLen * size);
  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0;
    for (let x = 0; x < size; x++) {
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

function buildPng(size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace
  const idat = zlib.deflateSync(buildRawImage(size));
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const targets = [
  { size: 32, file: path.join(__dirname, '..', 'assets', 'tray-icon.png') },
  { size: 256, file: path.join(__dirname, '..', 'assets', 'app-icon.png') },
];

for (const t of targets) {
  fs.mkdirSync(path.dirname(t.file), { recursive: true });
  fs.writeFileSync(t.file, buildPng(t.size));
  console.log(`Wrote ${t.file} (${t.size}x${t.size})`);
}
