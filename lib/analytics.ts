// 사용자 행동 분석(Analytics)
// -----------------------------------------------------------------------------
// 네이티브 의존성 없이 PostHog의 HTTP capture API로 이벤트를 전송하는 경량 래퍼입니다.
// (별도 SDK·네이티브 빌드 변경 없이 동작 → 기존 빌드/배포에 영향 없음)
//
// ▶ 사용자가 설정해야 할 것 (단 한 곳):
//   1) https://posthog.com 가입 → 프로젝트 생성 (무료 플랜 충분)
//   2) Project Settings에서 "Project API Key"(phc_... 로 시작) 복사
//   3) 아래 POSTHOG_API_KEY 에 붙여넣기
//   4) 지역이 EU 프로젝트면 POSTHOG_HOST 를 https://eu.i.posthog.com 으로 변경
//
// 키를 비워두면 분석이 자동으로 '비활성화'되며 앱 동작에는 전혀 영향을 주지 않습니다.
// (개발 중에는 비활성, 출시 빌드에만 키를 채워도 됩니다.)
// -----------------------------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const POSTHOG_API_KEY = 'phc_kggLspoto9ijpFwEAXJJUwMSqcfPWaXBPwz3GNfzLvya';
const POSTHOG_HOST = 'https://us.i.posthog.com'; // EU 프로젝트면 https://eu.i.posthog.com

const DISTINCT_ID_KEY = '@analytics_distinct_id';

let distinctIdCache: string | null = null;

const isEnabled = (): boolean => POSTHOG_API_KEY.length > 0;

// 디바이스마다 1개의 익명 식별자를 만들어 저장합니다(개인정보 아님).
const getDistinctId = async (): Promise<string> => {
  if (distinctIdCache) return distinctIdCache;
  try {
    const stored = await AsyncStorage.getItem(DISTINCT_ID_KEY);
    if (stored) {
      distinctIdCache = stored;
      return stored;
    }
  } catch {
    // 저장소 접근 실패 시에도 분석이 앱을 막지 않도록 무시
  }
  const generated = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  distinctIdCache = generated;
  try {
    await AsyncStorage.setItem(DISTINCT_ID_KEY, generated);
  } catch {
    // 무시
  }
  return generated;
};

/**
 * 사용자 행동 이벤트를 전송합니다.
 * 분석 실패는 절대 앱 흐름을 막지 않습니다(모든 에러는 조용히 무시).
 *
 * @example logEvent('version_played', { rating: 5 })
 */
export const logEvent = async (
  event: string,
  properties?: Record<string, unknown>
): Promise<void> => {
  if (!isEnabled()) return;
  try {
    const distinctId = await getDistinctId();
    await fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_API_KEY,
        event,
        distinct_id: distinctId,
        properties: {
          ...properties,
          platform: Platform.OS,
          $lib: 'plilog-rn',
        },
      }),
    });
  } catch {
    // 네트워크/응답 오류는 무시 — 분석은 부가 기능
  }
};

/**
 * 화면 진입을 기록합니다.
 * @example logScreen('SongDetail')
 */
export const logScreen = (screenName: string): void => {
  void logEvent('$screen', { $screen_name: screenName });
};
