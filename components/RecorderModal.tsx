import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRecording } from '../hooks/useRecording';
import { usePlayer } from '../contexts/PlayerContext';
import { useTheme } from '../contexts/ThemeContext';
import { ColorTokens, spacing, borderRadius, typography, fontFamily } from '../lib/theme';
import { formatKey, clampKey, KEY_MIN, KEY_MAX } from '../lib/keyLabel';
import { deleteAudioLocally } from '../lib/storage';

interface RecorderModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (audioUri: string, rating: number, memo?: string, waveform?: number[], duration?: number, key?: number) => Promise<void>;
  /** 이 곡의 현재 키 — 스텝퍼 기본값으로 사용(없으면 원키=0). */
  defaultKey?: number;
}

export default function RecorderModal({ visible, onClose, onSave, defaultKey }: RecorderModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {
    isRecording,
    isPaused,
    recordingTime,
    audioUri,
    permissionStatus,
    checkingPermission,
    waveform,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    resetRecording,
    checkPermissions,
  } = useRecording();

  const { isPlaying, togglePlayPause } = usePlayer();

  const [rating, setRating] = useState(3);
  const [memo, setMemo] = useState('');
  const [key, setKey] = useState(0);
  const [saving, setSaving] = useState(false);
  // 버튼 연타 방지: state 는 다음 렌더 전까지 반영되지 않아 두 번째 탭이 통과한다
  const startingRef = useRef(false);
  const savingRef = useRef(false);

  // 모달이 열릴 때마다 곡의 현재 키를 스텝퍼 기본값으로 세팅
  useEffect(() => {
    if (visible) setKey(clampKey(defaultKey ?? 0));
  }, [visible, defaultKey]);

  // 녹음 시작 시 플레이어 중지
  const handleStartRecording = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    try {
      if (isPlaying) {
        await togglePlayPause();
      }
      await startRecording();
    } finally {
      startingRef.current = false;
    }
  };

  useEffect(() => {
    if (visible) {
      checkPermissions();
    }
  }, [visible]);

  const saveTake = async (take: { uri: string; duration: number; waveform: number[] }) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await onSave(take.uri, rating, memo.trim() || undefined, take.waveform, take.duration, key);
      // 영구 위치로 복사가 끝났으므로 녹음기 임시 파일은 지운다(안 지우면 녹음마다 캐시에 쌓인다)
      deleteAudioLocally(take.uri);
      closeAndReset();
    } catch (error) {
      console.error('저장 실패:', error);
      Alert.alert('오류', '녹음 저장에 실패했습니다. 녹음은 그대로 남아 있으니 다시 저장해 주세요.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (!audioUri) return;
    saveTake({ uri: audioUri, duration: recordingTime, waveform });
  };

  // 녹음 중에 닫으려 하면: 정지 후 바로 저장(별점·메모는 기본값, 나중에 수정 가능)
  const stopAndSave = async () => {
    const take = await stopRecording();
    if (take) await saveTake(take);
  };

  const closeAndReset = () => {
    resetRecording();
    setRating(3);
    setMemo('');
    setKey(clampKey(defaultKey ?? 0));
    onClose();
  };

  const discard = () => {
    if (audioUri) deleteAudioLocally(audioUri);
    closeAndReset();
  };

  // 녹음 중이거나 저장 전 녹음이 있으면, 닫기·뒤로가기를 실수로 눌러도 녹음이 사라지지 않게
  // 저장 / 버리기 / 계속을 고르게 한다(일반적인 녹음 앱의 닫기 확인 방식).
  const handleClose = () => {
    if (savingRef.current) return;
    if (!isRecording && !isPaused && !audioUri) {
      closeAndReset();
      return;
    }
    const recordingNow = isRecording || isPaused;
    Alert.alert(
      recordingNow ? '녹음 중입니다' : '녹음을 저장하지 않았어요',
      recordingNow ? '지금까지 녹음한 내용을 어떻게 할까요?' : '저장하지 않고 닫으면 녹음이 삭제됩니다.',
      [
        { text: recordingNow ? '계속 녹음' : '돌아가기', style: 'cancel' },
        { text: '버리기', style: 'destructive', onPress: discard },
        { text: '저장하고 닫기', onPress: recordingNow ? stopAndSave : handleSave },
      ],
      { cancelable: true },
    );
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalContent}>
          {/* 헤더 */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>녹음</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>


          <View style={styles.recorderContainer}>
            {/* 권한 거부 상태 */}
            {permissionStatus === 'denied' && !audioUri && (
              <View style={styles.permissionDeniedContainer}>
                <View style={styles.permissionIconContainer}>
                  <Ionicons name="mic-off" size={48} color={colors.danger} />
                </View>
                <Text style={styles.permissionDeniedText}>
                  마이크 권한이 필요합니다
                </Text>
                <Text style={styles.permissionDeniedDescription}>
                  녹음 기능을 사용하려면 설정에서{'\n'}마이크 권한을 허용해주세요.
                </Text>
                <TouchableOpacity
                  style={styles.settingsButton}
                  onPress={() => Linking.openSettings()}
                >
                  <Ionicons name="settings-outline" size={20} color={colors.text} />
                  <Text style={styles.settingsButtonText}>설정으로 이동</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 녹음 시작 버튼 */}
            {permissionStatus !== 'denied' && !audioUri && !isRecording && !isPaused && (
              <View style={styles.startContainer}>
                <TouchableOpacity
                  style={styles.startButton}
                  onPress={handleStartRecording}
                  disabled={checkingPermission}
                  activeOpacity={0.8}
                >
                  {checkingPermission ? (
                    <ActivityIndicator color={colors.text} size="large" />
                  ) : (
                    <Ionicons name="mic" size={48} color={colors.onAccent} />
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* 녹음 중 / 일시정지 중 */}
            {(isRecording || isPaused) && !audioUri && (
              <View style={styles.recordingContainer}>
                <View style={styles.recordingIndicator}>
                  {isPaused ? (
                    <>
                      <Ionicons name="pause" size={16} color={colors.textMuted} />
                      <Text style={styles.pausedText}>일시정지</Text>
                    </>
                  ) : (
                    <>
                      <View style={styles.recordingDot} />
                      <Text style={styles.recordingText}>REC</Text>
                    </>
                  )}
                </View>
                <Text style={[styles.recordingTime, isPaused && styles.recordingTimePaused]}>
                  {formatTime(recordingTime)}
                </Text>
                <View style={styles.recordingControls}>
                  <TouchableOpacity
                    style={styles.pauseResumeButton}
                    onPress={isPaused ? resumeRecording : pauseRecording}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={isPaused ? 'play' : 'pause'}
                      size={28}
                      color={colors.text}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.stopButton}
                    onPress={stopRecording}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="stop" size={28} color={colors.onAccent} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* 녹음 완료 - 리뷰 */}
            {audioUri && !isRecording && (
              <View style={styles.reviewContainer}>
                <View style={styles.completedIcon}>
                  <Ionicons name="checkmark-circle" size={48} color={colors.success} />
                </View>

                <View style={styles.ratingSection}>
                  <View style={styles.ratingStars}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <TouchableOpacity
                        key={star}
                        onPress={() => setRating(star)}
                        style={styles.starButton}
                      >
                        <Ionicons
                          name={star <= rating ? 'star' : 'star-outline'}
                          size={36}
                          color={colors.star}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.keySection}>
                  <Text style={styles.keyLabel}>키</Text>
                  <View style={styles.keyStepper}>
                    <TouchableOpacity
                      style={[styles.keyStepBtn, key <= KEY_MIN && styles.keyStepBtnDisabled]}
                      onPress={() => setKey((v) => clampKey(v - 1))}
                      disabled={key <= KEY_MIN || saving}
                    >
                      <Ionicons name="remove" size={22} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.keyValue}>{formatKey(key)}</Text>
                    <TouchableOpacity
                      style={[styles.keyStepBtn, key >= KEY_MAX && styles.keyStepBtnDisabled]}
                      onPress={() => setKey((v) => clampKey(v + 1))}
                      disabled={key >= KEY_MAX || saving}
                    >
                      <Ionicons name="add" size={22} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.memoSection}>
                  <View style={styles.memoInputWrapper}>
                    <TextInput
                      style={styles.memoInput}
                      placeholder="이 녹음에 대한 메모를 입력하세요"
                      placeholderTextColor={colors.textMuted}
                      value={memo}
                      onChangeText={setMemo}
                      multiline
                      numberOfLines={3}
                      editable={!saving}
                    />
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* 하단 버튼 */}
          <View style={styles.modalButtons}>
            {audioUri ? (
              <>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={handleClose}
                  disabled={saving}
                >
                  <Text style={styles.cancelButtonText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color={colors.onAccent} size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={20} color={colors.onAccent} />
                      <Text style={styles.confirmButtonText}>저장</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : isRecording || isPaused ? null /* 녹음 중엔 정지 버튼 바로 아래 닫기 버튼을 숨겨 오탭을 막는다(상단 X 는 확인을 거친다) */ : (
              <TouchableOpacity
                style={[styles.modalButton, styles.closeOnlyButton]}
                onPress={handleClose}
              >
                <Text style={styles.closeOnlyButtonText}>닫기</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xl,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.text,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recorderContainer: {
    minHeight: 280,
    justifyContent: 'center',
    alignItems: 'center',
  },
  startContainer: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  startButton: {
    width: 120,
    height: 120,
    borderRadius: borderRadius.full,
    backgroundColor: colors.record,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingContainer: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: borderRadius.full,
    backgroundColor: colors.record,
  },
  recordingText: {
    ...typography.h3,
    color: colors.record,
  },
  pausedText: {
    ...typography.h3,
    color: colors.textMuted,
  },
  recordingTime: {
    fontFamily: fontFamily.bold,
    fontSize: 48,
    fontWeight: 'bold',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  recordingTimePaused: {
    color: colors.textMuted,
  },
  recordingControls: {
    flexDirection: 'row',
    gap: spacing.lg,
    alignItems: 'center',
  },
  pauseResumeButton: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopButton: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.full,
    backgroundColor: colors.record,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewContainer: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.xl,
  },
  completedIcon: {
    marginBottom: spacing.sm,
  },
  ratingSection: {
    alignItems: 'center',
    width: '100%',
  },
  ratingStars: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  starButton: {
    padding: spacing.xs,
  },
  keySection: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  keyLabel: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  keyStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  keyStepBtn: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyStepBtnDisabled: {
    opacity: 0.4,
  },
  keyValue: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    minWidth: 64,
    textAlign: 'center',
  },
  memoSection: {
    width: '100%',
  },
  memoInputWrapper: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  memoInput: {
    padding: spacing.md,
    ...typography.bodySmall,
    color: colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  modalButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  cancelButton: {
    backgroundColor: colors.surfaceAlt,
  },
  cancelButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  confirmButton: {
    backgroundColor: colors.accentStrong,
  },
  confirmButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.onAccent,
  },
  closeOnlyButton: {
    backgroundColor: colors.surfaceAlt,
  },
  closeOnlyButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  permissionDeniedContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  permissionIconContainer: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionDeniedText: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
  },
  permissionDeniedDescription: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.accentStrong,
    borderRadius: borderRadius.md,
  },
  settingsButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.onAccent,
  },
});
