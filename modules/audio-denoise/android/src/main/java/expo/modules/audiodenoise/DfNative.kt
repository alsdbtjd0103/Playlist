package expo.modules.audiodenoise

/**
 * libDeepFilter JNI 바인딩.
 *
 * ⚠️ libDeepFilter는 C ABI 심볼(df_create 등)을 노출하므로, Android에서는
 *    이를 JNI 시그니처(Java_expo_modules_audiodenoise_DfNative_*)로 감싸는
 *    얇은 JNI shim이 `libdf.so`(또는 별도 libdf_jni.so)에 포함되어야 한다.
 *    (build-libdf.sh 에서 jni-crate 또는 C shim으로 노출 — NATIVE_BINARIES.md 참고)
 *
 * 상태 핸들은 네이티브 포인터를 Long으로 전달한다.
 */
internal object DfNative {
  init { System.loadLibrary("df") }

  /** df_create(model_path, atten_lim_db) → 상태 포인터(0=실패) */
  external fun dfCreate(modelPath: String, attenLimDb: Float): Long

  /** df_get_frame_length → 48kHz hop 길이(480) */
  external fun dfFrameLen(state: Long): Int

  /** df_process_frame 을 [offset, offset+len) 구간에 hop 단위로 적용(in-place out) */
  external fun dfProcess(state: Long, input: FloatArray, output: FloatArray, offset: Int, len: Int)

  /** df_free */
  external fun dfFree(state: Long)
}
