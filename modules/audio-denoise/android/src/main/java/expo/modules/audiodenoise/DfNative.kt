package expo.modules.audiodenoise

/**
 * libDeepFilter JNI 바인딩.
 *
 * libDeepFilter(C ABI) 와의 사이는 cpp/df_jni.c (JNI shim) 가 잇는다.
 * CMake 가 df_jni.c 를 prebuilt libdf.a 와 링크해 libdf_jni.so 를 만든다.
 *
 * 상태 핸들은 네이티브 포인터를 Long으로 전달한다.
 */
internal object DfNative {
  init { System.loadLibrary("df_jni") }

  /** df_create(model_path, atten_lim_db) → 상태 포인터(0=실패) */
  external fun dfCreate(modelPath: String, attenLimDb: Float): Long

  /** df_get_frame_length → 48kHz hop 길이(480) */
  external fun dfFrameLen(state: Long): Int

  /**
   * [startSample, startSample + frameCount*hop) 구간을 hop 단위로 처리(한 번의 JNI 호출에 여러 프레임).
   * @return 실제 처리한 프레임 수
   */
  external fun dfProcessChunk(
    state: Long, input: FloatArray, output: FloatArray, startSample: Int, frameCount: Int
  ): Int

  /** df_free */
  external fun dfFree(state: Long)
}
