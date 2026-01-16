import React, { useRef, useEffect, useCallback } from 'react';
import { View, BackHandler, ToastAndroid, Platform, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from './types';

import HomeScreen from './screens/HomeScreen';
import SongDetailScreen from './screens/SongDetailScreen';
import PlaylistsScreen from './screens/PlaylistsScreen';
import PlaylistDetailScreen from './screens/PlaylistDetailScreen';
import { PlayerProvider } from './contexts/PlayerContext';
import MiniPlayer from './components/MiniPlayer';
import NowPlayingScreen from './components/NowPlayingScreen';

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator<RootStackParamList>();
const PlaylistStack = createNativeStackNavigator<RootStackParamList>();

const DarkTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#0f0f0f',
    card: '#0f0f0f',
    text: '#ffffff',
    border: '#1f1f1f',
  },
};

function HomeStackScreen() {
  return (
    <HomeStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        animationDuration: 150,
        contentStyle: { backgroundColor: '#0f0f0f' },
        gestureEnabled: false,
      }}
    >
      <HomeStack.Screen name="Home" component={HomeScreen} />
      <HomeStack.Screen name="SongDetail" component={SongDetailScreen} />
    </HomeStack.Navigator>
  );
}

function PlaylistStackScreen() {
  return (
    <PlaylistStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        animationDuration: 150,
        contentStyle: { backgroundColor: '#0f0f0f' },
        gestureEnabled: false,
      }}
    >
      <PlaylistStack.Screen name="Playlists" component={PlaylistsScreen} />
      <PlaylistStack.Screen name="PlaylistDetail" component={PlaylistDetailScreen} />
    </PlaylistStack.Navigator>
  );
}

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View>
      <MiniPlayer />
      <View style={[tabBarStyles.container, { paddingBottom: insets.bottom > 0 ? insets.bottom : 8 }]}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.tabBarLabel !== undefined
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

          const iconName = route.name === 'HomeTab' ? 'musical-notes' : 'albums';

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              style={tabBarStyles.tab}
            >
              <Ionicons
                name={iconName as any}
                size={24}
                color={isFocused ? '#ffffff' : '#717171'}
              />
              <Text style={[
                tabBarStyles.label,
                { color: isFocused ? '#ffffff' : '#717171' }
              ]}>
                {label as string}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const tabBarStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#0f0f0f',
    borderTopColor: '#1f1f1f',
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
    fontSize: 11,
    fontWeight: '500',
  },
});

export default function App() {
  const navigationRef = useNavigationContainerRef();
  const backPressedOnce = useRef(false);

  const handleBackPress = useCallback(() => {
    const state = navigationRef.current?.getRootState();
    if (!state) return false;

    const currentTabRoute = state.routes[state.index];
    const tabState = currentTabRoute?.state;

    // 상세 페이지에 있으면 기본 뒤로가기 동작
    if (tabState && tabState.index && tabState.index > 0) {
      return false;
    }

    // 루트 화면에서 두 번 눌러 종료
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

  return (
    <View style={{ flex: 1, backgroundColor: '#0f0f0f' }}>
      <SafeAreaProvider>
        <PlayerProvider>
          <NavigationContainer ref={navigationRef} theme={DarkTheme}>
            <View style={{ flex: 1 }}>
              <Tab.Navigator
                tabBar={(props) => <CustomTabBar {...props} />}
                sceneContainerStyle={{ backgroundColor: '#0f0f0f' }}
                screenOptions={{ headerShown: false }}
              >
                <Tab.Screen
                  name="HomeTab"
                  component={HomeStackScreen}
                  options={{ tabBarLabel: '노래' }}
                />
                <Tab.Screen
                  name="PlaylistTab"
                  component={PlaylistStackScreen}
                  options={{ tabBarLabel: '플레이리스트' }}
                />
              </Tab.Navigator>
              <NowPlayingScreen />
            </View>
          </NavigationContainer>
          <StatusBar style="light" />
        </PlayerProvider>
      </SafeAreaProvider>
    </View>
  );
}
