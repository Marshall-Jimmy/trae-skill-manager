import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const iconsDir = path.join('src-tauri', 'icons');
fs.mkdirSync(iconsDir, { recursive: true });

// Generate a simple 32x32 icon with TRAE green color
const sizes = [32, 128, 256, 512, 1024];

async function generateIcons() {
  for (const size of sizes) {
    const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${Math.round(size * 0.15)}" fill="#0a0a0f"/>
      <rect x="${Math.round(size * 0.1)}" y="${Math.round(size * 0.1)}" width="${Math.round(size * 0.8)}" height="${Math.round(size * 0.8)}" rx="${Math.round(size * 0.1)}" fill="none" stroke="#00ff88" stroke-width="${Math.round(size * 0.04)}"/>
      <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-weight="bold" font-size="${Math.round(size * 0.35)}" fill="#00ff88">TS</text>
    </svg>`;

    await sharp(Buffer.from(svg)).png().toFile(path.join(iconsDir, `${size}x${size}.png`));
    console.log(`Generated ${size}x${size}.png`);
  }

  // Generate @2x variants
  await sharp(path.join(iconsDir, '128x128.png')).png().toFile(path.join(iconsDir, '128x128@2x.png'));
  console.log('Generated 128x128@2x.png');

  // Generate ICO from 256x256
  const png256 = await sharp(path.join(iconsDir, '256x256.png')).png().toBuffer();
  fs.writeFileSync(path.join(iconsDir, 'icon.ico'), png256);
  console.log('Generated icon.ico');

  // Generate ICNS (just copy the 512x512 png as placeholder)
  const png512 = await sharp(path.join(iconsDir, '512x512.png')).png().toBuffer();
  fs.writeFileSync(path.join(iconsDir, 'icon.icns'), png512);
  console.log('Generated icon.icns');

  console.log('All icons generated!');
}

generateIcons().catch(console.error);
