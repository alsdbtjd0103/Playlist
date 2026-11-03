import { Paths, Directory, File } from 'expo-file-system';
import { copyAsync } from 'expo-file-system/legacy';

/** 녹음 파일이 비어 있어(마이크 입력 없음 등) 저장하지 않았을 때 던지는 오류 */
export class EmptyRecordingError extends Error {
  constructor() {
    super('녹음된 소리가 없어 저장하지 못했어요.');
    this.name = 'EmptyRecordingError';
  }
}

const fileSize = (uri: string): number => {
  try {
    const file = new File(uri);
    return file.exists ? file.size ?? 0 : 0;
  } catch {
    return 0;
  }
};

/**
 * 오디오 파일을 로컬 파일 시스템에 저장
 * @param songId 곡 ID
 * @param audioUri 오디오 파일 URI (React Native)
 * @returns { fileName, localUri }
 */
export const saveAudioLocally = async (
  songId: string,
  audioUri: string
): Promise<{ fileName: string; localUri: string }> => {
  const timestamp = Date.now();
  const fileName = `${songId}_${timestamp}.m4a`;

  const recordingsBaseDir = new Directory(Paths.document, 'recordings');
  if (!recordingsBaseDir.exists) {
    recordingsBaseDir.create();
  }

  const recordingsDir = new Directory(recordingsBaseDir, songId);
  if (!recordingsDir.exists) {
    recordingsDir.create();
  }

  // 빈 파일(0바이트)을 버전으로 저장하면 재생할 때마다 오류가 나므로 미리 막는다
  if (fileSize(audioUri) === 0) throw new EmptyRecordingError();

  const targetFile = new File(recordingsDir, fileName);
  // File.copy는 동기라 큰 파일이면 JS 스레드가 멈춘다 → 비동기 복사
  await copyAsync({ from: new File(audioUri).uri, to: targetFile.uri });

  // 복사가 덜 된 채 끝났으면(저장 공간 부족 등) 원본을 지우지 않도록 실패로 알린다
  if (fileSize(targetFile.uri) === 0) {
    try {
      targetFile.delete();
    } catch {
      // 정리 실패는 무시
    }
    throw new Error('녹음 파일을 복사하지 못했어요.');
  }

  return { fileName, localUri: targetFile.uri };
};

/**
 * 잡음 제거된 임시 파일을 영구 위치(recordings/{songId}/)로 저장.
 * 트림의 saveTrimmedFile과 동일하게 saveAudioLocally 규칙을 재사용한다.
 * @param songId 곡 ID
 * @param tempUri 정제된 임시 파일 URI
 */
export const saveDenoisedFile = async (
  songId: string,
  tempUri: string
): Promise<{ fileName: string; localUri: string }> => {
  return saveAudioLocally(songId, tempUri);
};

/**
 * 로컬 파일 시스템에서 오디오 파일 삭제
 * @param localUri 로컬 파일 URI
 */
export const deleteAudioLocally = async (localUri: string): Promise<void> => {
  try {
    const file = new File(localUri);
    if (file.exists) {
      await file.delete();
    }
  } catch (error) {
    console.error('Failed to delete audio file:', error);
  }
};

/**
 * 특정 곡의 모든 녹음 파일 삭제
 * @param songId 곡 ID
 */
export const deleteAllAudioForSong = async (songId: string): Promise<void> => {
  try {
    const recordingsDir = new Directory(Paths.document, 'recordings', songId);
    if (recordingsDir.exists) {
      await recordingsDir.delete();
    }
  } catch (error) {
    console.error('Failed to delete audio directory:', error);
  }
};
