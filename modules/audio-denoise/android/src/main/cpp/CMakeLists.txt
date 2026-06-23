cmake_minimum_required(VERSION 3.18.1)
project(df_jni C)

# build-libdf.sh 가 ABI별로 배치한 prebuilt 정적 라이브러리 + 헤더.
#   prebuilt/<ANDROID_ABI>/libdf.a
#   include/df.h
set(PREBUILT_DIR "${CMAKE_CURRENT_SOURCE_DIR}/prebuilt/${ANDROID_ABI}")

add_library(df_prebuilt STATIC IMPORTED)
set_target_properties(df_prebuilt PROPERTIES
  IMPORTED_LOCATION "${PREBUILT_DIR}/libdf.a")

# JNI 브리지 → libdf_jni.so (System.loadLibrary("df_jni"))
add_library(df_jni SHARED df_jni.c)

target_include_directories(df_jni PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/include")

# Rust staticlib 이 요구하는 시스템 라이브러리(로그/수학/dl). 필요 시 가감.
find_library(log-lib log)
target_link_libraries(df_jni df_prebuilt ${log-lib} m dl)
