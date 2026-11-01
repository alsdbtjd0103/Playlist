import { useFonts as useExpoFonts } from 'expo-font';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope';

// 본문/UI 는 Pretendard(한·영 일관), plilog 워드마크는 Manrope.
export function useAppFonts(): boolean {
  const [loaded, error] = useExpoFonts({
    'Pretendard-Regular': require('../assets/fonts/Pretendard-Regular.otf'),
    'Pretendard-Medium': require('../assets/fonts/Pretendard-Medium.otf'),
    'Pretendard-SemiBold': require('../assets/fonts/Pretendard-SemiBold.otf'),
    'Pretendard-Bold': require('../assets/fonts/Pretendard-Bold.otf'),
    'Pretendard-ExtraBold': require('../assets/fonts/Pretendard-ExtraBold.otf'),
    Manrope_800ExtraBold,
  });
  // 폰트 로드가 실패해도 시스템 폰트로 앱은 떠야 한다(아니면 스플래시에서 멈춘다)
  if (error) console.error('폰트 로드 실패:', error);
  return loaded || !!error;
}
