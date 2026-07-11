// 노래방 키(반음 단위 오프셋) 표기 유틸
// 원키 = 0, 미설정 = undefined, 범위 -6 ~ +6

export const KEY_MIN = -6;
export const KEY_MAX = 6;

/** 키 값을 표시용 라벨로 변환. 미설정(undefined)이면 null(렌더 안 함). */
export const formatKey = (key?: number): string | null => {
  if (key === undefined || key === null || Number.isNaN(key)) return null;
  if (key === 0) return '원키';
  if (key > 0) return `+${key}키`;
  return `${key}키`; // 음수는 부호 포함 (예: -2키)
};

/** 범위(KEY_MIN ~ KEY_MAX)로 클램프. */
export const clampKey = (n: number): number => {
  if (Number.isNaN(n)) return 0;
  return Math.max(KEY_MIN, Math.min(KEY_MAX, Math.round(n)));
};
