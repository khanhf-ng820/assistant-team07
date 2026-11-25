import {
  CAPTURE_KINDS,
  captureDeepLink,
  capturePath,
  isCaptureKind,
  parseCaptureDeepLink,
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

describe('parseCaptureDeepLink', () => {
  it('ignores a trailing slash, query string, fragment, and scheme casing', () => {
    expect(parseCaptureDeepLink('carenta://capture/voice/')).toBe('voice');
    expect(parseCaptureDeepLink('CARENTA://capture/voice')).toBe('voice');
    expect(parseCaptureDeepLink('carenta://capture/ocr?source=shortcut')).toBe('ocr');
    expect(parseCaptureDeepLink('carenta://capture/manual#top')).toBe('manual');
    expect(parseCaptureDeepLink('  carenta://capture/voice  ')).toBe('voice');
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

  it('never lets a query parameter choose the target', () => {
    expect(parseCaptureDeepLink('carenta://capture/bogus?kind=voice')).toBeNull();
  });
});
