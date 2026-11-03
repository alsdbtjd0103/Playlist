// 단어 끝 받침에 맞는 목적격 조사(을/를). 「제목」을 vs 「제목」를 같은 어색함을 없앤다.
// 한글은 받침 유무로, 숫자는 읽는 소리로, 영문은 대략적인 발음(끝 자음)으로 판단한다.
const DIGIT_HAS_BATCHIM: Record<string, boolean> = {
  '0': true, '1': true, '2': false, '3': true, '4': false,
  '5': false, '6': true, '7': true, '8': true, '9': false,
};

export function hasBatchim(word: string): boolean {
  const trimmed = word.trim();
  const last = trimmed.charAt(trimmed.length - 1);
  if (!last) return false;
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (last in DIGIT_HAS_BATCHIM) return DIGIT_HAS_BATCHIM[last];
  // 영문: l·m·n·r(읽을 때 받침처럼 들리는 끝소리)은 받침 있음으로 본다
  return /[lmnr]$/i.test(trimmed);
}

/** "곡" → "곡을", "노래" → "노래를" (닫는 괄호·따옴표 뒤에도 그대로 붙인다) */
export function withObjectParticle(word: string, wrapped = word): string {
  return `${wrapped}${hasBatchim(word) ? '을' : '를'}`;
}
