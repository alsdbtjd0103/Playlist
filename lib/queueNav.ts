// 재생 큐 이동/동기화용 순수 로직 (TrackPlayer 의존 없음)

// 끝에서 다음 → 처음, 처음에서 이전 → 끝으로 순환. 빈 큐는 -1.
export function wrapIndex(current: number, step: 1 | -1, length: number): number {
  if (length <= 0) return -1;
  return (((current + step) % length) + length) % length;
}

export interface QueueSyncPlan {
  before: string[];
  after: string[];
  currentIndex: number;
  currentInTarget: boolean;
}

// 현재 곡을 끊지 않고 큐를 새 순서로 맞추기 위해, 현재 곡 기준 앞/뒤 목록을 계산한다.
// 현재 곡이 새 목록에서 빠졌으면 현재 곡을 맨 앞에 두고 새 목록 전체를 뒤에 붙인다.
export function planQueueSync(targetIds: string[], currentId: string): QueueSyncPlan {
  const idx = targetIds.indexOf(currentId);
  if (idx === -1) {
    return { before: [], after: targetIds.slice(), currentIndex: 0, currentInTarget: false };
  }
  return {
    before: targetIds.slice(0, idx),
    after: targetIds.slice(idx + 1),
    currentIndex: idx,
    currentInTarget: true,
  };
}
