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
import { ColorTokens, spacing, borderRadius, typography } from '../lib/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onNavigateToSong: (songId: string) => void;
}

export function SongSearchModal({ visible, onClose, onNavigateToSong }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
    debounceRef.current = setTimeout(async () => {
      try {
        setError(false);
        setResults(await searchTracks(query));
      } catch {
        setError(true); setResults([]);
      } finally {
        setLoading(false);
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
    if (busy) return;
    setBusy(true);
    try {
      const id = await addSong(t.trackName, t.artistName, {
        artworkUrl: t.artworkUrl, itunesTrackId: t.itunesTrackId, previewUrl: t.previewUrl,
      });
      logEvent('song_added', { source: 'itunes' });
      onNavigateToSong(id); onClose();
    } catch {
      Alert.alert('오류', '곡 추가에 실패했습니다.');
    } finally { setBusy(false); }
  }, [busy, onNavigateToSong, onClose]);

  const handleManualSubmit = useCallback(async () => {
    if (manualTitle.trim().length === 0) { Alert.alert('알림', '곡 제목을 입력하세요.'); return; }
    if (busy) return;
    setBusy(true);
    try {
      const id = await addSong(manualTitle.trim(), manualArtist.trim() || undefined);
      logEvent('song_added', { source: 'manual' });
      onNavigateToSong(id); onClose();
    } catch {
      Alert.alert('오류', '곡 추가에 실패했습니다.');
    } finally { setBusy(false); }
  }, [manualTitle, manualArtist, busy, onNavigateToSong, onClose]);

  const openManual = () => { setManualTitle(query.trim()); setMode('manual'); };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{mode === 'manual' ? '직접 추가' : '곡 추가'}</Text>
            <TouchableOpacity onPress={onClose} testID="search-close-button">
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {mode === 'manual' ? (
            <View>
              <TextInput
                testID="manual-title-input"
                style={styles.input} placeholder="곡 제목" placeholderTextColor={colors.textMuted}
                value={manualTitle} onChangeText={setManualTitle} editable={!busy}
              />
              <TextInput
                testID="manual-artist-input"
                style={styles.input} placeholder="아티스트 (선택)" placeholderTextColor={colors.textMuted}
                value={manualArtist} onChangeText={setManualArtist} editable={!busy}
              />
              <View style={styles.manualButtons}>
                <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setMode('search')} disabled={busy}>
                  <Text style={styles.btnGhostText}>검색으로</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="manual-submit-button" style={[styles.btn, styles.btnPrimary]} onPress={handleManualSubmit} disabled={busy}>
                  {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.btnPrimaryText}>추가</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.searchBar}>
                <Ionicons name="search" size={18} color={colors.textMuted} />
                <TextInput
                  testID="song-search-input"
                  style={styles.searchInput} placeholder="곡 제목 또는 가수로 검색" placeholderTextColor={colors.textMuted}
                  value={query} onChangeText={setQuery} autoFocus returnKeyType="search"
                />
              </View>

              <FlatList
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
                            <AlbumArt uri={s.artworkUrl} size={40} />
                            <View style={styles.rowText}>
                              <Text style={styles.rowTitle} numberOfLines={1}>{s.title}</Text>
                              {s.artist ? <Text style={styles.rowSub} numberOfLines={1}>{s.artist}</Text> : null}
                            </View>
                            <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>검색 결과</Text>
                      {loading && <ActivityIndicator color={colors.accentStrong} style={{ paddingVertical: spacing.lg }} />}
                      {!loading && error && <Text style={styles.muted}>검색 결과를 불러오지 못했어요</Text>}
                      {!loading && !error && query.trim().length > 0 && filteredResults.length === 0 && (
                        <Text style={styles.muted}>검색 결과가 없어요</Text>
                      )}
                      {!loading && filteredResults.map((t) => (
                        <TouchableOpacity key={t.itunesTrackId} style={styles.row} onPress={() => handlePickItunes(t)} disabled={busy}>
                          <AlbumArt uri={t.artworkUrl} size={40} />
                          <View style={styles.rowText}>
                            <Text style={styles.rowTitle} numberOfLines={1}>{t.trackName}</Text>
                            <Text style={styles.rowSub} numberOfLines={1}>{t.artistName}</Text>
                          </View>
                          <Ionicons name="add" size={18} color={colors.textMuted} />
                        </TouchableOpacity>
                      ))}
                    </View>

                    <TouchableOpacity testID="manual-add-button" style={styles.manualLink} onPress={openManual}>
                      <Ionicons name="create-outline" size={18} color={colors.accentStrong} />
                      <Text style={styles.manualLinkText}>찾는 곡이 없나요? 직접 추가</Text>
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
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.xl, maxHeight: '85%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  title: { ...typography.h3, color: colors.text },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  searchInput: { flex: 1, ...typography.body, color: colors.text, padding: 0 },
  section: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.bodySmall, fontWeight: '600', color: colors.textMuted, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...typography.body, fontWeight: '600', color: colors.text },
  rowSub: { ...typography.bodySmall, color: colors.textMuted },
  muted: { ...typography.bodySmall, color: colors.textMuted, paddingVertical: spacing.md },
  manualLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, justifyContent: 'center' },
  manualLinkText: { ...typography.body, color: colors.accentStrong, fontWeight: '600' },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...typography.body, color: colors.text, marginBottom: spacing.md },
  manualButtons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  btn: { flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.md, alignItems: 'center' },
  btnGhost: { backgroundColor: colors.surfaceAlt },
  btnGhostText: { ...typography.body, fontWeight: '600', color: colors.text },
  btnPrimary: { backgroundColor: colors.accentStrong },
  btnPrimaryText: { ...typography.body, fontWeight: '600', color: colors.onAccent },
});
