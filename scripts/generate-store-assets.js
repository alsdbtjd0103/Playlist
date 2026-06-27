/* eslint-disable */
// 플레이스토어 등록용 이미지 생성기
// 실행: npm run store:assets   (또는 node scripts/generate-store-assets.js)
// 출력: store-assets/  (feature-graphic, play-icon-512, screenshot-1~4)
//
// 폰트: 프로젝트 번들 Pretendard(assets/fonts)를 fontconfig로 연결해 한글을 렌더링합니다.

const path = require('path');
const fs = require('fs');
const os = require('os');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'store-assets');
fs.mkdirSync(OUT, { recursive: true });

// --- fontconfig 설정 (Pretendard 연결) ---
const fontDir = path.join(ROOT, 'assets', 'fonts');
const cacheDir = path.join(os.tmpdir(), 'plilog-fontcache');
fs.mkdirSync(cacheDir, { recursive: true });
const fontConfPath = path.join(os.tmpdir(), 'plilog-fonts.conf');
fs.writeFileSync(
  fontConfPath,
  `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${fontDir}</dir>
  <cachedir>${cacheDir}</cachedir>
  <config></config>
</fontconfig>`
);
process.env.FONTCONFIG_FILE = fontConfPath;

// --- 코지 웜 라이트 팔레트 (lib/theme.ts와 동일) ---
const C = {
  bg: '#f4ecdd',
  surface: '#fffdf9',
  surfaceAlt: '#faf0e4',
  text: '#2f2820',
  textMuted: '#74664f',
  border: '#e6dac6',
  accent: '#c2703d',
  accentStrong: '#a8542a',
  star: '#b87a26',
  onAccent: '#ffffff',
  record: '#b85a3e',
  bezel: '#2b2620',
};
const F = 'Pretendard';

