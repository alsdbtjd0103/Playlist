package expo.modules.audiodenoise

import android.content.Context
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.nio.ByteBuffer
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

private const val SAMPLE_RATE = 48_000
private const val MODEL_FILE = "DeepFilterNet3_model.tar.gz"

class AudioDenoiseModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AudioDenoise")
    Events("onProgress")

    AsyncFunction("denoise") { srcUri: String ->
      val ctx = appContext.reactContext ?: throw Exception("no context")

      // 1) 디코드 → 48kHz mono Float
      val pcm = decodeTo48kMono(srcUri)

      // 2) DeepFilterNet 추론
      val out = runDeepFilter(ctx, pcm) { p -> sendEvent("onProgress", mapOf("progress" to p)) }

      // 3) 재인코딩 → m4a(AAC)
      val outFile = File(ctx.cacheDir, "denoise_${System.currentTimeMillis()}.m4a")
      encodeM4A(out, outFile)

      // 4) 부산물 파형
      val waveform = downsampleEnvelope(out, 200)

      mapOf("uri" to Uri.fromFile(outFile).toString(), "waveform" to waveform)
    }
  }

  // MARK: 추론
  private fun runDeepFilter(ctx: Context, pcm: FloatArray, onProgress: (Double) -> Unit): FloatArray {
    val modelPath = ensureModelCopied(ctx)
    val state = DfNative.dfCreate(modelPath, 100.0f)
    if (state == 0L) throw Exception("잡음 제거 엔진 초기화 실패")
    try {
      val hop = DfNative.dfFrameLen(state)
      if (hop <= 0) throw Exception("프레임 길이 오류")
      val out = FloatArray(pcm.size)
      val chunkFrames = 50          // 한 JNI 호출당 처리할 프레임 수(진행률 갱신 단위)
      var i = 0
      while (i + hop <= pcm.size) {
        val framesLeft = (pcm.size - i) / hop
        val n = minOf(chunkFrames, framesLeft)
        val done = DfNative.dfProcessChunk(state, pcm, out, i, n)
        if (done <= 0) break
        i += done * hop
        onProgress(i.toDouble() / pcm.size)
      }
      onProgress(1.0)
      return out
    } finally {
      DfNative.dfFree(state)
    }
  }

  // MARK: 디코드 → 48kHz mono Float
  private fun decodeTo48kMono(srcUri: String): FloatArray {
    val path = Uri.parse(srcUri).path ?: srcUri
    val extractor = MediaExtractor().apply { setDataSource(path) }
    var track = -1
    var format: MediaFormat? = null
    for (i in 0 until extractor.trackCount) {
      val f = extractor.getTrackFormat(i)
      if (f.getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true) { track = i; format = f; break }
    }
    if (track < 0 || format == null) { extractor.release(); throw Exception("오디오 트랙 없음") }
    extractor.selectTrack(track)

    val srcRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
    val channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
    val codec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
    codec.configure(format, null, null, 0)
    codec.start()

    val mono = ArrayList<Float>()
    val info = MediaCodec.BufferInfo()
    var sawInputEnd = false
    var sawOutputEnd = false

    while (!sawOutputEnd) {
      if (!sawInputEnd) {
        val inIndex = codec.dequeueInputBuffer(10_000)
        if (inIndex >= 0) {
          val inBuf = codec.getInputBuffer(inIndex)!!
          val size = extractor.readSampleData(inBuf, 0)
          if (size < 0) {
            codec.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
            sawInputEnd = true
          } else {
            codec.queueInputBuffer(inIndex, 0, size, extractor.sampleTime, 0)
            extractor.advance()
          }
        }
      }
      val outIndex = codec.dequeueOutputBuffer(info, 10_000)
      if (outIndex >= 0) {
        val outBuf = codec.getOutputBuffer(outIndex)!!
        val shorts = outBuf.order(java.nio.ByteOrder.LITTLE_ENDIAN).asShortBuffer()
        // PCM16 → Float, 다운믹스(스테레오→mono)
        var j = 0
        while (j + channels <= shorts.limit()) {
          var acc = 0f
          for (c in 0 until channels) acc += shorts.get(j + c) / 32768f
          mono.add(acc / channels)
          j += channels
        }
        codec.releaseOutputBuffer(outIndex, false)
        if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) sawOutputEnd = true
      }
    }
    codec.stop(); codec.release(); extractor.release()

    val arr = FloatArray(mono.size) { mono[it] }
    return if (srcRate == SAMPLE_RATE) arr else resampleLinear(arr, srcRate, SAMPLE_RATE)
  }

  private fun resampleLinear(input: FloatArray, from: Int, to: Int): FloatArray {
    if (input.isEmpty()) return input
    val ratio = to.toDouble() / from
    val outLen = (input.size * ratio).toInt()
    val out = FloatArray(outLen)
    for (i in 0 until outLen) {
      val srcPos = i / ratio
      val i0 = srcPos.toInt()
      val i1 = min(i0 + 1, input.size - 1)
      val frac = (srcPos - i0).toFloat()
      out[i] = input[i0] * (1 - frac) + input[i1] * frac
    }
    return out
  }

  // MARK: 재인코딩 → m4a(AAC)
  private fun encodeM4A(samples: FloatArray, outFile: File) {
    val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, SAMPLE_RATE, 1).apply {
      setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
      setInteger(MediaFormat.KEY_BIT_RATE, 128_000)
      setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16_384)
    }
    val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
    codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    codec.start()

    val muxer = MediaMuxer(outFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    var muxTrack = -1
    var muxStarted = false
    val info = MediaCodec.BufferInfo()

    var idx = 0           // 샘플 인덱스
    var ptUs = 0L
    var inputDone = false

    while (true) {
      if (!inputDone) {
        val inIndex = codec.dequeueInputBuffer(10_000)
        if (inIndex >= 0) {
          val inBuf = codec.getInputBuffer(inIndex)!!
          inBuf.clear()
          val capShorts = inBuf.capacity() / 2
          val n = min(capShorts, samples.size - idx)
          val sb = inBuf.order(java.nio.ByteOrder.LITTLE_ENDIAN).asShortBuffer()
          for (s in 0 until n) {
            val v = max(-1f, min(1f, samples[idx + s]))
            sb.put((v * 32767f).toInt().toShort())
          }
          if (n <= 0) {
            codec.queueInputBuffer(inIndex, 0, 0, ptUs, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
            inputDone = true
          } else {
            codec.queueInputBuffer(inIndex, 0, n * 2, ptUs, 0)
            idx += n
            ptUs += (n.toLong() * 1_000_000L) / SAMPLE_RATE
          }
        }
      }
      val outIndex = codec.dequeueOutputBuffer(info, 10_000)
      when {
        outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
          muxTrack = muxer.addTrack(codec.outputFormat); muxer.start(); muxStarted = true
        }
        outIndex >= 0 -> {
          val outBuf = codec.getOutputBuffer(outIndex)!!
          if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) info.size = 0
          if (info.size > 0 && muxStarted) {
            outBuf.position(info.offset); outBuf.limit(info.offset + info.size)
            muxer.writeSampleData(muxTrack, outBuf, info)
          }
          codec.releaseOutputBuffer(outIndex, false)
          if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
        }
      }
    }
    codec.stop(); codec.release()
    muxer.stop(); muxer.release()
  }

  // MARK: 유틸
  private fun downsampleEnvelope(samples: FloatArray, buckets: Int): List<Double> {
    if (samples.isEmpty() || buckets <= 0) return emptyList()
    val size = max(1, samples.size / buckets)
    val env = ArrayList<Double>()
    var i = 0
    while (i < samples.size) {
      var peak = 0f
      val end = min(i + size, samples.size)
      for (j in i until end) peak = max(peak, abs(samples[j]))
      env.add(peak.toDouble())
      i += size
    }
    return env
  }

  private fun ensureModelCopied(ctx: Context): String {
    val dest = File(ctx.filesDir, MODEL_FILE)
    if (!dest.exists()) {
      ctx.assets.open(MODEL_FILE).use { input ->
        dest.outputStream().use { input.copyTo(it) }
      }
    }
    return dest.absolutePath
  }
}
