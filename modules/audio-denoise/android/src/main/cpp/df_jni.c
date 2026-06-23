// libDeepFilter(C ABI) ↔ DfNative.kt(JNI) 브리지.
//
// libDeepFilter 는 df_create/df_get_frame_length/df_process_frame/df_free 같은
// C ABI 심볼만 노출한다. Kotlin의 external fun 은 JNI 심볼(Java_<pkg>_<class>_<method>)을
// 요구하므로, 이 shim 이 그 사이를 잇는다.
//
// 빌드: CMakeLists.txt 가 이 파일을 prebuilt libdf.a(정적) 와 링크해 libdf_jni.so 를 만든다.
// 헤더 df.h 는 build-libdf.sh 의 cbindgen 산출물(cpp/include/df.h).

#include <jni.h>
#include <stdint.h>
#include "df.h"

// df.h 가 노출하는 타입/함수명이 다르면 여기만 맞추면 된다.
//   typedef struct DFState DFState;
//   DFState* df_create(const char* model_path, float atten_lim_db);
//   size_t   df_get_frame_length(DFState*);
//   float    df_process_frame(DFState*, float* input, float* output);
//   void     df_free(DFState*);

JNIEXPORT jlong JNICALL
Java_expo_modules_audiodenoise_DfNative_dfCreate(JNIEnv* env, jobject thiz,
                                                 jstring modelPath, jfloat attenLimDb) {
  (void)thiz;
  const char* path = (*env)->GetStringUTFChars(env, modelPath, NULL);
  if (path == NULL) return 0;
  DFState* st = df_create(path, (float)attenLimDb);
  (*env)->ReleaseStringUTFChars(env, modelPath, path);
  return (jlong)(uintptr_t)st;
}

JNIEXPORT jint JNICALL
Java_expo_modules_audiodenoise_DfNative_dfFrameLen(JNIEnv* env, jobject thiz, jlong state) {
  (void)env; (void)thiz;
  DFState* st = (DFState*)(uintptr_t)state;
  if (st == NULL) return 0;
  return (jint)df_get_frame_length(st);
}

// [startSample, startSample + frameCount*hop) 구간을 hop 단위로 처리한다.
// 한 번의 JNI 호출로 여러 프레임을 돌려 JNI 왕복/핀 오버헤드를 줄인다(청크 처리).
// 반환: 실제 처리한 프레임 수.
JNIEXPORT jint JNICALL
Java_expo_modules_audiodenoise_DfNative_dfProcessChunk(JNIEnv* env, jobject thiz, jlong state,
                                                       jfloatArray input, jfloatArray output,
                                                       jint startSample, jint frameCount) {
  (void)thiz;
  DFState* st = (DFState*)(uintptr_t)state;
  if (st == NULL) return 0;

  const jsize total = (*env)->GetArrayLength(env, input);
  const size_t hop = df_get_frame_length(st);
  if (hop == 0) return 0;

  // 복사 없는 핀(critical) — 루프 동안 JVM 콜백/블로킹 금지(df_process_frame 은 순수 네이티브 계산이라 OK).
  jfloat* in  = (*env)->GetPrimitiveArrayCritical(env, input, NULL);
  jfloat* out = (*env)->GetPrimitiveArrayCritical(env, output, NULL);
  if (in == NULL || out == NULL) {
    if (out) (*env)->ReleasePrimitiveArrayCritical(env, output, out, 0);
    if (in)  (*env)->ReleasePrimitiveArrayCritical(env, input, in, JNI_ABORT);
    return 0;
  }

  size_t pos = (size_t)startSample;
  int processed = 0;
  for (int k = 0; k < frameCount; k++) {
    if (pos + hop > (size_t)total) break;
    df_process_frame(st, in + pos, out + pos);
    pos += hop;
    processed++;
  }

  (*env)->ReleasePrimitiveArrayCritical(env, output, out, 0);        // out 복사 반영
  (*env)->ReleasePrimitiveArrayCritical(env, input, in, JNI_ABORT);  // in 변경 없음
  return processed;
}

JNIEXPORT void JNICALL
Java_expo_modules_audiodenoise_DfNative_dfFree(JNIEnv* env, jobject thiz, jlong state) {
  (void)env; (void)thiz;
  DFState* st = (DFState*)(uintptr_t)state;
  if (st != NULL) df_free(st);
}
