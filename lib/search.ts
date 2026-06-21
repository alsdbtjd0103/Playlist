const CHOSEONG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ',
  'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

const HANGUL_SYLLABLE_START = 0xac00;
const HANGUL_SYLLABLE_END = 0xd7a3;
const HANGUL_JAMO_START = 0x3131;
const HANGUL_JAMO_END = 0x314e;

export function getChoseong(char: string): string {
  if (char.length === 0) return char;
  const code = char.charCodeAt(0);
  if (code < HANGUL_SYLLABLE_START || code > HANGUL_SYLLABLE_END) {
    return char;
  }
  const choseongIndex = Math.floor((code - HANGUL_SYLLABLE_START) / 588);
  return CHOSEONG[choseongIndex] ?? char;
}

export function extractChoseong(text: string): string {
  let result = '';
  for (const char of text) {
    result += getChoseong(char);
  }
  return result;
}

function isHangulJamo(char: string): boolean {
  if (char.length === 0) return false;
  const code = char.charCodeAt(0);
  return code >= HANGUL_JAMO_START && code <= HANGUL_JAMO_END;
}

function stripWhitespace(text: string): string {
  return text.replace(/\s+/g, '');
}

export function matchesSearch(target: string, query: string): boolean {
  const normalizedQuery = stripWhitespace(query);
  if (normalizedQuery.length === 0) return true;

  const normalizedTarget = stripWhitespace(target);
  const lowerQuery = normalizedQuery.toLowerCase();
  const lowerTarget = normalizedTarget.toLowerCase();

  if (lowerTarget.includes(lowerQuery)) return true;

  const isAllJamo = [...normalizedQuery].every(isHangulJamo);
  if (isAllJamo) {
    const targetChoseong = extractChoseong(normalizedTarget);
    if (targetChoseong.includes(normalizedQuery)) return true;
  }

  return false;
}
