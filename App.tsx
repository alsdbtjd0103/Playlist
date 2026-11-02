import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { View, BackHandler, ToastAndroid, Platform, Pressable, Text, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  NavigationContainer,
  DefaultTheme as NavLightTheme,
  DarkTheme as NavDarkTheme,
  useNavigationContainerRef,
  StackActions,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Ionicons } from '@expo/vector-icons';
import TrackPlayer from 'react-native-track-player';
import { PlaybackService } from './services/PlaybackService';
import { RootStackParamList } from './types';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { useAppFonts } from './lib/fonts';
import { ColorTokens, fontFamily, spacing } from './lib/theme';
import { SettingsProvider } from './contexts/SettingsContext';
import { ToastProvider } from './contexts/ToastContext';
import { tabPressAction, ROOT_SCREEN_BY_TAB } from './lib/tabNav';
import { haptic } from './lib/haptics';

// TrackPlayer 백그라운드 서비스 등록
TrackPlayer.registerPlaybackService(() => PlaybackService);

import HomeScreen from './screens/HomeScreen';
import SongDetailScreen from './screens/SongDetailScreen';
import TrimEditorScreen from './screens/TrimEditorScreen';
import DenoiseScreen from './screens/DenoiseScreen';
import PlaylistsScreen from './screens/PlaylistsScreen';
import PlaylistDetailScreen from './screens/PlaylistDetailScreen';
import SettingsScreen from './screens/SettingsScreen';
import ExportScreen from './screens/ExportScreen';
import MemoFeedScreen from './screens/MemoFeedScreen';
import { PlayerProvider } from './contexts/PlayerContext';
import MiniPlayer from './components/MiniPlayer';
import NowPlayingScreen from './components/NowPlayingScreen';

SplashScreen.preventAutoHideAsync().catch(() => {});

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator<RootStackParamList>();
const PlaylistStack = createNativeStackNavigator<RootStackParamList>();
const SettingsStack = createNativeStackNavigator<RootStackParamList>();
const MemoStack = createNativeStackNavigator<RootStackParamList>();

function HomeStackScreen({ bg }: { bg: string }) {
  return (
    <HomeStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: Platform.OS === 'ios' ? 'default' : 'fade', // iOS 는 기본 애니메이션이어야 스와이프 뒤로가기가 자연스럽다
        animationDuration: 150,
        contentStyle: { backgroundColor: bg },
        // 상세 화면은 스와이프로 뒤로 갈 수 있게 한다(편집기 같은 전체화면 모달은 화면별로 끈다)
        gestureEnabled: true,
      }}
    >
      <HomeStack.Screen name="Home" component={HomeScreen} />
      <HomeStack.Screen name="SongDetail" component={SongDetailScreen} />
      <HomeStack.Screen
        name="TrimEditor"
        component={TrimEditorScreen}
        options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
      />
      <HomeStack.Screen
        name="Denoise"
        component={DenoiseScreen}
        options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
      />
    </HomeStack.Navigator>
  );
}

function PlaylistStackScreen({ bg }: { bg: string }) {
  return (
    <PlaylistStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: Platform.OS === 'ios' ? 'default' : 'fade', // iOS 는 기본 애니메이션이어야 스와이프 뒤로가기가 자연스럽다
        animationDuration: 150,
        contentStyle: { backgroundColor: bg },
        // 상세 화면은 스와이프로 뒤로 갈 수 있게 한다(편집기 같은 전체화면 모달은 화면별로 끈다)
        gestureEnabled: true,
      }}
    >
      <PlaylistStack.Screen name="Playlists" component={PlaylistsScreen} />
      <PlaylistStack.Screen name="PlaylistDetail" component={PlaylistDetailScreen} />
    </PlaylistStack.Navigator>
  );
}

