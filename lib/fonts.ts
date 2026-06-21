import { useFonts as useExpoFonts } from 'expo-font';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope';

// 본문/UI 는 Pretendard(한·영 일관), plilog 워드마크는 Manrope.
export function useAppFonts(): boolean {
  const [loaded] = useExpoFonts({
    'Pretendard-Regular': require('../assets/fonts/Pretendard-Regular.otf'),
    'Pretendard-Medium': require('../assets/fonts/Pretendard-Medium.otf'),
    'Pretendard-SemiBold': require('../assets/fonts/Pretendard-SemiBold.otf'),
    'Pretendard-Bold': require('../assets/fonts/Pretendard-Bold.otf'),
    'Pretendard-ExtraBold': require('../assets/fonts/Pretendard-ExtraBold.otf'),
    Manrope_800ExtraBold,
  });
  return loaded;
}
