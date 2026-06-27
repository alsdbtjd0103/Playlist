import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { View, BackHandler, ToastAndroid, Platform, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  NavigationContainer,
  DefaultTheme as NavLightTheme,
  DarkTheme as NavDarkTheme,
  useNavigationContainerRef,
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
import { ColorTokens, fontFamily } from './lib/theme';

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
import { PlayerProvider } from './contexts/PlayerContext';
import MiniPlayer from './components/MiniPlayer';
import NowPlayingScreen from './components/NowPlayingScreen';

SplashScreen.preventAutoHideAsync().catch(() => {});

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator<RootStackParamList>();
const PlaylistStack = createNativeStackNavigator<RootStackParamList>();
const SettingsStack = createNativeStackNavigator<RootStackParamList>();

function HomeStackScreen({ bg }: { bg: string }) {
  return (
    <HomeStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        animationDuration: 150,
        contentStyle: { backgroundColor: bg },
        gestureEnabled: false,
      }}
    >
      <HomeStack.Screen name="Home" component={HomeScreen} />
      <HomeStack.Screen name="SongDetail" component={SongDetailScreen} />
      <HomeStack.Screen name="TrimEditor" component={TrimEditorScreen} options={{ presentation: 'fullScreenModal' }} />
      <HomeStack.Screen name="Denoise" component={DenoiseScreen} options={{ presentation: 'fullScreenModal' }} />
    </HomeStack.Navigator>
  );
}

function PlaylistStackScreen({ bg }: { bg: string }) {
  return (
    <PlaylistStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        animationDuration: 150,
        contentStyle: { backgroundColor: bg },
        gestureEnabled: false,
      }}
    >
      <PlaylistStack.Screen name="Playlists" component={PlaylistsScreen} />
      <PlaylistStack.Screen name="PlaylistDetail" component={PlaylistDetailScreen} />
    </PlaylistStack.Navigator>
  );
}

function SettingsStackScreen({ bg }: { bg: string }) {
  return (
    <SettingsStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        animationDuration: 150,
        contentStyle: { backgroundColor: bg },
        gestureEnabled: false,
      }}
    >
      <SettingsStack.Screen name="Settings" component={SettingsScreen} />
      <SettingsStack.Screen name="Export" component={ExportScreen} />
    </SettingsStack.Navigator>
  );
}

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => makeTabStyles(colors), [colors]);
  const activeColor = scheme === 'dark' ? colors.accent : colors.accentStrong;

  return (
    <View>
      <MiniPlayer />
      <View style={[styles.container, { paddingBottom: insets.bottom > 0 ? insets.bottom : 8 }]}>
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
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const iconByRoute: Record<string, any> = {
            HomeTab: 'musical-notes',
            PlaylistTab: 'albums',
            SettingsTab: 'settings-outline',
          };
          const iconName = iconByRoute[route.name] ?? 'ellipse';
          const tint = isFocused ? activeColor : colors.textMuted;

          return (
            <TouchableOpacity key={route.key} onPress={onPress} style={styles.tab}>
              <Ionicons name={iconName as any} size={24} color={tint} />
              <Text style={[styles.label, { color: tint }]}>{label as string}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const makeTabStyles = (c: ColorTokens) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      backgroundColor: c.surface,
      borderTopColor: c.border,
      borderTopWidth: 1,
      paddingTop: 8,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    label: {
      fontFamily: fontFamily.semibold,
      fontSize: 11,
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
                <Tab.Screen name="SettingsTab" options={{ tabBarLabel: '설정' }}>
                  {() => <SettingsStackScreen bg={colors.bg} />}
                </Tab.Screen>
              </Tab.Navigator>
              <NowPlayingScreen />
            </View>
          </NavigationContainer>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        </PlayerProvider>
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
