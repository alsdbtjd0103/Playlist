import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, FlatList,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAllSongs, addSong } from '../lib/database';
import { logEvent } from '../lib/analytics';
import { searchTracks, ITunesTrack } from '../lib/itunes';
import { matchesSearch } from '../lib/search';
import { Song } from '../types';
import { AlbumArt } from './AlbumArt';
import { useTheme } from '../contexts/ThemeContext';
import { ColorTokens, spacing, borderRadius, fontFamily } from '../lib/theme';
import PressableScale from './PressableScale';

interface Props {
  visible: boolean;
  onClose: () => void;
  onNavigateToSong: (songId: string) => void;
}

export function SongSearchModal({ visible, onClose, onNavigateToSong }: Props) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const accent = scheme === 'dark' ? colors.accent : colors.accentStrong;
  const [query, setQuery] = useState('');
  const [localSongs, setLocalSongs] = useState<Song[]>([]);
  const [results, setResults] = useState<ITunesTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'search' | 'manual'>('search');
  const [manualTitle, setManualTitle] = useState('');
  const [manualArtist, setManualArtist] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setQuery(''); setResults([]); setError(false); setMode('search');
    setManualTitle(''); setManualArtist('');
    (async () => {
      try { setLocalSongs(await getAllSongs()); } catch { setLocalSongs([]); }
    })();
  }, [visible]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length === 0) { setResults([]); setError(false); setLoading(false); return; }
    setLoading(true);
    // 늦게 도착한 이전 검색 응답이 최신 결과를 덮어쓰지 않도록 요청 번호로 거른다
    const requestId = ++requestIdRef.current;
    debounceRef.current = setTimeout(async () => {
      try {
        setError(false);
        const tracks = await searchTracks(query);
        if (requestId === requestIdRef.current) setResults(tracks);
      } catch {
        if (requestId === requestIdRef.current) { setError(true); setResults([]); }
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const localMatches = localSongs.filter(
    (s) => matchesSearch(s.title, query) || (s.artist ? matchesSearch(s.artist, query) : false)
  );

  // 이미 라이브러리에 있는 iTunes 결과는 제외(중복 방지)
  const filteredResults = results.filter((t) => !localSongs.some(
    (s) => (s.itunesTrackId && s.itunesTrackId === t.itunesTrackId)
      || (s.title === t.trackName && (s.artist ?? '') === t.artistName)
  ));

  const handlePickLocal = (song: Song) => { onNavigateToSong(song.id); onClose(); };

  const handlePickItunes = useCallback(async (t: ITunesTrack) => {
    // state 는 다음 렌더 전까지 안 바뀌어 연타 시 곡이 두 번 추가되므로 ref 로 막는다
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const id = await addSong(t.trackName, t.artistName, {
        artworkUrl: t.artworkUrl, itunesTrackId: t.itunesTrackId, previewUrl: t.previewUrl,
      });
      logEvent('song_added', { source: 'itunes' });
      onNavigateToSong(id); onClose();
    } catch {
      Alert.alert('오류', '곡 추가에 실패했습니다.');
    } finally { busyRef.current = false; setBusy(false); }
  }, [onNavigateToSong, onClose]);

  const handleManualSubmit = useCallback(async () => {
    if (manualTitle.trim().length === 0) { Alert.alert('알림', '곡 제목을 입력하세요.'); return; }
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const id = await addSong(manualTitle.trim(), manualArtist.trim() || undefined);
      logEvent('song_added', { source: 'manual' });
      onNavigateToSong(id); onClose();
    } catch {
      Alert.alert('오류', '곡 추가에 실패했습니다.');
    } finally { busyRef.current = false; setBusy(false); }
  }, [manualTitle, manualArtist, onNavigateToSong, onClose]);

  const openManual = () => { setManualTitle(query.trim()); setMode('manual'); };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>{mode === 'manual' ? '직접 추가' : '곡 추가'}</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="닫기"
              testID="search-close-button"
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          {mode === 'manual' ? (
            <View>
              <TextInput
                testID="manual-title-input"
                style={styles.input} placeholder="곡 제목" placeholderTextColor={colors.textFaint}
                value={manualTitle} onChangeText={setManualTitle} editable={!busy}
              />
              <TextInput
                testID="manual-artist-input"
                style={styles.input} placeholder="아티스트 (선택)" placeholderTextColor={colors.textFaint}
                value={manualArtist} onChangeText={setManualArtist} editable={!busy}
              />
              <View style={styles.manualButtons}>
                <PressableScale style={[styles.btn, styles.btnGhost]} onPress={() => setMode('search')} disabled={busy}>
                  <Text style={styles.btnGhostText}>검색으로</Text>
                </PressableScale>
                <PressableScale
                  testID="manual-submit-button"
                  style={[styles.btn, { backgroundColor: accent }, busy && styles.btnDisabled]}
                  onPress={handleManualSubmit}
                  disabled={busy}
                  haptic="light"
                >
                  {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.btnPrimaryText}>추가</Text>}
                </PressableScale>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.searchBar}>
                <Ionicons name="search" size={18} color={colors.textMuted} />
                <TextInput
                  testID="song-search-input"
                  style={styles.searchInput} placeholder="곡 제목 또는 가수로 검색" placeholderTextColor={colors.textFaint}
                  value={query} onChangeText={setQuery} autoFocus returnKeyType="search"
                />
              </View>

              <FlatList
                keyboardShouldPersistTaps="handled"
                data={[]}
                keyExtractor={() => 'x'}
                renderItem={null as any}
                ListHeaderComponent={
                  <View>
                    {localMatches.length > 0 && (
                      <View style={styles.section}>
                        <Text style={styles.sectionTitle}>내 곡</Text>
                        {localMatches.map((s) => (
                          <TouchableOpacity key={s.id} style={styles.row} onPress={() => handlePickLocal(s)}>
                            <AlbumArt uri={s.artworkUrl} size={44} />
                            <View style={styles.rowText}>
                              <Text style={styles.rowTitle} numberOfLines={1}>{s.title}</Text>
                              {s.artist ? <Text style={styles.rowSub} numberOfLines={1}>{s.artist}</Text> : null}
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>검색 결과</Text>
                      {loading && <ActivityIndicator color={accent} style={styles.loader} />}
                      {!loading && error && <Text style={styles.muted}>검색 결과를 불러오지 못했어요</Text>}
                      {!loading && !error && query.trim().length > 0 && filteredResults.length === 0 && (
                        <Text style={styles.muted}>검색 결과가 없어요</Text>
                      )}
                      {!loading && filteredResults.map((t) => (
                        <TouchableOpacity key={t.itunesTrackId} style={styles.row} onPress={() => handlePickItunes(t)} disabled={busy}>
                          <AlbumArt uri={t.artworkUrl} size={44} />
                          <View style={styles.rowText}>
                            <Text style={styles.rowTitle} numberOfLines={1}>{t.trackName}</Text>
                            <Text style={styles.rowSub} numberOfLines={1}>{t.artistName}</Text>
                          </View>
                          <View style={styles.addIcon}><Ionicons name="add" size={18} color={accent} /></View>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <TouchableOpacity testID="manual-add-button" style={styles.manualLink} onPress={openManual}>
                      <Ionicons name="create-outline" size={18} color={accent} />
                      <Text style={[styles.manualLinkText, { color: accent }]}>찾는 곡이 없나요? 직접 추가</Text>
                    </TouchableOpacity>
                  </View>
                }
              />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '88%',
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  title: { fontFamily: fontFamily.bold, fontSize: 20, color: colors.text },
  closeButton: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt, marginRight: -spacing.xs,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 48,
    backgroundColor: colors.surfaceAlt, borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, marginBottom: spacing.lg,
  },
  searchInput: { flex: 1, fontFamily: fontFamily.medium, fontSize: 16, color: colors.text, padding: 0 },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.textMuted, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 60, paddingVertical: spacing.sm },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fontFamily.semibold, fontSize: 16, color: colors.text },
  rowSub: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.textMuted },
  addIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  loader: { paddingVertical: spacing.lg },
  muted: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.textMuted, paddingVertical: spacing.md },
  manualLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, justifyContent: 'center' },
  manualLinkText: { fontFamily: fontFamily.semibold, fontSize: 15 },
  input: {
    height: 52, backgroundColor: colors.surfaceAlt, borderRadius: borderRadius.lg, paddingHorizontal: spacing.md,
    fontFamily: fontFamily.medium, fontSize: 16, color: colors.text, marginBottom: spacing.md,
  },
  manualButtons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  btn: { flex: 1, height: 52, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: colors.surfaceAlt },
  btnGhostText: { fontFamily: fontFamily.semibold, fontSize: 16, color: colors.text },
  btnDisabled: { opacity: 0.6 },
  btnPrimaryText: { fontFamily: fontFamily.bold, fontSize: 16, color: colors.onAccent },
});
