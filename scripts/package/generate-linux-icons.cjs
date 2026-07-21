const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const repoRoot = path.resolve(__dirname, "..", "..");
const iconDir = path.join(repoRoot, "electron", "assets", "icons");
const sourceIconPath = path.join(iconDir, "icon-source.png");
const sizes = [16, 24, 32, 48, 64, 128, 256, 512];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function createIcon(size) {
  const rows = [];
  const radius = size * 0.18;
  const center = (size - 1) / 2;

  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0;
    for (let x = 0; x < size; x += 1) {
      const offset = 1 + x * 4;
      const normalizedX = x / Math.max(1, size - 1);
      const normalizedY = y / Math.max(1, size - 1);
      const dx = Math.abs(x - center);
      const dy = Math.abs(y - center);
      const cornerDistance = Math.max(dx, dy) - (center - radius);
      const insideRoundedSquare = cornerDistance < 0 || Math.hypot(Math.max(0, dx - center + radius), Math.max(0, dy - center + radius)) < radius;
      const mark =
        (Math.abs(x - center) < size * 0.09 && y > size * 0.23 && y < size * 0.78) ||
        (Math.abs(y - center) < size * 0.09 && x > size * 0.23 && x < size * 0.78);

      row[offset] = mark ? 255 : Math.round(24 + normalizedX * 48);
      row[offset + 1] = mark ? 255 : Math.round(91 + normalizedY * 70);
      row[offset + 2] = mark ? 255 : Math.round(169 + normalizedX * 32);
      row[offset + 3] = insideRoundedSquare ? 255 : 0;
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(iconDir, { recursive: true });

if (!fs.existsSync(sourceIconPath)) {
  for (const size of sizes) {
    fs.writeFileSync(path.join(iconDir, `${size}x${size}.png`), createIcon(size));
  }
  fs.copyFileSync(path.join(iconDir, "512x512.png"), path.join(iconDir, "icon.png"));
  console.log(`Generated fallback Linux icons in ${path.relative(repoRoot, iconDir)}.`);
  process.exit(0);
}

const missingIcons = sizes
  .map((size) => path.join(iconDir, `${size}x${size}.png`))
  .filter((iconPath) => !fs.existsSync(iconPath));

if (missingIcons.length > 0) {
  throw new Error("Generated app icon sizes are missing. Select the app icon again in Settings > App Definition.");
}

fs.copyFileSync(path.join(iconDir, "512x512.png"), path.join(iconDir, "icon.png"));
console.log(`Prepared selected app icon sizes in ${path.relative(repoRoot, iconDir)} for build and packaging.`);
