import ExpoModulesCore
import AVFoundation
// libDeepFilter C API (module.modulemap 으로 노출). 바이너리/헤더는 NATIVE_BINARIES.md 참고.
#if canImport(libdf)
import libdf
#endif

private let kSampleRate: Double = 48_000   // DeepFilterNet 동작 표준
private let kModelFileName = "DeepFilterNet3_model.tar.gz"

public class AudioDenoiseModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioDenoise")
    Events("onProgress")

    AsyncFunction("denoise") { (srcUri: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let srcURL = URL(string: srcUri) ?? URL(fileURLWithPath: srcUri)

          // 1) 디코드 → 48kHz mono Float32
          let pcm = try self.decodeTo48kMono(srcURL)

          // 2) DeepFilterNet 추론 (hop 단위 in-place)
          let out = try self.runDeepFilter(pcm) { progress in
            self.sendEvent("onProgress", ["progress": progress])
          }

          // 3) 재인코딩 → m4a(AAC), 48kHz mono
          let outURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("denoise_\(Int(Date().timeIntervalSince1970 * 1000)).m4a")
          try? FileManager.default.removeItem(at: outURL)
          try self.encodeM4A(out, to: outURL)

          // 4) 부산물 파형(정제본 엔벨로프)
          let waveform = self.downsampleEnvelope(out, buckets: 200)

          promise.resolve(["uri": outURL.absoluteString, "waveform": waveform])
        } catch {
          promise.reject("E_DENOISE", error.localizedDescription)
        }
      }
    }
  }

  // MARK: - 디코드 → 48kHz mono Float32

  private func decodeTo48kMono(_ url: URL) throws -> [Float] {
    let file = try AVAudioFile(forReading: url)
    guard let target = AVAudioFormat(
      commonFormat: .pcmFormatFloat32, sampleRate: kSampleRate, channels: 1, interleaved: false
    ) else { throw DenoiseError.format }

    guard let converter = AVAudioConverter(from: file.processingFormat, to: target) else {
      throw DenoiseError.format
    }

    var output: [Float] = []
    let srcFrames = AVAudioFrameCount(4096)

    while true {
      guard let inBuf = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: srcFrames) else { break }
      try file.read(into: inBuf)
      if inBuf.frameLength == 0 { break }

      let ratio = kSampleRate / file.processingFormat.sampleRate
      let outCap = AVAudioFrameCount(Double(inBuf.frameLength) * ratio) + 16
      guard let outBuf = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: outCap) else { break }

      var err: NSError?
      var fed = false
      converter.convert(to: outBuf, error: &err) { _, status in
        if fed { status.pointee = .noDataNow; return nil }
        fed = true; status.pointee = .haveData; return inBuf
      }
      if let err = err { throw err }
      if let ch = outBuf.floatChannelData?[0] {
        output.append(contentsOf: UnsafeBufferPointer(start: ch, count: Int(outBuf.frameLength)))
      }
    }
    return output
  }

  // MARK: - DeepFilterNet 추론

  private func runDeepFilter(_ pcm: [Float], onProgress: (Double) -> Void) throws -> [Float] {
    #if canImport(libdf)
    let modelPath = try ensureModelCopied()
    guard let state = df_create(modelPath, 100.0) else { throw DenoiseError.engine }
    defer { df_free(state) }

    let hop = Int(df_get_frame_length(state))
    guard hop > 0 else { throw DenoiseError.engine }

    var input = pcm
    var out = [Float](repeating: 0, count: pcm.count)
    var i = 0
    input.withUnsafeMutableBufferPointer { inPtr in
      out.withUnsafeMutableBufferPointer { outPtr in
        while i + hop <= pcm.count {
          _ = df_process_frame(state,
                               inPtr.baseAddress!.advanced(by: i),
                               outPtr.baseAddress!.advanced(by: i))
          i += hop
          if (i / hop) % 50 == 0 { onProgress(Double(i) / Double(pcm.count)) }
        }
      }
    }
    onProgress(1.0)
    return out
    #else
    // 바이너리 미링크 빌드 — 원본 그대로 반환(폴백). 실제 dev build에는 libdf 포함됨.
    throw DenoiseError.engine
    #endif
  }

  // MARK: - 재인코딩 → m4a(AAC)

  private func encodeM4A(_ samples: [Float], to url: URL) throws {
    guard let processing = AVAudioFormat(
      commonFormat: .pcmFormatFloat32, sampleRate: kSampleRate, channels: 1, interleaved: false
    ) else { throw DenoiseError.format }

    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVSampleRateKey: kSampleRate,
      AVNumberOfChannelsKey: 1,
      AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
    ]
    let outFile = try AVAudioFile(forWriting: url, settings: settings,
                                  commonFormat: .pcmFormatFloat32, interleaved: false)

    let chunk = 16_384
    var i = 0
    while i < samples.count {
      let n = min(chunk, samples.count - i)
      guard let buf = AVAudioPCMBuffer(pcmFormat: processing, frameCapacity: AVAudioFrameCount(n)) else { break }
      buf.frameLength = AVAudioFrameCount(n)
      if let ch = buf.floatChannelData?[0] {
        samples.withUnsafeBufferPointer { src in
          ch.update(from: src.baseAddress!.advanced(by: i), count: n)
        }
      }
      try outFile.write(from: buf)
      i += n
    }
  }

  // MARK: - 유틸

  private func downsampleEnvelope(_ samples: [Float], buckets: Int) -> [Double] {
    guard !samples.isEmpty, buckets > 0 else { return [] }
    let size = max(1, samples.count / buckets)
    var env: [Double] = []
    var i = 0
    while i < samples.count {
      var peak: Float = 0
      let end = min(i + size, samples.count)
      for j in i..<end { peak = max(peak, abs(samples[j])) }
      env.append(Double(peak))
      i += size
    }
    return env
  }

  private func ensureModelCopied() throws -> String {
    let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    let dest = docs.appendingPathComponent(kModelFileName)
    if !FileManager.default.fileExists(atPath: dest.path) {
      // resource_bundles 로 번들된 모델을 documentDir 로 복사
      let bundle = Bundle(for: AudioDenoiseModule.self)
      guard let assetBundleURL = bundle.url(forResource: "AudioDenoiseAssets", withExtension: "bundle"),
            let assetBundle = Bundle(url: assetBundleURL),
            let src = assetBundle.url(forResource: "DeepFilterNet3_model", withExtension: "tar.gz")
      else { throw DenoiseError.model }
      try FileManager.default.copyItem(at: src, to: dest)
    }
    return dest.path
  }

  enum DenoiseError: Error, LocalizedError {
    case format, engine, model
    var errorDescription: String? {
      switch self {
      case .format: return "오디오 포맷 변환 실패"
      case .engine: return "잡음 제거 엔진 초기화 실패(libdf 미링크)"
      case .model: return "모델 파일을 찾을 수 없음"
      }
    }
  }
}
