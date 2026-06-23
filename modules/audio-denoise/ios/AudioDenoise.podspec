Pod::Spec.new do |s|
  s.name           = 'AudioDenoise'
  s.version        = '1.0.0'
  s.summary        = '온디바이스 DeepFilterNet 잡음 제거(디코드→추론→재인코딩)'
  s.author         = ''
  s.homepage       = 'https://example.com'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files   = '*.{h,m,swift}'
  # libDeepFilter 정적 라이브러리 + C 헤더(modulemap으로 Swift에 노출)
  s.vendored_libraries = 'lib/libdf.a'
  s.preserve_paths = 'lib/df.h', 'lib/module.modulemap'
  s.pod_target_xcconfig = {
    'SWIFT_INCLUDE_PATHS' => '$(PODS_TARGET_SRCROOT)/lib',
    'OTHER_LDFLAGS'       => '-lc++'
  }
  # 모델 가중치 번들 (assets/ 에 배치)
  s.resource_bundles = { 'AudioDenoiseAssets' => ['../assets/*'] }
end
