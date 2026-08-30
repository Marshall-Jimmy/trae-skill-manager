import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const iconsDir = path.join('src-tauri', 'icons');

// Generate a proper ICO file with multiple sizes
async function generateIco() {
  const sizes = [16, 32, 48, 64, 128, 256];
  const pngBuffers = [];

  for (const size of sizes) {
    const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${Math.round(size * 0.15)}" fill="#0a0a0f"/>
      <rect x="${Math.round(size * 0.1)}" y="${Math.round(size * 0.1)}" width="${Math.round(size * 0.8)}" height="${Math.round(size * 0.8)}" rx="${Math.round(size * 0.1)}" fill="none" stroke="#00ff88" stroke-width="${Math.round(size * 0.04)}"/>
      <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-weight="bold" font-size="${Math.round(size * 0.35)}" fill="#00ff88">TS</text>
    </svg>`;
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    pngBuffers.push({ size, buf });
    console.log(`Generated ${size}x${size} PNG`);
  }

  // Build ICO binary format
  // ICO header: 6 bytes
  // ICO directory entry: 16 bytes each
  // PNG data follows
  const numImages = pngBuffers.length;
  const headerSize = 6;
  const dirSize = 16 * numImages;
  let dataOffset = headerSize + dirSize;

  const ico = Buffer.alloc(headerSize + dirSize + pngBuffers.reduce((s, p) => s + p.buf.length, 0));
  let offset = 0;

  // ICO header
  ico.writeUInt16LE(0, offset); offset += 2; // Reserved
  ico.writeUInt16LE(1, offset); offset += 2; // Type: 1 = ICO
  ico.writeUInt16LE(numImages, offset); offset += 2; // Number of images

  // Directory entries
  for (const { size, buf } of pngBuffers) {
    ico.writeUInt8(size >= 256 ? 0 : size, offset); offset += 1; // Width (0 = 256)
    ico.writeUInt8(size >= 256 ? 0 : size, offset); offset += 1; // Height
    ico.writeUInt8(0, offset); offset += 1; // Color palette
    ico.writeUInt8(0, offset); offset += 1; // Reserved
    ico.writeUInt16LE(1, offset); offset += 2; // Color planes
    ico.writeUInt16LE(32, offset); offset += 2; // Bits per pixel
    ico.writeUInt32LE(buf.length, offset); offset += 4; // Image size
    ico.writeUInt32LE(dataOffset, offset); offset += 4; // Offset to image data
    dataOffset += buf.length;
  }

  // PNG data
  for (const { buf } of pngBuffers) {
    buf.copy(ico, offset);
    offset += buf.length;
  }

  fs.writeFileSync(path.join(iconsDir, 'icon.ico'), ico);
  console.log(`Generated icon.ico (${ico.length} bytes)`);
}

generateIco().catch(console.error);
