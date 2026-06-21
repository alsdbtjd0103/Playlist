#!/usr/bin/env node
/**
 * 플리로그(plilog) 브랜딩 자산 생성기.
 *
 * 출력:
 *  - assets/icon.png            1024x1024 (앱 아이콘, 웜 샌드 배경)
 *  - assets/adaptive-icon.png   1024x1024 (Android adaptive 전경, 웜 샌드 배경)
 *  - assets/splash.png          1242x2436 (스플래시, 웜 샌드 배경 + 파형 + plilog)
 *  - assets/favicon.png         48x48     (웹 favicon)
 *
 * 디자인: 웜 샌드(#f4ecdd) 배경 + 앰버 파형(#c2703d) + plilog 워드마크(#a8542a).
 * 파형 = 로고 = 녹음화면 = 프로그레스바 (하나의 시각 언어).
 */

const path = require('node:path');
const sharp = require('sharp');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const BG = '#f4ecdd';
const WAVE = '#c2703d';
const WORD = '#a8542a';

// 파형 막대 상대 높이(0~1). 둥근 끝.
const BARS = [0.34, 0.62, 1.0, 0.5, 0.78, 0.42, 0.9, 0.28];

/**
 * 중앙 정렬 파형을 그리는 <rect> 문자열들.
 * cx,cy 중심, totalW 전체 폭, maxH 최대 높이, barW 막대 폭.
 */
function waveRects({ cx, cy, totalW, maxH, barW, color }) {
  const gap = (totalW - BARS.length * barW) / (BARS.length - 1);
  const startX = cx - totalW / 2;
  return BARS.map((h, i) => {
    const bh = Math.max(barW, h * maxH);
    const x = startX + i * (barW + gap);
    const y = cy - bh / 2;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="${bh.toFixed(1)}" rx="${(barW / 2).toFixed(1)}" fill="${color}"/>`;
  }).join('\n  ');
}

/** 앱 아이콘 SVG. 배경 + 중앙 파형. */
function iconSvg({ canvasSize, waveScale = 0.52 }) {
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;
  const totalW = canvasSize * waveScale;
  const maxH = canvasSize * waveScale * 0.62;
  const barW = totalW / (BARS.length * 1.7);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}">
  <rect width="${canvasSize}" height="${canvasSize}" fill="${BG}"/>
  ${waveRects({ cx, cy, totalW, maxH, barW, color: WAVE })}
</svg>`;
}

/** 스플래시 SVG. 1242x2436. 중앙 파형 + 아래 plilog 워드마크. */
function splashSvg() {
  const W = 1242;
  const H = 2436;
  const cx = W / 2;
  const cy = H / 2 - 80;
  const totalW = 520;
  const maxH = 300;
  const barW = totalW / (BARS.length * 1.7);
  const textY = cy + 320;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${waveRects({ cx, cy, totalW, maxH, barW, color: WAVE })}
  <text x="${cx}" y="${textY}" font-family="-apple-system, 'Helvetica Neue', Arial, sans-serif" font-size="150" font-weight="800" letter-spacing="-6" fill="${WORD}" text-anchor="middle">plilog</text>
</svg>`;
}

async function writeSvgToPng(svgString, outPath) {
  await sharp(Buffer.from(svgString)).png().toFile(outPath);
  console.log(`✓ ${path.relative(process.cwd(), outPath)}`);
}

async function main() {
  await writeSvgToPng(iconSvg({ canvasSize: 1024, waveScale: 0.5 }), path.join(ASSETS_DIR, 'icon.png'));

  // Android adaptive: 전경은 캔버스 가운데 66% 안전영역에 들어와야 한다.
  await writeSvgToPng(iconSvg({ canvasSize: 1024, waveScale: 0.42 }), path.join(ASSETS_DIR, 'adaptive-icon.png'));

  await writeSvgToPng(splashSvg(), path.join(ASSETS_DIR, 'splash.png'));

  await writeSvgToPng(iconSvg({ canvasSize: 48, waveScale: 0.66 }), path.join(ASSETS_DIR, 'favicon.png'));

  console.log('\n모든 브랜딩 자산 생성 완료.');
}

main().catch((err) => {
  console.error('생성 실패:', err);
  process.exit(1);
});
