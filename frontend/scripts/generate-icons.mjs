/**
 * Generates the PWA install icons referenced by the manifest in vite.config.ts.
 *
 * vite-plugin-pwa's manifest listed pwa-192x192.png / pwa-512x512.png, but the
 * files never existed — which makes the manifest fail validation and the app
 * non-installable (Phase 1 "manifest" item, and Phase 7's installability item).
 *
 * These are drawn from the same wordmark-free design as public/favicon.svg
 * rather than containing any product name, so a rebrand (changing APP_NAME)
 * needs no new artwork. Re-run with:  npm run generate:icons
 *
 * Zero dependencies — writes PNG bytes directly with zlib, since pulling in an
 * image library for three flat-colour squares isn't worth the install cost.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const BRAND = [0x0a, 0x66, 0xc2]; // #0A66C2 — spec primary
const WHITE = [0xff, 0xff, 0xff];

// ---------------------------------------------------------------- geometry --
// All coordinates below are fractions of the icon's edge length, so the same
// definition rasterises at any size.

const distToSegment = (px, py, x1, y1, x2, y2) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
};

/** Signed distance to a rounded rectangle covering [0,1]² with corner radius r. */
const insideRoundedRect = (x, y, r) => {
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  if (x >= r && x <= 1 - r) return y >= 0 && y <= 1;
  if (y >= r && y <= 1 - r) return x >= 0 && x <= 1;
  return Math.hypot(x - cx, y - cy) <= r;
};

/**
 * @param {number} scale 1 = full-bleed icon, <1 shrinks the glyph toward the
 *   centre so a maskable icon's content stays inside the 80% safe zone.
 */
function makeGlyph(scale) {
  const c = 0.5;
  const s = (v) => c + (v - c) * scale;
  // Arrow shaft, arrow head, and the bar it arrives at.
  const segments = [
    [s(0.5), s(0.235), s(0.5), s(0.547)],
    [s(0.3625), s(0.419), s(0.5), s(0.556)],
    [s(0.5), s(0.556), s(0.6375), s(0.419)],
    [s(0.297), s(0.719), s(0.703), s(0.719)],
  ];
  const halfStroke = (0.0406 * scale);
  return (x, y) => segments.some((sg) => distToSegment(x, y, sg[0], sg[1], sg[2], sg[3]) <= halfStroke);
}

// -------------------------------------------------------------- rasteriser --

const SS = 4; // supersampling factor per axis, for anti-aliased edges

function renderRGBA(size, { maskable }) {
  const glyph = makeGlyph(maskable ? 0.8 : 1);
  const radius = maskable ? 0 : 0.22; // maskable icons are cropped by the OS
  const px = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bgHits = 0;
      let fgHits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          if (radius === 0 || insideRoundedRect(u, v, radius)) bgHits++;
          if (glyph(u, v)) fgHits++;
        }
      }
      const total = SS * SS;
      const bgA = bgHits / total;
      const fgA = fgHits / total;

      // Composite white glyph over the brand-blue plate, then the plate over
      // transparency — premultiplied-free straight alpha, so the rounded
      // corners stay clean.
      const alpha = bgA;
      const mix = alpha === 0 ? 0 : Math.min(fgA, alpha) / alpha;
      const o = (y * size + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        px[o + ch] = Math.round(BRAND[ch] * (1 - mix) + WHITE[ch] * mix);
      }
      px[o + 3] = Math.round(alpha * 255);
    }
  }
  return px;
}

// ------------------------------------------------------------- PNG encoding --

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // bytes 10-12: compression / filter / interlace, all 0

  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// -------------------------------------------------------------------- main --

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  { file: 'pwa-192x192.png', size: 192, maskable: false },
  { file: 'pwa-512x512.png', size: 512, maskable: false },
  { file: 'pwa-maskable-512x512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
];

for (const t of targets) {
  const png = encodePng(t.size, renderRGBA(t.size, { maskable: t.maskable }));
  writeFileSync(join(OUT_DIR, t.file), png);
  console.log(`wrote public/${t.file}  (${t.size}x${t.size}, ${png.length} bytes)`);
}
