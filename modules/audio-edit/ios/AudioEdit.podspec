Pod::Spec.new do |s|
  s.name           = 'AudioEdit'
  s.version        = '1.0.0'
  s.summary        = '오디오 구간 잘라 이어붙이기(AVMutableComposition + AVAssetExportSession)'
  s.author         = ''
  s.homepage       = 'https://example.com'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files   = '*.{h,m,swift}'
end
