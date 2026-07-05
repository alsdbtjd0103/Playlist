import { requireNativeModule } from 'expo-modules-core';

/** 렌더 결과 */
export interface RenderResult {
  /** 잘라 이어붙인 m4a 파일 uri (임시 위치 — 호출측이 영구 저장) */
  uri: string;
  /** 결과 오디오 길이(초) */
  duration: number;
}

/** 남길 구간(초 단위, 원본 타임라인) */
export interface KeepSegment {
  start: number;
  end: number;
}

/** 네이티브 모듈 인터페이스 */
export interface AudioEditNative {
  /**
   * 입력 m4a에서 keepSegments만 순서대로 이어붙여 새 m4a로 렌더.
   * iOS: AVMutableComposition + AVAssetExportSession(AppleM4A)
   * Android: MediaExtractor + MediaMuxer (재인코딩 없이 무손실)
   */
  renderCuts(inputUri: string, keepSegments: KeepSegment[], outputUri: string): Promise<RenderResult>;
}

/**
 * 네이티브 모듈 핸들을 반환. 미존재(Expo Go 등) 시 null.
 * requireNativeModule은 없으면 throw → try-catch로 가용성 판단.
 */
export function getAudioEditModule(): AudioEditNative | null {
  try {
    return requireNativeModule('AudioEdit') as AudioEditNative;
  } catch {
    return null;
  }
}
