import { parseVoiceCaptureDraft, type VoiceDraftLike } from '../src/api/contracts';
import { normalizeHttpError } from '../src/api/errors';

describe('Voice Capture mobile contracts and error mapping', () => {
  it('parses a valid VoiceCaptureDraft aligned with VoiceDraftLike', () => {
    const raw = {
      amount: 35000,
      currency: 'VND',
      category: 'food',
      merchant: 'Cơm sườn',
      description: 'Cơm sườn 35k',
      recognized_text: 'Cơm sườn 35k',
      occurred_on: '2026-11-28',
      timestamp: '2026-11-28T12:15:00+07:00',
      uncertain_fields: [],
      has_low_confidence: false,
    };

    const draft: VoiceDraftLike = parseVoiceCaptureDraft(raw);
    expect(draft).toEqual(raw);
  });

  it('rejects malformed VoiceCaptureDraft payloads with UNEXPECTED_RESPONSE', () => {
    expect(() =>
      parseVoiceCaptureDraft({
        amount: 35.5,
        currency: 'VND',
        category: 'food',
        merchant: null,
        description: null,
        recognized_text: 'Cơm sườn',
        occurred_on: '2026-11-28',
        timestamp: null,
        uncertain_fields: [],
        has_low_confidence: false,
      })
    ).toThrow(/integer/i);

    expect(() =>
      parseVoiceCaptureDraft({
        amount: null,
        currency: 'USD',
        category: 'food',
        merchant: null,
        description: null,
        recognized_text: null,
        occurred_on: null,
        timestamp: null,
        uncertain_fields: [],
        has_low_confidence: true,
      })
    ).toThrow(/currency/i);

    expect(() =>
      parseVoiceCaptureDraft({
        amount: null,
        currency: null,
        category: 'unknown_cat',
        merchant: null,
        description: null,
        recognized_text: null,
        occurred_on: null,
        timestamp: null,
        uncertain_fields: ['amount'],
        has_low_confidence: true,
      })
    ).toThrow(/category/i);
  });

  it('maps 413, 504, and VOICE_* error codes to localized Vietnamese messages', () => {
    const tooLarge = normalizeHttpError(
      413,
      { error: { code: 'VOICE_AUDIO_TOO_LARGE', message: 'Too large', request_id: 'r1' } },
      'r1'
    );
    expect(tooLarge.code).toBe('VOICE_AUDIO_TOO_LARGE');
    expect(tooLarge.retryable).toBe(false);
    expect(tooLarge.userMessage).toContain('2 MB');

    const fallback413 = normalizeHttpError(413, null);
    expect(fallback413.code).toBe('PAYLOAD_TOO_LARGE');
    expect(fallback413.retryable).toBe(false);
    expect(fallback413.userMessage).toContain('2 MB');

    const voiceTimeout = normalizeHttpError(
      504,
      { error: { code: 'VOICE_TIMEOUT', message: 'Timed out', request_id: 'r2' } },
      'r2'
    );
    expect(voiceTimeout.code).toBe('VOICE_TIMEOUT');
    expect(voiceTimeout.retryable).toBe(true);
    expect(voiceTimeout.userMessage).toContain('quá thời gian');

    const fallback504 = normalizeHttpError(504, null);
    expect(fallback504.code).toBe('GATEWAY_TIMEOUT');
    expect(fallback504.retryable).toBe(true);

    for (const code of [
      'VOICE_UNSUPPORTED_MEDIA_TYPE',
      'VOICE_INVALID_AUDIO',
      'VOICE_DURATION_EXCEEDED',
      'VOICE_RATE_LIMITED',
      'VOICE_PARSER_UNAVAILABLE',
    ]) {
      const status =
        code === 'VOICE_RATE_LIMITED' ? 429 : code === 'VOICE_PARSER_UNAVAILABLE' ? 503 : 422;
      const err = normalizeHttpError(status, {
        error: { code, message: 'err', request_id: 'r3' },
      });
      expect(err.code).toBe(code);
      expect(err.userMessage.length).toBeGreaterThan(10);
      expect(err.userMessage).not.toBe('Không thể hoàn tất yêu cầu.');
      expect(err.userMessage).not.toBe('Máy chủ đang bận, vui lòng thử lại sau.');
    }
  });
});
