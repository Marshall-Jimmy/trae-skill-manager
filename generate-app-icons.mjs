import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const iconsDir = path.join('src-tauri', 'icons');
const srcSvg = path.join('assets', 'logo.svg');
fs.mkdirSync(iconsDir, { recursive: true });

const pngSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const icoSizes = [16, 24, 32, 48, 64, 128, 256];

async function main() {
  // Render the master 1024 SVG once, then downscale for crisp small sizes
  const master = await sharp(srcSvg).resize(1024, 1024).png().toBuffer();

  const pngBuffers = [];
  for (const size of pngSizes) {
    const buf = await sharp(master).resize(size, size, { fit: 'fill' }).png().toBuffer();
    pngBuffers.push({ size, buf });
    if (size !== 128) {
      await sharp(buf).toFile(path.join(iconsDir, `${size}x${size}.png`));
    }
    console.log(`Generated ${size}x${size}.png`);
  }

  // @2x variant (128x128@2x = 256px content)
  await sharp(master).resize(256, 256, { fit: 'fill' }).png().toFile(path.join(iconsDir, '128x128@2x.png'));
  console.log('Generated 128x128@2x.png');

  // Build multi-size ICO (PNG-embedded, 32bpp)
  const icoEntries = pngBuffers.filter((p) => icoSizes.includes(p.size));
  const numImages = icoEntries.length;
  const headerSize = 6;
  const dirSize = 16 * numImages;
  let dataOffset = headerSize + dirSize;
  const totalData = icoEntries.reduce((s, p) => s + p.buf.length, 0);

  const ico = Buffer.alloc(headerSize + dirSize + totalData);
  let offset = 0;
  ico.writeUInt16LE(0, offset); offset += 2; // Reserved
  ico.writeUInt16LE(1, offset); offset += 2; // Type: 1 = ICO
  ico.writeUInt16LE(numImages, offset); offset += 2; // Image count

  for (const { size, buf } of icoEntries) {
    ico.writeUInt8(size >= 256 ? 0 : size, offset); offset += 1; // Width (0 = 256)
    ico.writeUInt8(size >= 256 ? 0 : size, offset); offset += 1; // Height
    ico.writeUInt8(0, offset); offset += 1; // Palette
    ico.writeUInt8(0, offset); offset += 1; // Reserved
    ico.writeUInt16LE(1, offset); offset += 2; // Color planes
    ico.writeUInt16LE(32, offset); offset += 2; // Bits per pixel
    ico.writeUInt32LE(buf.length, offset); offset += 4; // Data size
    ico.writeUInt32LE(dataOffset, offset); offset += 4; // Data offset
    dataOffset += buf.length;
  }

  for (const { buf } of icoEntries) {
    buf.copy(ico, offset);
    offset += buf.length;
  }

  fs.writeFileSync(path.join(iconsDir, 'icon.ico'), ico);
  console.log(`Generated icon.ico (${ico.length} bytes, ${numImages} sizes)`);

  // ICNS placeholder (macOS not a target; keep parity with previous behavior)
  await sharp(master).resize(512, 512, { fit: 'fill' }).png().toFile(path.join(iconsDir, 'icon.icns'));
  console.log('Generated icon.icns');

  console.log('All icons generated!');
}

main().catch((e) => { console.error(e); process.exit(1); });
