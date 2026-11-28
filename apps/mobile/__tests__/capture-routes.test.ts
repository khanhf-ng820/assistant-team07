import {
  CAPTURE_KINDS,
  captureDeepLink,
  capturePath,
  isCaptureKind,
  parseCaptureDeepLink,
  resolveCaptureFeature,
} from '../src/capture/routes';

describe('capture route allowlist', () => {
  it('exposes exactly the three agreed capture kinds', () => {
    expect([...CAPTURE_KINDS]).toEqual(['ocr', 'voice', 'manual']);
  });

  it.each(CAPTURE_KINDS)('builds matching path and deep link for %s', (kind) => {
    expect(capturePath(kind)).toBe(`/capture/${kind}`);
    expect(captureDeepLink(kind)).toBe(`carenta://capture/${kind}`);
    expect(parseCaptureDeepLink(captureDeepLink(kind))).toBe(kind);
  });

  it.each(['ocr', 'voice', 'manual'])('accepts %s', (value) => {
    expect(isCaptureKind(value)).toBe(true);
  });

  it.each(['', 'OCR', 'camera', 'ocr/', '../ocr', undefined, null, 5])('rejects %p', (value) => {
    expect(isCaptureKind(value)).toBe(false);
  });
});

describe('resolveCaptureFeature', () => {
  it.each([
    ['ocr', 'ocr'],
    ['capture_ocr', 'ocr'],
    ['Quét hóa đơn', 'ocr'],
    ['voice', 'voice'],
    ['capture_voice', 'voice'],
    ['  Ghi âm  ', 'voice'],
    ['manual', 'manual'],
    ['capture_manual', 'manual'],
    ['Nhập tay', 'manual'],
  ] as const)('maps allowlisted App Actions feature %p -> %s', (input, expected) => {
    expect(resolveCaptureFeature(input)).toBe(expected);
  });

  it.each(['', '  ', 'unknown', '../voice', 'settings', undefined, null, 123])(
    'rejects unknown feature %p',
    (input) => {
      expect(resolveCaptureFeature(input)).toBeNull();
    },
  );
});

describe('parseCaptureDeepLink', () => {
  it('ignores a trailing slash, query string, fragment, and scheme casing', () => {
    expect(parseCaptureDeepLink('carenta://capture/voice/')).toBe('voice');
    expect(parseCaptureDeepLink('CARENTA://capture/voice')).toBe('voice');
    expect(parseCaptureDeepLink('carenta://capture/ocr?source=shortcut')).toBe('ocr');
    expect(parseCaptureDeepLink('carenta://capture/manual#top')).toBe('manual');
    expect(parseCaptureDeepLink('  carenta://capture/voice  ')).toBe('voice');
  });

  it('resolves App Actions url-template feature query URLs via allowlist', () => {
    expect(parseCaptureDeepLink('carenta://capture?feature=ocr')).toBe('ocr');
    expect(parseCaptureDeepLink('carenta://capture?feature=capture_voice')).toBe('voice');
    expect(parseCaptureDeepLink('carenta://capture?feature=Nh%E1%BA%ADp%20tay')).toBe('manual');
    expect(parseCaptureDeepLink('carenta://capture?feature=unknown')).toBeNull();
    expect(parseCaptureDeepLink('carenta://capture?other=voice')).toBeNull();
  });

  it.each([
    'carenta://capture/unknown',
    'carenta://capture/',
    'carenta://capture',
    'carenta://capture/voice/extra',
    'carenta://capture/%2e%2e',
    'carenta://settings/voice',
    'carenta-placeholder://capture/voice',
    'https://capture/voice',
    'carenta://capture/voice@evil.com',
    'carenta://evil/capture/voice',
    '/capture/voice',
    '',
  ])('rejects %p', (url) => {
    expect(parseCaptureDeepLink(url)).toBeNull();
  });

  it('never lets a query parameter override an invalid path target', () => {
    expect(parseCaptureDeepLink('carenta://capture/bogus?kind=voice')).toBeNull();
    expect(parseCaptureDeepLink('carenta://capture/bogus?feature=voice')).toBeNull();
  });
});
