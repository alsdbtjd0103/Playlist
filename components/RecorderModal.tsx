import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRecording } from '../hooks/useRecording';
import { usePlayer } from '../contexts/PlayerContext';
import { colors, spacing, borderRadius, typography } from '../lib/theme';

interface RecorderModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (audioUri: string, rating: number, memo?: string) => Promise<void>;
}

export default function RecorderModal({ visible, onClose, onSave }: RecorderModalProps) {
  const {
    isRecording,
    recordingTime,
    audioUri,
    permissionStatus,
    checkingPermission,
    startRecording,
    stopRecording,
    resetRecording,
    checkPermissions,
  } = useRecording();

  const { isPlaying, togglePlayPause } = usePlayer();

  const [rating, setRating] = useState(3);
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);

  // 녹음 시작 시 플레이어 중지
  const handleStartRecording = async () => {
    if (isPlaying) {
      await togglePlayPause();
    }
    await startRecording();
  };

  useEffect(() => {
    if (visible) {
      checkPermissions();
    }
  }, [visible]);

  const handleSave = async () => {
    if (!audioUri) return;

    setSaving(true);
    try {
      await onSave(audioUri, rating, memo.trim() || undefined);
      handleClose();
    } catch (error) {
      console.error('저장 실패:', error);
      Alert.alert('오류', '녹음 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    resetRecording();
    setRating(3);
    setMemo('');
    onClose();
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
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* 헤더 */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>녹음</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>


          <View style={styles.recorderContainer}>
            {/* 권한 거부 상태 */}
            {permissionStatus === 'denied' && !audioUri && (
              <View style={styles.permissionDeniedContainer}>
                <View style={styles.permissionIconContainer}>
                  <Ionicons name="mic-off" size={48} color={colors.error} />
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
                  <Ionicons name="settings-outline" size={20} color={colors.textPrimary} />
                  <Text style={styles.settingsButtonText}>설정으로 이동</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 녹음 시작 버튼 */}
            {permissionStatus !== 'denied' && !audioUri && !isRecording && (
              <View style={styles.startContainer}>
                <TouchableOpacity
                  style={styles.startButton}
                  onPress={handleStartRecording}
                  disabled={checkingPermission}
                  activeOpacity={0.8}
                >
                  {checkingPermission ? (
                    <ActivityIndicator color={colors.textPrimary} size="large" />
                  ) : (
                    <Ionicons name="mic" size={48} color={colors.background} />
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* 녹음 중 */}
            {isRecording && (
              <View style={styles.recordingContainer}>
                <View style={styles.recordingIndicator}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingText}>REC</Text>
                </View>
                <Text style={styles.recordingTime}>{formatTime(recordingTime)}</Text>
                <TouchableOpacity
                  style={styles.stopButton}
                  onPress={stopRecording}
                  activeOpacity={0.8}
                >
                  <Ionicons name="stop" size={32} color={colors.textPrimary} />
                </TouchableOpacity>
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
                          color={colors.warning}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.memoSection}>
                  <View style={styles.memoInputWrapper}>
                    <TextInput
                      style={styles.memoInput}
                      placeholder="이 녹음에 대한 메모를 입력하세요"
                      placeholderTextColor={colors.textTertiary}
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
                    <ActivityIndicator color={colors.background} size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={20} color={colors.background} />
                      <Text style={styles.confirmButtonText}>저장</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.modalButton, styles.closeOnlyButton]}
                onPress={handleClose}
              >
                <Text style={styles.closeOnlyButtonText}>닫기</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    color: colors.textPrimary,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
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
    backgroundColor: colors.error,
  },
  recordingText: {
    ...typography.h3,
    color: colors.error,
  },
  recordingTime: {
    fontSize: 48,
    fontWeight: 'bold',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  stopButton: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.error,
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
  memoSection: {
    width: '100%',
  },
  memoInputWrapper: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  memoInput: {
    padding: spacing.md,
    ...typography.bodySmall,
    color: colors.textPrimary,
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
    backgroundColor: colors.surfaceLight,
  },
  cancelButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  confirmButton: {
    backgroundColor: colors.primary,
  },
  confirmButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.background,
  },
  closeOnlyButton: {
    backgroundColor: colors.surfaceLight,
  },
  closeOnlyButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
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
    color: colors.textPrimary,
    textAlign: 'center',
  },
  permissionDeniedDescription: {
    ...typography.bodySmall,
    color: colors.textSecondary,
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
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  settingsButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.background,
  },
});