function MemoStackScreen({ bg }: { bg: string }) {
  return (
    <MemoStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: Platform.OS === 'ios' ? 'default' : 'fade', // iOS 는 기본 애니메이션이어야 스와이프 뒤로가기가 자연스럽다
        animationDuration: 150,
        contentStyle: { backgroundColor: bg },
        // 상세 화면은 스와이프로 뒤로 갈 수 있게 한다(편집기 같은 전체화면 모달은 화면별로 끈다)
        gestureEnabled: true,
      }}
    >
      <MemoStack.Screen name="MemoFeed" component={MemoFeedScreen} />
    </MemoStack.Navigator>
  );
}

function SettingsStackScreen({ bg }: { bg: string }) {
  return (
    <SettingsStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: Platform.OS === 'ios' ? 'default' : 'fade', // iOS 는 기본 애니메이션이어야 스와이프 뒤로가기가 자연스럽다
        animationDuration: 150,
        contentStyle: { backgroundColor: bg },
        // 상세 화면은 스와이프로 뒤로 갈 수 있게 한다(편집기 같은 전체화면 모달은 화면별로 끈다)
        gestureEnabled: true,
      }}
    >
      <SettingsStack.Screen name="Settings" component={SettingsScreen} />
      <SettingsStack.Screen name="Export" component={ExportScreen} />
    </SettingsStack.Navigator>
  );
}

const TAB_ICONS: Record<string, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  HomeTab: { on: 'musical-notes', off: 'musical-notes-outline' },
  PlaylistTab: { on: 'albums', off: 'albums-outline' },
  MemoTab: { on: 'document-text', off: 'document-text-outline' },
  SettingsTab: { on: 'settings', off: 'settings-outline' },
};

const FULLSCREEN_SCREENS = new Set(['TrimEditor', 'Denoise']);

// 화면 가장자리에서 띄운 둥근 탭바. 선택된 탭은 아이콘 뒤에 알약 모양 표시를 둔다.
function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => makeTabStyles(colors), [colors]);
  const activeColor = scheme === 'dark' ? colors.accent : colors.accentStrong;

  // 편집기 같은 전체화면 작업 중에는 탭바·미니 플레이어를 숨긴다. Android 는 전체화면 모달이
  // 탭바를 덮지 않아, 편집 도중 탭을 눌러 화면을 벗어나면 편집 내용이 사라질 수 있다.
  const focusedTab = state.routes[state.index]?.state as { index?: number; routes?: { name: string }[] } | undefined;
  const topScreen = focusedTab?.routes?.[focusedTab.index ?? 0]?.name;
  if (topScreen && FULLSCREEN_SCREENS.has(topScreen)) return null;

  return (
    <View style={styles.wrap}>
      <MiniPlayer />
      <View style={[styles.bar, { marginBottom: Math.max(insets.bottom, spacing.sm) }]}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label =
            options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
                ? options.title
                : route.name;

          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (event.defaultPrevented) return;
            haptic('selection');
            const nested = route.state as { index?: number; key?: string } | undefined;
            const action = tabPressAction({ isFocused, nestedIndex: nested?.index });
            if (action === 'navigate') {
              navigation.navigate(route.name);
            } else if (action === 'navigateToRoot' && nested?.key) {
              // 탭으로 옮긴 뒤 popToTop 으로 첫 화면까지 되돌린다. navigate(탭, { screen }) 은
              // beforeRemove 를 거치지 않아 편집기의 "편집 내용 버리기" 확인 없이 화면을 지운다.
              navigation.navigate(route.name);
              navigation.dispatch({ ...StackActions.popToTop(), target: nested.key });
            } else if (action === 'popToRoot' && nested?.key) {
              navigation.dispatch({ ...StackActions.popToTop(), target: nested.key });
            }
          };

          const icons = TAB_ICONS[route.name];
          const tint = isFocused ? activeColor : colors.textMuted;

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={label as string}
              testID={`tab-${route.name}`}
            >
              {/* 선택 상태가 바뀔 때 다시 마운트한다: 이미 그려진 View 에 배경이 생기면
                  Android(신 아키텍처)에서 모서리 둥글기가 적용되지 않는다 */}
              <View
                key={isFocused ? 'on' : 'off'}
                style={[styles.indicator, isFocused && { backgroundColor: colors.surfaceAlt }]}
              >
                <Ionicons name={(isFocused ? icons?.on : icons?.off) ?? 'ellipse'} size={22} color={tint} />
              </View>
              <Text style={[styles.label, { color: tint }, isFocused && styles.labelActive]}>{label as string}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const makeTabStyles = (c: ColorTokens) =>
  StyleSheet.create({
    wrap: {
      backgroundColor: c.bg,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
      gap: spacing.sm,
    },
    bar: {
      flexDirection: 'row',
      backgroundColor: c.surface,
      borderRadius: 28,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      paddingVertical: 6,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      minHeight: 52,
    },
    indicator: {
      width: 56,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
    },
    labelActive: {
      fontFamily: fontFamily.bold,
    },
  });

