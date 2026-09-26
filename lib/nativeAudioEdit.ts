import { Paths, Directory, File } from 'expo-file-system';
import { getAudioEditModule, RenderResult } from '../modules/audio-edit';
import { TrimRange, keepSegments, editedDuration } from './trim';

/** 네이티브 오디오 편집 모듈 가용 여부 (Expo Go 등에서는 false). */
export function isAudioEditAvailable(): boolean {
  return getAudioEditModule() !== null;
}

/** 임시 출력 경로 생성(recordings/{songId}/ 규칙 재사용). */
function makeOutputUri(songId: string): string {
  const base = new Directory(Paths.document, 'recordings');
  if (!base.exists) base.create();
  const dir = new Directory(base, songId);
  if (!dir.exists) dir.create();
  const fileName = `${songId}_edit_${Date.now()}.m4a`;
  return new File(dir, fileName).uri;
}

/**
 * cuts(삭제 구간)를 실제로 잘라 이어붙인 새 m4a를 만든다.
 * @throws 모듈 미가용 시
 */
export async function renderCutsToFile(
  inputUri: string,
  cuts: TrimRange[],
  duration: number,
  songId: string
): Promise<RenderResult> {
  const mod = getAudioEditModule();
  if (!mod) throw new Error('오디오 편집 모듈을 사용할 수 없습니다.');
  const keep = keepSegments(cuts, duration);
  if (keep.length === 0) throw new Error('남길 구간이 없습니다.');
  const outputUri = makeOutputUri(songId);
  const result = await mod.renderCuts(inputUri, keep, outputUri);
  // 네이티브가 duration을 못 주면 파생값으로 보정
  return {
    uri: result.uri ?? outputUri,
    duration: result.duration || editedDuration(cuts, duration),
  };
}

export type { RenderResult };
