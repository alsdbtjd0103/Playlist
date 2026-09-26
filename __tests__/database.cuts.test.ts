import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyCutsToVersion, createEditedVersion, getVersion } from '../lib/database';
import { editedDuration } from '../lib/trim';

beforeEach(async () => {
  await AsyncStorage.clear();
});

const seedVersion = async () => {
  await AsyncStorage.setItem('@songs', JSON.stringify([{ id: 'song1', title: 'T', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }]));
  await AsyncStorage.setItem('@versions', JSON.stringify([{
    id: 'v1', songId: 'song1', fileName: 'a.m4a', storageUrl: 'file:///a.m4a',
    rating: 3, duration: 10, recordedAt: '2026-01-01T00:00:00.000Z', waveform: [1, 2, 3],
  }]));
};

describe('applyCutsToVersion', () => {
  it('비파괴로 cuts를 저장한다', async () => {
    await seedVersion();
    const cuts = [{ start: 2, end: 3 }, { start: 6, end: 7 }];
    await applyCutsToVersion('v1', cuts);
    const v = await getVersion('v1');
    expect(v?.cuts).toEqual(cuts);
    // 원본 파일은 그대로
    expect(v?.storageUrl).toBe('file:///a.m4a');
  });
});

describe('createEditedVersion', () => {
  it('원본 파일 참조 + cuts/editedFrom + 원본 길이 유지(편집 길이는 파생)', async () => {
    await seedVersion();
    const cuts = [{ start: 2, end: 5 }]; // 10초 중 3초 삭제 → 편집 후 7초
    const newId = await createEditedVersion('v1', cuts);
    const nv = await getVersion(newId);
    expect(nv?.storageUrl).toBe('file:///a.m4a');
    expect(nv?.cuts).toEqual(cuts);
    expect(nv?.editedFrom).toBe('v1');
    // 비파괴이므로 duration은 원본(10) 유지 — 재생/시크 정합성
    expect(nv?.duration).toBeCloseTo(10);
    // 편집 후 길이는 파생 계산
    expect(editedDuration(nv!.cuts!, nv!.duration!)).toBeCloseTo(7);
    expect(nv?.waveform).toEqual([1, 2, 3]);
  });

  it('원본이 없으면 에러', async () => {
    await expect(createEditedVersion('nope', [])).rejects.toThrow();
  });
});
