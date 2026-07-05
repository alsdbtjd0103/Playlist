package expo.modules.audioedit

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.nio.ByteBuffer

class AudioEditModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AudioEdit")

    AsyncFunction("renderCuts") { inputUri: String, keepSegments: List<Map<String, Double>>, outputUri: String, promise: Promise ->
      try {
        val duration = render(inputUri, keepSegments, outputUri)
        promise.resolve(mapOf("uri" to toFileUri(outputUri), "duration" to duration))
      } catch (e: Exception) {
        promise.reject("render_fail", e.message ?: "렌더 실패", e)
      }
    }
  }

  private fun path(uri: String): String =
    if (uri.startsWith("file://")) Uri.parse(uri).path ?: uri else uri

  private fun toFileUri(uri: String): String =
    if (uri.startsWith("file://")) uri else "file://$uri"

  /** keepSegments만 순서대로 이어붙여 새 m4a로 재먹싱(무손실). 결과 길이(초) 반환. */
  private fun render(inputUri: String, keep: List<Map<String, Double>>, outputUri: String): Double {
    val extractor = MediaExtractor()
    extractor.setDataSource(path(inputUri))

    var audioTrack = -1
    var format: MediaFormat? = null
    for (i in 0 until extractor.trackCount) {
      val f = extractor.getTrackFormat(i)
      if (f.getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true) {
        audioTrack = i
        format = f
        break
      }
    }
    if (audioTrack < 0 || format == null) {
      extractor.release()
      throw IllegalStateException("오디오 트랙 없음")
    }
    extractor.selectTrack(audioTrack)

    val muxer = MediaMuxer(path(outputUri), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    val outTrack = muxer.addTrack(format)
    muxer.start()

    val maxSize =
      if (format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE)
      else 256 * 1024
    val buffer = ByteBuffer.allocate(maxSize)
    val info = MediaCodec.BufferInfo()

    var ptsOffsetUs = 0L
    var writtenDurUs = 0L

    for (seg in keep) {
      val startUs = ((seg["start"] ?: 0.0) * 1_000_000).toLong()
      val endUs = ((seg["end"] ?: 0.0) * 1_000_000).toLong()
      if (endUs <= startUs) continue

      extractor.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
      var segFirstPts = -1L

      while (true) {
        val sampleTime = extractor.sampleTime
        if (sampleTime < 0) break // EOS
        if (sampleTime >= endUs) break
        if (sampleTime < startUs) {
          extractor.advance()
          continue
        }
        val size = extractor.readSampleData(buffer, 0)
        if (size < 0) break
        if (segFirstPts < 0) segFirstPts = sampleTime

        info.offset = 0
        info.size = size
        info.presentationTimeUs = ptsOffsetUs + (sampleTime - segFirstPts)
        info.flags =
          if (extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0
        muxer.writeSampleData(outTrack, buffer, info)
        extractor.advance()
      }

      val segDurUs = endUs - startUs
      ptsOffsetUs += segDurUs
      writtenDurUs += segDurUs
    }

    muxer.stop()
    muxer.release()
    extractor.release()

    return writtenDurUs / 1_000_000.0
  }
}
