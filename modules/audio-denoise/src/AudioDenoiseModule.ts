import { requireNativeModule } from 'expo-modules-core';

/** 잡음 제거 결과 */
export interface DenoiseResult {
  /** 정제된 m4a 파일 uri (임시 위치 — 호출측이 영구 저장) */
  uri: string;
  /** 디코드 부산물로 추출한 진폭 엔벨로프(정제본 파형용, 선택) */
  waveform?: number[];
}

/** 네이티브 모듈 인터페이스 */
export interface AudioDenoiseNative {
  /**
   * m4a 녹음을 디코드 → DeepFilterNet 추론 → m4a 재인코딩.
   * 진행률은 'onProgress' 이벤트({ progress: 0~1 })로 별도 emit.
   */
  denoise(srcUri: string): Promise<DenoiseResult>;
}

/**
 * 네이티브 모듈 핸들을 반환. 미존재(Expo Go 등) 시 null.
 * requireNativeModule은 없으면 throw → try-catch로 가용성 판단.
 */
export function getAudioDenoiseModule(): AudioDenoiseNative | null {
  try {
    return requireNativeModule('AudioDenoise') as AudioDenoiseNative;
  } catch {
    return null;
  }
}

/** 진행률 이벤트 구독. 미가용 시 null. best-effort(UI 표시용). */
export function addDenoiseProgressListener(
  listener: (progress: number) => void
): { remove: () => void } | null {
  try {
    // 지연 로드: 네이티브 미가용 환경에서 import 실패해도 전체가 죽지 않도록.
    const { EventEmitter } = require('expo-modules-core');
    const mod = getAudioDenoiseModule();
    if (!mod) return null;
    const emitter = new EventEmitter(mod as any);
    const sub = emitter.addListener('onProgress', (e: { progress: number }) =>
      listener(e?.progress ?? 0)
    );
    return { remove: () => sub.remove() };
  } catch {
    return null;
  }
}
