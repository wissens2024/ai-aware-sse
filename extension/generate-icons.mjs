/**
 * AI-Aware SSE Extension 아이콘 생성 스크립트
 * 외부 의존성 없이 순수 Node.js로 PNG 생성
 * 방패(Shield) + 자물쇠(Lock) 디자인 — 보안 확장프로그램 느낌
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { deflateSync } from 'zlib';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── PNG encoder (minimal, no deps) ──────────────────────────────
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([typeBytes, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function createPNG(width, height, pixels) {
  // pixels: Uint8Array of RGBA (width * height * 4)
  // Build raw scanlines with filter byte 0 (None)
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowOff = y * (1 + width * 4);
    raw[rowOff] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = rowOff + 1 + x * 4;
      raw[dstIdx] = pixels[srcIdx];
      raw[dstIdx + 1] = pixels[srcIdx + 1];
      raw[dstIdx + 2] = pixels[srcIdx + 2];
      raw[dstIdx + 3] = pixels[srcIdx + 3];
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const compressed = deflateSync(raw);

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Drawing helpers ─────────────────────────────────────────────
function setPixel(pixels, w, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= w || y < 0) return;
  const h = pixels.length / (w * 4);
  if (y >= h) return;
  const i = (y * w + x) * 4;
  // Alpha blend
  if (a < 255 && pixels[i + 3] > 0) {
    const aa = a / 255;
    const ba = pixels[i + 3] / 255;
    const oa = aa + ba * (1 - aa);
    pixels[i] = Math.round((r * aa + pixels[i] * ba * (1 - aa)) / oa);
    pixels[i + 1] = Math.round((g * aa + pixels[i + 1] * ba * (1 - aa)) / oa);
    pixels[i + 2] = Math.round((b * aa + pixels[i + 2] * ba * (1 - aa)) / oa);
    pixels[i + 3] = Math.round(oa * 255);
  } else {
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = a;
  }
}

function fillCircle(pixels, w, cx, cy, radius, r, g, b, a = 255) {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= r2) {
        setPixel(pixels, w, Math.round(cx + dx), Math.round(cy + dy), r, g, b, a);
      }
    }
  }
}

function fillRect(pixels, w, x1, y1, x2, y2, r, g, b, a = 255) {
  for (let y = Math.round(y1); y <= Math.round(y2); y++) {
    for (let x = Math.round(x1); x <= Math.round(x2); x++) {
      setPixel(pixels, w, x, y, r, g, b, a);
    }
  }
}

function fillRoundedRect(pixels, w, x1, y1, x2, y2, radius, r, g, b, a = 255) {
  // Fill main body
  fillRect(pixels, w, x1 + radius, y1, x2 - radius, y2, r, g, b, a);
  fillRect(pixels, w, x1, y1 + radius, x2, y2 - radius, r, g, b, a);
  // Fill corners
  fillCircle(pixels, w, x1 + radius, y1 + radius, radius, r, g, b, a);
  fillCircle(pixels, w, x2 - radius, y1 + radius, radius, r, g, b, a);
  fillCircle(pixels, w, x1 + radius, y2 - radius, radius, r, g, b, a);
  fillCircle(pixels, w, x2 - radius, y2 - radius, radius, r, g, b, a);
}

// ── Shield shape ────────────────────────────────────────────────
function isInsideShield(x, y, size) {
  const cx = size / 2;
  const topY = size * 0.08;
  const midY = size * 0.52;
  const bottomY = size * 0.92;
  const halfW = size * 0.42;

  // Normalize coordinates
  const nx = (x - cx) / halfW; // -1 to 1 horizontally
  const ny = y;

  if (ny < topY || ny > bottomY) return false;

  let maxX;
  if (ny <= midY) {
    // Upper section: straight sides, slight taper
    const t = (ny - topY) / (midY - topY);
    maxX = halfW * (1.0 - t * 0.05);
  } else {
    // Lower section: tapering to point
    const t = (ny - midY) / (bottomY - midY);
    maxX = halfW * 0.95 * (1.0 - t * t); // quadratic taper
  }

  return Math.abs(x - cx) <= maxX;
}

// ── Generate icon at given size ─────────────────────────────────
function generateIcon(size) {
  const pixels = new Uint8Array(size * size * 4); // starts all zeros (transparent)

  // Colors
  const bgR = 37, bgG = 99, bgB = 235;       // #2563EB — primary blue
  const darkR = 29, darkG = 78, darkB = 216;   // darker blue for shield border
  const lockR = 255, lockG = 255, lockB = 255;  // white lock icon
  const accentR = 96, accentG = 165, accentB = 250; // light blue highlight

  // Draw shield body
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isInsideShield(x, y, size)) {
        setPixel(pixels, size, x, y, bgR, bgG, bgB);
      }
    }
  }

  // Draw shield border (slightly larger, below main fill)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isInsideShield(x, y, size)) {
        // Check if near edge
        let isEdge = false;
        const borderW = Math.max(1, Math.round(size * 0.04));
        for (let dy = -borderW; dy <= borderW && !isEdge; dy++) {
          for (let dx = -borderW; dx <= borderW && !isEdge; dx++) {
            if (!isInsideShield(x + dx, y + dy, size)) isEdge = true;
          }
        }
        if (isEdge) {
          setPixel(pixels, size, x, y, darkR, darkG, darkB);
        }
      }
    }
  }

  // Draw highlight on upper-left area of shield
  const highlightW = Math.max(1, Math.round(size * 0.02));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isInsideShield(x, y, size) && x < size / 2 && y < size * 0.45) {
        let isInnerEdge = false;
        for (let dy = -highlightW; dy <= highlightW && !isInnerEdge; dy++) {
          for (let dx = -highlightW; dx <= highlightW && !isInnerEdge; dx++) {
            if (!isInsideShield(x + dx, y + dy, size)) isInnerEdge = true;
          }
        }
        if (isInnerEdge) {
          setPixel(pixels, size, x, y, accentR, accentG, accentB, 180);
        }
      }
    }
  }

  // ── Draw lock icon in center of shield ──
  const cx = Math.round(size / 2);
  const lockScale = size / 128; // reference design at 128px

  // Lock shackle (arc at top)
  const shackleOuter = Math.round(14 * lockScale);
  const shackleInner = Math.round(9 * lockScale);
  const shackleCY = Math.round(size * 0.38);
  for (let dy = -shackleOuter; dy <= 0; dy++) {
    for (let dx = -shackleOuter; dx <= shackleOuter; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 <= shackleOuter * shackleOuter && d2 >= shackleInner * shackleInner) {
        setPixel(pixels, size, cx + dx, shackleCY + dy, lockR, lockG, lockB);
      }
    }
  }
  // Shackle legs
  const legH = Math.round(6 * lockScale);
  const legW = Math.max(2, Math.round(5 * lockScale));
  fillRect(pixels, size,
    cx - shackleOuter, shackleCY,
    cx - shackleOuter + legW - 1, shackleCY + legH,
    lockR, lockG, lockB);
  fillRect(pixels, size,
    cx + shackleOuter - legW + 1, shackleCY,
    cx + shackleOuter, shackleCY + legH,
    lockR, lockG, lockB);

  // Lock body (rounded rectangle)
  const bodyW = Math.round(22 * lockScale);
  const bodyH = Math.round(18 * lockScale);
  const bodyTop = Math.round(shackleCY + legH * 0.5);
  const bodyRadius = Math.max(2, Math.round(3 * lockScale));
  fillRoundedRect(pixels, size,
    cx - bodyW, bodyTop,
    cx + bodyW, bodyTop + bodyH,
    bodyRadius,
    lockR, lockG, lockB);

  // Keyhole (dark circle + line)
  const keyholeR = Math.max(2, Math.round(4 * lockScale));
  const keyholeCY = Math.round(bodyTop + bodyH * 0.38);
  fillCircle(pixels, size, cx, keyholeCY, keyholeR, bgR, bgG, bgB);
  // Keyhole slot
  const slotW = Math.max(1, Math.round(2 * lockScale));
  const slotH = Math.round(6 * lockScale);
  fillRect(pixels, size,
    cx - slotW, keyholeCY + keyholeR - 1,
    cx + slotW, keyholeCY + keyholeR + slotH,
    bgR, bgG, bgB);

  return createPNG(size, size, pixels);
}

// ── Main ────────────────────────────────────────────────────────
const sizes = [16, 48, 128];
const outDir = join(__dirname, 'icons');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

for (const size of sizes) {
  const png = generateIcon(size);
  const filename = `icon-${size}.png`;
  writeFileSync(join(outDir, filename), png);
  console.log(`Generated ${filename} (${png.length} bytes)`);
}

console.log('Icons generated in extension/icons/');