// --- helpers ---
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function starPath(cx, cy, r) {
  const inner = r * 0.42;
  let pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : inner;
    pts.push(`${(cx + rr * Math.cos(rad)).toFixed(2)},${(cy + rr * Math.sin(rad)).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(' ')}"`;
}
function stars(cx, cy, rating, r = 11, gap = 6) {
  let out = '';
  for (let i = 0; i < 5; i++) {
    const x = cx + i * (r * 2 + gap);
    const filled = i < rating;
    out += `${starPath(x, cy, r)} fill="${filled ? C.star : 'none'}" stroke="${C.star}" stroke-width="${filled ? 0 : 1.6}"/>`;
  }
  return out;
}
// 앨범아트: 웜 그라데이션 + 작은 웨이브폼
function albumArt(x, y, size, idx = 0, rx = 18) {
  const id = `aa${idx}`;
  const bars = [0.4, 0.7, 1, 0.6, 0.85, 0.5];
  const bw = size * 0.06;
  const cx = x + size / 2 - ((bars.length - 1) * (bw * 1.7)) / 2;
  const cy = y + size / 2;
  let wf = '';
  bars.forEach((h, i) => {
    const bh = size * 0.34 * h;
    wf += `<rect x="${(cx + i * bw * 1.7 - bw / 2).toFixed(1)}" y="${(cy - bh / 2).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="${(bw / 2).toFixed(1)}" fill="rgba(255,253,249,0.92)"/>`;
  });
  return `
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${C.accent}"/><stop offset="1" stop-color="${C.accentStrong}"/>
  </linearGradient></defs>
  <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${rx}" fill="url(#${id})"/>${wf}`;
}
// plilog 워드마크 + 웨이브폼 마크
function logo(x, y, scale = 1) {
  const bars = [10, 20, 30, 16, 24].map((h) => h * scale);
  const bw = 4 * scale;
  let mark = '';
  bars.forEach((h, i) => {
    mark += `<rect x="${x + i * (bw + 3 * scale)}" y="${y + 15 * scale - h / 2}" width="${bw}" height="${h}" rx="${bw / 2}" fill="${C.accentStrong}"/>`;
  });
  const tx = x + bars.length * (bw + 3 * scale) + 8 * scale;
  return `${mark}<text x="${tx}" y="${y + 24 * scale}" font-family="${F}" font-weight="800" font-size="${26 * scale}" fill="${C.accentStrong}" letter-spacing="-1">plilog</text>`;
}

// --- 폰 프레임으로 화면 콘텐츠 감싸기 (마케팅 스타일) ---
const W = 1080;
const H = 2340;
const FX = 132, FW = 816, FY = 470, FH = 1786, BR = 76; // frame
const SX = FX + 22, SY = FY + 22, SW = FW - 44, SH = FH - 44, SR = 56; // screen
const PAD = 40; // screen inner padding

function frameWrap({ headline, sub, screen }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <text x="${W / 2}" y="200" text-anchor="middle" font-family="${F}" font-weight="800" font-size="62" fill="${C.text}" letter-spacing="-1.5">${esc(headline)}</text>
  <text x="${W / 2}" y="290" text-anchor="middle" font-family="${F}" font-weight="500" font-size="34" fill="${C.textMuted}">${esc(sub)}</text>
  <!-- phone bezel -->
  <rect x="${FX}" y="${FY}" width="${FW}" height="${FH}" rx="${BR}" fill="${C.bezel}"/>
  <rect x="${SX}" y="${SY}" width="${SW}" height="${SH}" rx="${SR}" fill="${C.bg}"/>
  <clipPath id="screenclip"><rect x="${SX}" y="${SY}" width="${SW}" height="${SH}" rx="${SR}"/></clipPath>
  <g clip-path="url(#screenclip)">${screen}</g>
</svg>`;
}

// 화면 공통 상단(상태바 + 로고헤더). 반환: 다음 콘텐츠 시작 y
function screenTop(showActions = '') {
  const left = SX + PAD;
  return {
    svg: `
    <text x="${left}" y="${SY + 64}" font-family="${F}" font-weight="600" font-size="26" fill="${C.text}">9:41</text>
    <g>${'' /* 우측 상태 점 */}
      <rect x="${SX + SW - PAD - 84}" y="${SY + 48}" width="22" height="22" rx="4" fill="${C.textMuted}" opacity="0.5"/>
      <rect x="${SX + SW - PAD - 56}" y="${SY + 48}" width="22" height="22" rx="4" fill="${C.textMuted}" opacity="0.5"/>
      <rect x="${SX + SW - PAD - 28}" y="${SY + 48}" width="22" height="22" rx="4" fill="${C.textMuted}" opacity="0.5"/>
    </g>
    ${logo(left, SY + 110, 1.5)}
    ${showActions}`,
    contentY: SY + 200,
  };
}

// ============ Screenshot 1: 곡 목록 ============
function screen1() {
  const left = SX + PAD;
  const innerW = SW - PAD * 2;
  const addBtn = `<circle cx="${SX + SW - PAD - 26}" cy="${SY + 145}" r="30" fill="${C.accentStrong}"/><text x="${SX + SW - PAD - 26}" y="${SY + 158}" text-anchor="middle" font-family="${F}" font-weight="700" font-size="44" fill="${C.onAccent}">+</text>`;
  const top = screenTop(addBtn);
  let y = top.contentY + 10;
  // search bar
  let s = `<rect x="${left}" y="${y}" width="${innerW}" height="84" rx="18" fill="${C.surface}" stroke="${C.border}" stroke-width="2"/>
  <circle cx="${left + 42}" cy="${y + 42}" r="14" fill="none" stroke="${C.textMuted}" stroke-width="4"/><line x1="${left + 53}" y1="${y + 53}" x2="${left + 64}" y2="${y + 64}" stroke="${C.textMuted}" stroke-width="4" stroke-linecap="round"/>
  <text x="${left + 82}" y="${y + 53}" font-family="${F}" font-weight="500" font-size="28" fill="${C.textMuted}">제목 또는 아티스트 검색</text>`;
  y += 120;
  const songs = [
    ['밤편지', '아이유', 5],
    ['사건의 지평선', '윤하', 5],
    ['이런 밤 (Such a Night)', '폴킴', 4],
    ['그대 떠난 뒤', '버즈', 4],
    ['신호등', '이무진', 3],
    ['주저하는 연인들을 위해', '잔나비', 5],
  ];
  const cardH = 132;
  songs.forEach(([title, artist, rating], i) => {
    const cy = y + i * (cardH + 20);
    s += `<rect x="${left}" y="${cy}" width="${innerW}" height="${cardH}" rx="22" fill="${C.surface}"/>`;
    s += albumArt(left + 22, cy + 26, 80, i, 16);
    s += `<text x="${left + 124}" y="${cy + 58}" font-family="${F}" font-weight="700" font-size="30" fill="${C.text}">${esc(title)}</text>`;
    s += `<text x="${left + 124}" y="${cy + 96}" font-family="${F}" font-weight="500" font-size="25" fill="${C.textMuted}">${esc(artist)}</text>`;
    s += `${starPath(left + innerW - 110, cy + cardH / 2, 13)} fill="${C.star}"/>`;
    s += `<text x="${left + innerW - 86}" y="${cy + cardH / 2 + 10}" font-family="${F}" font-weight="600" font-size="28" fill="${C.textMuted}">${rating}</text>`;
    s += `<circle cx="${left + innerW - 26}" cy="${cy + cardH / 2 - 14}" r="4" fill="${C.textMuted}"/><circle cx="${left + innerW - 26}" cy="${cy + cardH / 2}" r="4" fill="${C.textMuted}"/><circle cx="${left + innerW - 26}" cy="${cy + cardH / 2 + 14}" r="4" fill="${C.textMuted}"/>`;
  });
  return frameWrap({ headline: '부르고 싶은 곡을 한곳에', sub: '검색해서 앨범아트와 함께 담아두세요', screen: top.svg + s });
}

// ============ Screenshot 2: 곡 상세 (녹음/별점/메모) ============
function screen2() {
  const left = SX + PAD;
  const innerW = SW - PAD * 2;
  const top = screenTop();
  let y = top.contentY;
  const cx = SX + SW / 2;
  // 앨범아트 중앙
  let s = albumArt(cx - 110, y, 220, 7, 28);
  y += 292;
  s += `<text x="${cx}" y="${y}" text-anchor="middle" font-family="${F}" font-weight="700" font-size="40" fill="${C.text}">사건의 지평선</text>`;
  y += 46;
  s += `<text x="${cx}" y="${y}" text-anchor="middle" font-family="${F}" font-weight="500" font-size="28" fill="${C.textMuted}">윤하</text>`;
  y += 70;
  // 녹음 버튼
  s += `<circle cx="${cx}" cy="${y + 30}" r="48" fill="${C.record}"/>`;
  s += `<rect x="${cx - 11}" y="${y + 8}" width="22" height="32" rx="11" fill="${C.onAccent}"/><path d="M ${cx - 20} ${y + 34} a 20 20 0 0 0 40 0" fill="none" stroke="${C.onAccent}" stroke-width="4"/><line x1="${cx}" y1="${y + 54}" x2="${cx}" y2="${y + 64}" stroke="${C.onAccent}" stroke-width="4"/>`;
  y += 120;
  // 버전 카드들
  const versions = [
    ['2026년 6월 21일', 5, '고음까지 안정적! 이 버전 대표로', true],
    ['2026년 6월 18일', 4, '2절 박자를 살짝 놓침', false],
    ['2026년 6월 15일', 3, '첫 도전 — 가사 익히는 중', false],
  ];
  const vH = 168;
  versions.forEach(([date, rating, memo, isDefault], i) => {
    const vy = y + i * (vH + 20);
    s += `<rect x="${left}" y="${vy}" width="${innerW}" height="${vH}" rx="22" fill="${C.surface}"/>`;
    s += `<text x="${left + 28}" y="${vy + 50}" font-family="${F}" font-weight="600" font-size="28" fill="${C.text}">${esc(date)}</text>`;
    if (isDefault) {
      s += `<rect x="${left + 230}" y="${vy + 26}" width="92" height="38" rx="12" fill="${C.surfaceAlt}"/><text x="${left + 276}" y="${vy + 52}" text-anchor="middle" font-family="${F}" font-weight="600" font-size="22" fill="${C.accentStrong}">대표</text>`;
    }
    s += stars(left + 28 + 11, vy + 96, rating, 13, 8);
    s += `<text x="${left + 28}" y="${vy + 142}" font-family="${F}" font-weight="500" font-size="24" fill="${C.textMuted}">${esc(memo)}</text>`;
  });
  return frameWrap({ headline: '녹음하고 별점·메모로 기록', sub: '버전마다 그때 그 느낌을 기록해요', screen: top.svg + s });
}

// ============ Screenshot 3: 플레이리스트 ============
function screen3() {
  const left = SX + PAD;
  const innerW = SW - PAD * 2;
  // 헤더 우측 정렬/추가
  const actions = `
    <rect x="${SX + SW - PAD - 200}" y="${SY + 122}" width="120" height="48" rx="14" fill="${C.surface}" stroke="${C.border}" stroke-width="2"/>
    <text x="${SX + SW - PAD - 140}" y="${SY + 153}" text-anchor="middle" font-family="${F}" font-weight="500" font-size="24" fill="${C.text}">최신순</text>
    <circle cx="${SX + SW - PAD - 26}" cy="${SY + 145}" r="26" fill="${C.surfaceAlt}"/><text x="${SX + SW - PAD - 26}" y="${SY + 156}" text-anchor="middle" font-family="${F}" font-weight="700" font-size="36" fill="${C.text}">+</text>`;
  const top = screenTop(actions);
  let y = top.contentY + 20;
  // 플레이리스트 헤더
  let s = albumArt(left, y, 180, 9, 24);
  s += `<text x="${left + 210}" y="${y + 56}" font-family="${F}" font-weight="700" font-size="38" fill="${C.text}">워밍업 셋리스트</text>`;
  s += `<text x="${left + 210}" y="${y + 100}" font-family="${F}" font-weight="500" font-size="26" fill="${C.textMuted}">8곡</text>`;
  // 전체 재생 버튼
  s += `<rect x="${left + 210}" y="${y + 124}" width="190" height="58" rx="29" fill="${C.accentStrong}"/><polygon points="${left + 248},${y + 140} ${left + 248},${y + 166} ${left + 270},${y + 153}" fill="${C.onAccent}"/><text x="${left + 286}" y="${y + 162}" font-family="${F}" font-weight="600" font-size="26" fill="${C.onAccent}">전체 재생</text>`;
  y += 230;
  const tracks = [
    ['밤편지', '아이유', 5],
    ['신호등', '이무진', 4],
    ['사건의 지평선', '윤하', 5],
    ['주저하는 연인들을 위해', '잔나비', 5],
    ['그대 떠난 뒤', '버즈', 4],
    ['이런 밤', '폴킴', 4],
  ];
  const tH = 116;
  tracks.forEach(([title, artist, rating], i) => {
    const ty = y + i * (tH + 16);
    s += `<rect x="${left}" y="${ty}" width="${innerW}" height="${tH}" rx="20" fill="${C.surface}"/>`;
    s += `<circle cx="${left + 50}" cy="${ty + tH / 2}" r="26" fill="${C.surfaceAlt}"/><text x="${left + 50}" y="${ty + tH / 2 + 10}" text-anchor="middle" font-family="${F}" font-weight="600" font-size="26" fill="${C.textMuted}">${i + 1}</text>`;
    s += `<text x="${left + 100}" y="${ty + tH / 2 - 4}" font-family="${F}" font-weight="600" font-size="29" fill="${C.text}">${esc(title)}</text>`;
    s += `<text x="${left + 100}" y="${ty + tH / 2 + 34}" font-family="${F}" font-weight="500" font-size="23" fill="${C.textMuted}">${esc(artist)}</text>`;
    s += `${starPath(left + innerW - 150, ty + tH / 2, 12)} fill="${C.star}"/><text x="${left + innerW - 128}" y="${ty + tH / 2 + 9}" font-family="${F}" font-weight="600" font-size="26" fill="${C.textMuted}">${rating}</text>`;
    // drag handle
    s += `<g stroke="${C.textMuted}" stroke-width="3" stroke-linecap="round" opacity="0.7"><line x1="${left + innerW - 64}" y1="${ty + tH / 2 - 10}" x2="${left + innerW - 36}" y2="${ty + tH / 2 - 10}"/><line x1="${left + innerW - 64}" y1="${ty + tH / 2}" x2="${left + innerW - 36}" y2="${ty + tH / 2}"/><line x1="${left + innerW - 64}" y1="${ty + tH / 2 + 10}" x2="${left + innerW - 36}" y2="${ty + tH / 2 + 10}"/></g>`;
  });
  return frameWrap({ headline: '나만의 셋리스트로 정리', sub: '드래그로 순서를 바꾸고 이어 듣기', screen: top.svg + s });
}

// ============ Screenshot 4: 재생 화면 ============
function screen4() {
  const cx = SX + SW / 2;
  const top = screenTop();
  let y = top.contentY + 40;
  // 큰 앨범아트
  const size = SW - PAD * 2 - 40;
  let s = albumArt(cx - size / 2, y, size, 11, 40);
  y += size + 90;
  s += `<text x="${cx}" y="${y}" text-anchor="middle" font-family="${F}" font-weight="700" font-size="46" fill="${C.text}">밤편지</text>`;
  y += 56;
  s += `<text x="${cx}" y="${y}" text-anchor="middle" font-family="${F}" font-weight="500" font-size="30" fill="${C.textMuted}">아이유 · 내 녹음 ★★★★★</text>`;
  y += 90;
  // 프로그레스(웨이브폼 형태)
  const left = SX + PAD + 10;
  const innerW = SW - (PAD + 10) * 2;
  const n = 44;
  const played = Math.floor(n * 0.42);
  const bw = innerW / n;
  for (let i = 0; i < n; i++) {
    const hh = 12 + Math.abs(Math.sin(i * 0.9)) * 70;
    s += `<rect x="${(left + i * bw).toFixed(1)}" y="${(y - hh / 2).toFixed(1)}" width="${(bw * 0.55).toFixed(1)}" height="${hh.toFixed(1)}" rx="4" fill="${i < played ? C.accentStrong : C.border}"/>`;
  }
  y += 70;
  s += `<text x="${left}" y="${y}" font-family="${F}" font-weight="500" font-size="24" fill="${C.textMuted}">1:24</text>`;
  s += `<text x="${left + innerW}" y="${y}" text-anchor="end" font-family="${F}" font-weight="500" font-size="24" fill="${C.textMuted}">3:18</text>`;
  y += 110;
  // 컨트롤: prev, play, next
  s += `<polygon points="${cx - 150},${y - 26} ${cx - 150},${y + 26} ${cx - 186},${y} " fill="${C.text}"/><rect x="${cx - 192}" y="${y - 26}" width="8" height="52" rx="4" fill="${C.text}"/>`;
  s += `<circle cx="${cx}" cy="${y}" r="62" fill="${C.accentStrong}"/><polygon points="${cx - 18},${y - 28} ${cx - 18},${y + 28} ${cx + 28},${y}" fill="${C.onAccent}"/>`;
  s += `<polygon points="${cx + 150},${y - 26} ${cx + 150},${y + 26} ${cx + 186},${y}" fill="${C.text}"/><rect x="${cx + 184}" y="${y - 26}" width="8" height="52" rx="4" fill="${C.text}"/>`;
  return frameWrap({ headline: '어디서든 다시 듣기', sub: '화면을 꺼도 백그라운드 재생', screen: top.svg + s });
}

// 웨이브폼 막대 블록 (구간 하이라이트/재생 위치 지원)
function waveBlock(left, centerY, width, n, { hl, played, baseColor, hlColor }) {
  const bw = width / n;
  let s = '';
  for (let i = 0; i < n; i++) {
    const hh = 16 + Math.abs(Math.sin(i * 0.7) + Math.sin(i * 0.33)) * 46;
    const x = left + i * bw;
    const frac = i / n;
    let color = baseColor;
    if (hl && frac >= hl[0] && frac <= hl[1]) color = hlColor;
    if (played != null && frac <= played) color = hlColor;
    s += `<rect x="${x.toFixed(1)}" y="${(centerY - hh / 2).toFixed(1)}" width="${(bw * 0.6).toFixed(1)}" height="${hh.toFixed(1)}" rx="3" fill="${color}"/>`;
  }
  return s;
}

// 상태바 점 3개
function statusDots() {
  const rx = SX + SW - PAD;
  return `<rect x="${rx - 84}" y="${SY + 48}" width="22" height="22" rx="4" fill="${C.textMuted}" opacity="0.5"/><rect x="${rx - 56}" y="${SY + 48}" width="22" height="22" rx="4" fill="${C.textMuted}" opacity="0.5"/><rect x="${rx - 28}" y="${SY + 48}" width="22" height="22" rx="4" fill="${C.textMuted}" opacity="0.5"/>`;
}

// ============ Screenshot 5: 구간 편집 ============
function screen5() {
  const left = SX + PAD;
  const innerW = SW - PAD * 2;
  const cx = SX + SW / 2;
  // 상태바 + 모달 헤더(아래 화살표 + 구간 편집)
  let s = `<text x="${left}" y="${SY + 64}" font-family="${F}" font-weight="600" font-size="26" fill="${C.text}">9:41</text>${statusDots()}`;
  const hy = SY + 132;
  s += `<path d="M ${left + 2} ${hy - 8} l 17 17 l 17 -17" fill="none" stroke="${C.text}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  s += `<text x="${cx}" y="${hy + 10}" text-anchor="middle" font-family="${F}" font-weight="600" font-size="30" fill="${C.text}">구간 편집</text>`;

  let y = SY + 640;
  s += `<text x="${cx}" y="${y}" text-anchor="middle" font-family="${F}" font-weight="500" font-size="28" fill="${C.textMuted}">0:48 선택됨</text>`;
  y += 70;
  // 웨이브폼 + 트림 구간
  const wfLeft = left, wfW = innerW, wfH = 200, wfCY = y + wfH / 2;
  const hlA = 0.22, hlB = 0.72;
  s += `<rect x="${wfLeft}" y="${y}" width="${wfW}" height="${wfH}" rx="18" fill="${C.surface}"/>`;
  s += `<rect x="${(wfLeft + wfW * hlA).toFixed(1)}" y="${y + 12}" width="${(wfW * (hlB - hlA)).toFixed(1)}" height="${wfH - 24}" rx="10" fill="${C.surfaceAlt}"/>`;
  s += waveBlock(wfLeft + 18, wfCY, wfW - 36, 46, { hl: [hlA, hlB], baseColor: C.border, hlColor: C.accentStrong });
  [hlA, hlB].forEach((fr) => {
    const hx = wfLeft + wfW * fr;
    s += `<rect x="${(hx - 5).toFixed(1)}" y="${y + 20}" width="10" height="${wfH - 40}" rx="5" fill="${C.accentStrong}"/><circle cx="${hx.toFixed(1)}" cy="${wfCY}" r="15" fill="${C.accentStrong}"/>`;
  });
  y += wfH + 24;
  s += `<text x="${wfLeft + 4}" y="${y}" font-family="${F}" font-weight="500" font-size="24" fill="${C.textMuted}">0:12</text>`;
  s += `<text x="${wfLeft + wfW - 4}" y="${y}" text-anchor="end" font-family="${F}" font-weight="500" font-size="24" fill="${C.textMuted}">1:00</text>`;
  y += 80;
  // 구간 미리듣기
  const pbW = 320, pbX = cx - pbW / 2;
  s += `<rect x="${pbX}" y="${y}" width="${pbW}" height="74" rx="37" fill="${C.accentStrong}"/>`;
  s += `<polygon points="${pbX + 96},${y + 22} ${pbX + 96},${y + 52} ${pbX + 122},${y + 37}" fill="${C.onAccent}"/>`;
  s += `<text x="${pbX + 138}" y="${y + 47}" font-family="${F}" font-weight="600" font-size="27" fill="${C.onAccent}">구간 미리듣기</text>`;
  // 하단 저장 버튼 2개
  const by = SY + SH - 150;
  const bw2 = (innerW - 20) / 2;
  s += `<rect x="${left}" y="${by}" width="${bw2}" height="92" rx="16" fill="${C.surfaceAlt}"/><text x="${left + bw2 / 2}" y="${by + 56}" text-anchor="middle" font-family="${F}" font-weight="600" font-size="26" fill="${C.danger}">원본 덮어쓰기</text>`;
  s += `<rect x="${left + bw2 + 20}" y="${by}" width="${bw2}" height="92" rx="16" fill="${C.accentStrong}"/><text x="${left + bw2 + 20 + bw2 / 2}" y="${by + 56}" text-anchor="middle" font-family="${F}" font-weight="700" font-size="26" fill="${C.onAccent}">새 버전으로 저장</text>`;
  return frameWrap({ headline: '녹음을 원하는 구간만 편집', sub: '마음에 드는 부분만 잘라 저장해요', screen: s });
}

// ============ Screenshot 6: 고음질 + 기본 믹싱 ============
function screen6() {
  const left = SX + PAD;
  const innerW = SW - PAD * 2;
  const cx = SX + SW / 2;
  const top = screenTop();
  let y = top.contentY + 70;
  let s = '';
  // HD 엠블럼
  s += `<circle cx="${cx}" cy="${y + 70}" r="86" fill="${C.surfaceAlt}"/><circle cx="${cx}" cy="${y + 70}" r="86" fill="none" stroke="${C.accentStrong}" stroke-width="3"/>`;
  s += `<text x="${cx}" y="${y + 88}" text-anchor="middle" font-family="${F}" font-weight="800" font-size="56" fill="${C.accentStrong}" letter-spacing="-1">HD</text>`;
  // 반짝임
  s += `${starPath(cx + 96, y + 8, 14)} fill="${C.star}"/>${starPath(cx - 104, y + 96, 9)} fill="${C.star}"/>`;
  y += 210;
  s += `<text x="${cx}" y="${y}" text-anchor="middle" font-family="${F}" font-weight="700" font-size="40" fill="${C.text}">고음질로 녹음돼요</text>`;
  y += 46;
  s += `<text x="${cx}" y="${y}" text-anchor="middle" font-family="${F}" font-weight="500" font-size="26" fill="${C.textMuted}">고음질 저장</text>`;
  y += 64;
  // 깨끗한 풀 웨이브폼
  s += `<rect x="${left}" y="${y}" width="${innerW}" height="150" rx="20" fill="${C.surface}"/>`;
  s += waveBlock(left + 30, y + 75, innerW - 60, 52, { played: 1, baseColor: C.accentStrong, hlColor: C.accentStrong });
  y += 150 + 40;
  // 믹싱 적용 항목
  const rows = ['노이즈 정리', '볼륨 자동 균형', '선명한 보컬'];
  rows.forEach((r, i) => {
    const ry = y + i * (96 + 18);
    const ccx = left + 54, ccy = ry + 48;
    s += `<rect x="${left}" y="${ry}" width="${innerW}" height="96" rx="18" fill="${C.surface}"/>`;
    s += `<circle cx="${ccx}" cy="${ccy}" r="24" fill="${C.success}"/>`;
    s += `<path d="M ${ccx - 11} ${ccy} l 7 8 l 16 -17" fill="none" stroke="${C.onAccent}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    s += `<text x="${left + 100}" y="${ry + 58}" font-family="${F}" font-weight="600" font-size="28" fill="${C.text}">${r}</text>`;
    s += `<text x="${left + innerW - 28}" y="${ry + 58}" text-anchor="end" font-family="${F}" font-weight="600" font-size="24" fill="${C.success}">적용됨</text>`;
  });
  return frameWrap({ headline: '더 좋은 음질, 기본 믹싱까지', sub: '또렷하고 균형 잡힌 소리로 녹음돼요', screen: top.svg + s });
}

// ============ Feature graphic 1024x500 ============
function featureGraphic() {
  const w = 1024, h = 500;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><linearGradient id="bgg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6efe2"/><stop offset="1" stop-color="#efe2cd"/></linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#bgg)"/>`;
  // 큰 웨이브폼 모티브 (우측)
  const bars = [40, 90, 150, 80, 130, 200, 110, 70, 160, 100, 50, 120, 180, 90, 60];
  const bx = 600, bw = 26;
  bars.forEach((bh, i) => {
    const x = bx + i * (bw + 10);
    s += `<rect x="${x}" y="${250 - bh / 2}" width="${bw}" height="${bh}" rx="${bw / 2}" fill="${i % 3 === 0 ? C.accentStrong : C.accent}" opacity="${0.35 + (i % 4) * 0.16}"/>`;
  });
  // 로고 + 카피 (좌측)
  s += logo(70, 150, 2.6);
  s += `<text x="74" y="320" font-family="${F}" font-weight="800" font-size="62" fill="${C.text}" letter-spacing="-2">오늘의 목소리를</text>`;
  s += `<text x="74" y="392" font-family="${F}" font-weight="800" font-size="62" fill="${C.accentStrong}" letter-spacing="-2">기록하다</text>`;
  s += `<text x="76" y="446" font-family="${F}" font-weight="500" font-size="30" fill="${C.textMuted}">나만의 노래 플레이리스트</text>`;
  s += `</svg>`;
  return s;
}

// --- render ---
async function render(name, svg) {
  await sharp(Buffer.from(svg)).png().toFile(path.join(OUT, name));
  console.log('  ✓', name);
}

(async () => {
  console.log('스토어 이미지 생성 중...');
  await render('feature-graphic.png', featureGraphic());
  await render('screenshot-1-songs.png', screen1());
  await render('screenshot-2-quality.png', screen6());
  await render('screenshot-3-detail.png', screen2());
  await render('screenshot-4-playlist.png', screen3());
  await render('screenshot-5-player.png', screen4());
  await render('screenshot-6-trim.png', screen5());
  // 512 아이콘 (기존 아이콘 리사이즈)
  await sharp(path.join(ROOT, 'assets', 'icon.png'))
    .resize(512, 512, { fit: 'cover' })
    .png()
    .toFile(path.join(OUT, 'play-icon-512.png'));
  console.log('  ✓ play-icon-512.png');
  console.log('완료 → store-assets/');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
