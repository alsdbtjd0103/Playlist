import * as Haptics from 'expo-haptics';
import { getSettings } from './settings';

export type HapticKind = 'light' | 'medium' | 'selection' | 'success' | 'warning';

// 설정에서 햅틱을 끈 경우 아무것도 하지 않는다. 실패해도 앱 흐름에는 영향이 없다.
export function haptic(kind: HapticKind = 'light'): void {
  if (!getSettings().haptics) return;
  let run: Promise<void>;
  switch (kind) {
    case 'selection':
      run = Haptics.selectionAsync();
      break;
    case 'success':
      run = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      break;
    case 'warning':
      run = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      break;
    case 'medium':
      run = Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      break;
    default:
      run = Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
  run.catch(() => undefined);
}
