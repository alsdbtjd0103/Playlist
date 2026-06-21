#!/usr/bin/env node
/**
 * 방구석 플레이리스트 브랜딩 자산 생성기.
 *
 * 출력:
 *  - assets/icon.png            1024x1024 (앱 아이콘, 다크 배경)
 *  - assets/adaptive-icon.png   1024x1024 (Android adaptive 전경, 다크 배경)
 *  - assets/splash.png          1242x2436 (스플래시, 다크 배경 + 중앙 로고)
 *  - assets/favicon.png         48x48     (웹 favicon)
 *
 * 디자인: #0f0f0f 다크 배경 + 흰색 마이크 아이콘. 노래방 앱 컨셉.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const BG_COLOR = '#0f0f0f';
const FG_COLOR = '#ffffff';

/**
 * 마이크 아이콘 SVG 생성. canvasSize는 정사각 viewBox 길이.
 * iconScale은 캔버스 대비 아이콘 비율(0~1).
 */
function micSvg({ canvasSize, iconScale = 0.4, withBackground = true }) {
  const iconSize = canvasSize * iconScale;
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;

  // 마이크 크기 비례 좌표 (iconSize 기준)
  const capsuleW = iconSize * 0.4;
  const capsuleH = iconSize * 0.7;
  const capsuleR = capsuleW / 2;
  const capsuleX = cx - capsuleW / 2;
  const capsuleY = cy - capsuleH * 0.7;

  const standW = iconSize * 0.7;
  const standY = cy + iconSize * 0.05;
  const standLeftX = cx - standW / 2;
  const standRightX = cx + standW / 2;

  const poleX = cx;
  const poleTopY = standY;
  const poleBottomY = cy + iconSize * 0.3;

  const baseY = poleBottomY;
  const baseHalfW = iconSize * 0.22;
  const stroke = iconSize * 0.06;

  const background = withBackground
    ? `<rect width="${canvasSize}" height="${canvasSize}" fill="${BG_COLOR}"/>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}">
  ${background}
  <rect x="${capsuleX}" y="${capsuleY}" width="${capsuleW}" height="${capsuleH}" rx="${capsuleR}" fill="${FG_COLOR}"/>
  <path d="M ${standLeftX} ${cy} Q ${standLeftX} ${standY} ${poleX} ${standY} Q ${standRightX} ${standY} ${standRightX} ${cy}" stroke="${FG_COLOR}" stroke-width="${stroke}" fill="none" stroke-linecap="round"/>
  <line x1="${poleX}" y1="${poleTopY}" x2="${poleX}" y2="${poleBottomY}" stroke="${FG_COLOR}" stroke-width="${stroke}" stroke-linecap="round"/>
  <line x1="${cx - baseHalfW}" y1="${baseY}" x2="${cx + baseHalfW}" y2="${baseY}" stroke="${FG_COLOR}" stroke-width="${stroke}" stroke-linecap="round"/>
</svg>`;
}

/**
 * 스플래시 전용 SVG. 1242x2436. 중앙에 로고 + 아래 텍스트.
 */
function splashSvg() {
  const W = 1242;
  const H = 2436;
  const cx = W / 2;
  const cy = H / 2 - 100;
  const iconSize = 400;

  // 마이크 (icon용 SVG 좌표를 그대로 사용하되 위치만 평행이동)
  const capsuleW = iconSize * 0.4;
  const capsuleH = iconSize * 0.7;
  const capsuleR = capsuleW / 2;
  const capsuleX = cx - capsuleW / 2;
  const capsuleY = cy - capsuleH * 0.7;

  const standW = iconSize * 0.7;
  const standY = cy + iconSize * 0.05;
  const standLeftX = cx - standW / 2;
  const standRightX = cx + standW / 2;

  const poleX = cx;
  const poleTopY = standY;
  const poleBottomY = cy + iconSize * 0.3;
  const baseY = poleBottomY;
  const baseHalfW = iconSize * 0.22;
  const stroke = iconSize * 0.06;

  const textY = cy + 380;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG_COLOR}"/>
  <rect x="${capsuleX}" y="${capsuleY}" width="${capsuleW}" height="${capsuleH}" rx="${capsuleR}" fill="${FG_COLOR}"/>
  <path d="M ${standLeftX} ${cy} Q ${standLeftX} ${standY} ${poleX} ${standY} Q ${standRightX} ${standY} ${standRightX} ${cy}" stroke="${FG_COLOR}" stroke-width="${stroke}" fill="none" stroke-linecap="round"/>
  <line x1="${poleX}" y1="${poleTopY}" x2="${poleX}" y2="${poleBottomY}" stroke="${FG_COLOR}" stroke-width="${stroke}" stroke-linecap="round"/>
  <line x1="${cx - baseHalfW}" y1="${baseY}" x2="${cx + baseHalfW}" y2="${baseY}" stroke="${FG_COLOR}" stroke-width="${stroke}" stroke-linecap="round"/>
  <text x="${cx}" y="${textY}" font-family="-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif" font-size="72" font-weight="700" fill="${FG_COLOR}" text-anchor="middle" letter-spacing="-2">방구석 플레이리스트</text>
</svg>`;
}

async function writeSvgToPng(svgString, outPath) {
  await sharp(Buffer.from(svgString)).png().toFile(outPath);
  console.log(`✓ ${path.relative(process.cwd(), outPath)}`);
}

async function main() {
  await writeSvgToPng(
    micSvg({ canvasSize: 1024, iconScale: 0.45, withBackground: true }),
    path.join(ASSETS_DIR, 'icon.png')
  );

  // Android adaptive: foreground는 캔버스 가운데 66% 안에 들어와야 안전.
  await writeSvgToPng(
    micSvg({ canvasSize: 1024, iconScale: 0.5, withBackground: true }),
    path.join(ASSETS_DIR, 'adaptive-icon.png')
  );

  await writeSvgToPng(splashSvg(), path.join(ASSETS_DIR, 'splash.png'));

  await writeSvgToPng(
    micSvg({ canvasSize: 48, iconScale: 0.6, withBackground: true }),
    path.join(ASSETS_DIR, 'favicon.png')
  );

  console.log('\n모든 브랜딩 자산 생성 완료.');
}

main().catch((err) => {
  console.error('생성 실패:', err);
  process.exit(1);
});
