const sharp = require('sharp');
const path = require('path');

// Ionicons musical-notes SVG path
const musicalNotesSvg = (size, iconSize) => `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#0f0f0f"/>
  <g transform="translate(${(size - iconSize) / 2}, ${(size - iconSize) / 2})">
    <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 512 512" fill="white">
      <path d="M421.84 37.37a25.86 25.86 0 00-22.6-4.46L199.92 86.49A32.3 32.3 0 00176 118v226c0 6.74-4.36 12.56-11.11 14.83l-.12.05-52 18C92.88 383.53 80 402 80 423.91a55.54 55.54 0 0023.23 45.63A54.78 54.78 0 00135.34 480a55.82 55.82 0 0017.75-2.93l.38-.13 21.84-7.94A47.84 47.84 0 00208 423.91v-212c0-7.29 4.77-13.21 12.16-15.07l.21-.06L395 150.14a4 4 0 015 3.86v141.93c0 6.75-4.25 12.38-11.11 14.68l-.25.09-50.89 18.11A49.09 49.09 0 00304 375.92a55.67 55.67 0 0023.23 45.8 54.63 54.63 0 0049.88 7.35l.36-.12 21.84-7.95A47.83 47.83 0 00432 375.92V58a25.74 25.74 0 00-10.16-20.63z"/>
    </svg>
  </g>
</svg>
`;

async function generateIcons() {
  const assetsPath = path.join(__dirname, '..', 'assets');

  // 앱 아이콘 (1024x1024)
  console.log('Generating app icon...');
  await sharp(Buffer.from(musicalNotesSvg(1024, 512)))
    .png()
    .toFile(path.join(assetsPath, 'icon.png'));

  // Adaptive icon (foreground) - Android용 (1024x1024, 아이콘만)
  console.log('Generating adaptive icon...');
  await sharp(Buffer.from(musicalNotesSvg(1024, 400)))
    .png()
    .toFile(path.join(assetsPath, 'adaptive-icon.png'));

  // 스플래시 이미지 (1284x2778 - iPhone 14 Pro Max 기준)
  console.log('Generating splash image...');
  const splashSvg = `
<svg width="1284" height="2778" viewBox="0 0 1284 2778" xmlns="http://www.w3.org/2000/svg">
  <rect width="1284" height="2778" fill="#0f0f0f"/>
  <g transform="translate(${(1284 - 200) / 2}, ${(2778 - 200) / 2})">
    <svg width="200" height="200" viewBox="0 0 512 512" fill="white">
      <path d="M421.84 37.37a25.86 25.86 0 00-22.6-4.46L199.92 86.49A32.3 32.3 0 00176 118v226c0 6.74-4.36 12.56-11.11 14.83l-.12.05-52 18C92.88 383.53 80 402 80 423.91a55.54 55.54 0 0023.23 45.63A54.78 54.78 0 00135.34 480a55.82 55.82 0 0017.75-2.93l.38-.13 21.84-7.94A47.84 47.84 0 00208 423.91v-212c0-7.29 4.77-13.21 12.16-15.07l.21-.06L395 150.14a4 4 0 015 3.86v141.93c0 6.75-4.25 12.38-11.11 14.68l-.25.09-50.89 18.11A49.09 49.09 0 00304 375.92a55.67 55.67 0 0023.23 45.8 54.63 54.63 0 0049.88 7.35l.36-.12 21.84-7.95A47.83 47.83 0 00432 375.92V58a25.74 25.74 0 00-10.16-20.63z"/>
    </svg>
  </g>
</svg>
`;
  await sharp(Buffer.from(splashSvg))
    .png()
    .toFile(path.join(assetsPath, 'splash.png'));

  // Favicon (48x48) - 웹용
  console.log('Generating favicon...');
  await sharp(Buffer.from(musicalNotesSvg(48, 32)))
    .png()
    .toFile(path.join(assetsPath, 'favicon.png'));

  console.log('All icons generated successfully!');
}

generateIcons().catch(console.error);
