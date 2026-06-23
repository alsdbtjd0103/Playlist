import {
  getAudioDenoiseModule,
  addDenoiseProgressListener,
  DenoiseResult,
} from '../modules/audio-denoise';

/** 네이티브 잡음 제거 모듈 가용 여부 (Expo Go 등에서는 false). */
export function isNativeDenoiseAvailable(): boolean {
  return getAudioDenoiseModule() !== null;
}

/**
 * 녹음을 잡음 제거해 정제된 임시 m4a 파일을 만든다.
 * @throws 모듈 미가용 시
 */
export async function denoiseToFile(srcUri: string): Promise<DenoiseResult> {
  const mod = getAudioDenoiseModule();
  if (!mod) throw new Error('잡음 제거 모듈을 사용할 수 없습니다.');
  return mod.denoise(srcUri);
}

/** 진행률(0~1) 구독. 미가용 시 null. UI 표시용 best-effort. */
export function onDenoiseProgress(
  listener: (progress: number) => void
): { remove: () => void } | null {
  return addDenoiseProgressListener(listener);
}

export type { DenoiseResult };
