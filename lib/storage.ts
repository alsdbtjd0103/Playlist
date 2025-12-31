import { Paths, Directory, File } from 'expo-file-system';

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

  const targetFile = new File(recordingsDir, fileName);
  const sourceFile = new File(audioUri);
  await sourceFile.copy(targetFile);

  return { fileName, localUri: targetFile.uri };
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