function AppInner() {
  const { colors, scheme } = useTheme();
  const fontsLoaded = useAppFonts();
  const navigationRef = useNavigationContainerRef();
  const backPressedOnce = useRef(false);

  const handleBackPress = useCallback(() => {
    const state = navigationRef.current?.getRootState();
    if (!state) return false;

    const currentTabRoute = state.routes[state.index];
    const tabState = currentTabRoute?.state;

    if (tabState && tabState.index && tabState.index > 0) {
      return false;
    }

    // 노래 탭이 아닌 탭의 첫 화면에서는 종료를 묻지 않고 노래 탭으로 돌아간다
    if (currentTabRoute && currentTabRoute.name !== 'HomeTab') {
      navigationRef.current?.navigate('HomeTab' as never);
      return true;
    }

    if (backPressedOnce.current) {
      BackHandler.exitApp();
      return true;
    }

    backPressedOnce.current = true;
    if (Platform.OS === 'android') {
      ToastAndroid.show('한 번 더 누르면 종료됩니다', ToastAndroid.SHORT);
    }

    setTimeout(() => {
      backPressedOnce.current = false;
    }, 2000);

    return true;
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => subscription.remove();
  }, [handleBackPress]);

  const onLayout = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  const navTheme = useMemo(() => {
    const base = scheme === 'dark' ? NavDarkTheme : NavLightTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: colors.bg,
        card: colors.bg,
        text: colors.text,
        border: colors.border,
        primary: colors.accent,
      },
    };
  }, [scheme, colors]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }} onLayout={onLayout}>
      <SafeAreaProvider>
        <SettingsProvider>
        <ToastProvider bottomOffset={150}>
        <PlayerProvider>
          <NavigationContainer ref={navigationRef} theme={navTheme}>
            <View style={{ flex: 1 }}>
              <Tab.Navigator
                tabBar={(props) => <CustomTabBar {...props} />}
                sceneContainerStyle={{ backgroundColor: colors.bg }}
                screenOptions={{ headerShown: false }}
              >
                <Tab.Screen name="HomeTab" options={{ tabBarLabel: '노래' }}>
                  {() => <HomeStackScreen bg={colors.bg} />}
                </Tab.Screen>
                <Tab.Screen name="PlaylistTab" options={{ tabBarLabel: '플레이리스트' }}>
                  {() => <PlaylistStackScreen bg={colors.bg} />}
                </Tab.Screen>
                <Tab.Screen name="MemoTab" options={{ tabBarLabel: '메모' }}>
                  {() => <MemoStackScreen bg={colors.bg} />}
                </Tab.Screen>
                <Tab.Screen name="SettingsTab" options={{ tabBarLabel: '설정' }}>
                  {() => <SettingsStackScreen bg={colors.bg} />}
                </Tab.Screen>
              </Tab.Navigator>
              <NowPlayingScreen />
            </View>
          </NavigationContainer>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        </PlayerProvider>
        </ToastProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}
