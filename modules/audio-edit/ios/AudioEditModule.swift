import ExpoModulesCore
import AVFoundation

public class AudioEditModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioEdit")

    AsyncFunction("renderCuts") { (inputUri: String, keepSegments: [[String: Double]], outputUri: String, promise: Promise) in
      self.render(inputUri: inputUri, keep: keepSegments, outputUri: outputUri, promise: promise)
    }
  }

  private func url(_ uri: String) -> URL {
    if let u = URL(string: uri), u.scheme != nil { return u }
    return URL(fileURLWithPath: uri)
  }

  private func render(inputUri: String, keep: [[String: Double]], outputUri: String, promise: Promise) {
    let asset = AVURLAsset(url: url(inputUri))
    guard let srcTrack = asset.tracks(withMediaType: .audio).first else {
      promise.reject("no_audio", "오디오 트랙이 없습니다.")
      return
    }

    let composition = AVMutableComposition()
    guard let compTrack = composition.addMutableTrack(
      withMediaType: .audio,
      preferredTrackID: kCMPersistentTrackID_Invalid
    ) else {
      promise.reject("comp_fail", "컴포지션 트랙 생성 실패")
      return
    }

    let timescale = asset.duration.timescale
    var cursor = CMTime.zero
    do {
      for seg in keep {
        guard let s = seg["start"], let e = seg["end"], e > s else { continue }
        let start = CMTime(seconds: s, preferredTimescale: timescale)
        let dur = CMTime(seconds: e - s, preferredTimescale: timescale)
        let range = CMTimeRange(start: start, duration: dur)
        try compTrack.insertTimeRange(range, of: srcTrack, at: cursor)
        cursor = CMTimeAdd(cursor, dur)
      }
    } catch {
      promise.reject("insert_fail", error.localizedDescription)
      return
    }

    let out = url(outputUri)
    try? FileManager.default.removeItem(at: out)

    guard let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetAppleM4A) else {
      promise.reject("export_init", "익스포트 세션 생성 실패")
      return
    }
    export.outputURL = out
    export.outputFileType = .m4a

    let totalSeconds = cursor.seconds
    export.exportAsynchronously {
      switch export.status {
      case .completed:
        promise.resolve(["uri": out.absoluteString, "duration": totalSeconds])
      default:
        promise.reject("export_fail", export.error?.localizedDescription ?? "익스포트 실패")
      }
    }
  }
}
