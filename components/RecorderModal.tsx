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
import { useRecording } from '../hooks/useRecording';

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

  const [rating, setRating] = useState(3);
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);

  // 모달이 열릴 때 권한 상태 확인
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
          <Text style={styles.modalTitle}>녹음하기</Text>
          <Text style={styles.modalSubtitle}>
            {checkingPermission
              ? '권한을 확인하는 중...'
              : permissionStatus === 'denied'
              ? '마이크 권한이 거부되었습니다. 설정에서 권한을 허용해주세요.'
              : isRecording
              ? '녹음 중입니다. 완료되면 정지 버튼을 누르세요.'
              : audioUri
              ? '녹음이 완료되었습니다. 평가 후 저장하세요.'
              : '녹음 버튼을 눌러 시작하세요.'}
          </Text>

          <View style={styles.recorderContainer}>
            {permissionStatus === 'denied' && !audioUri && (
              <View style={styles.permissionDeniedContainer}>
                <Text style={styles.permissionDeniedIcon}>🔒</Text>
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
                  <Text style={styles.settingsButtonText}>설정으로 이동</Text>
                </TouchableOpacity>
              </View>
            )}

            {permissionStatus !== 'denied' && !audioUri && !isRecording && (
              <TouchableOpacity
                style={styles.startButton}
                onPress={startRecording}
                disabled={checkingPermission}
              >
                {checkingPermission ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.startButtonText}>🎤 녹음 시작</Text>
                )}
              </TouchableOpacity>
            )}

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
                >
                  <Text style={styles.stopButtonText}>⏹ 녹음 정지</Text>
                </TouchableOpacity>
              </View>
            )}

            {audioUri && !isRecording && (
              <View style={styles.reviewContainer}>
                <View style={styles.ratingSection}>
                  <Text style={styles.ratingLabel}>별점</Text>
                  <View style={styles.ratingStars}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <TouchableOpacity
                        key={star}
                        onPress={() => setRating(star)}
                        style={styles.starButton}
                      >
                        <Text style={styles.starText}>
                          {star <= rating ? '★' : '☆'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.memoSection}>
                  <Text style={styles.memoLabel}>메모 (선택)</Text>
                  <TextInput
                    style={styles.memoInput}
                    placeholder="이 녹음에 대한 메모를 입력하세요"
                    value={memo}
                    onChangeText={setMemo}
                    multiline
                    numberOfLines={3}
                    editable={!saving}
                  />
                </View>
              </View>
            )}
          </View>

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
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.confirmButtonText}>저장</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.modalButton, styles.closeButton]}
                onPress={handleClose}
              >
                <Text style={styles.closeButtonText}>닫기</Text>
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
  },
  recorderContainer: {
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  startButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    backgroundColor: '#000',
    borderRadius: 8,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  recordingContainer: {
    alignItems: 'center',
    gap: 16,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ef4444',
  },
  recordingText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ef4444',
  },
  recordingTime: {
    fontSize: 32,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  stopButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    backgroundColor: '#ef4444',
    borderRadius: 8,
  },
  stopButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  reviewContainer: {
    width: '100%',
    gap: 24,
  },
  ratingSection: {
    alignItems: 'center',
  },
  ratingLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 12,
  },
  ratingStars: {
    flexDirection: 'row',
    gap: 8,
  },
  starButton: {
    padding: 4,
  },
  starText: {
    fontSize: 32,
    color: '#fbbf24',
  },
  memoSection: {
    gap: 8,
  },
  memoLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  memoInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
  },
  cancelButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#000',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    backgroundColor: '#f3f4f6',
  },
  closeButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  permissionDeniedContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  permissionDeniedIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  permissionDeniedText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
  },
  permissionDeniedDescription: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  settingsButton: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#000',
    borderRadius: 8,
  },
  settingsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
