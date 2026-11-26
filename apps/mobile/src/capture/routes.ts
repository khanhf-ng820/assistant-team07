/**
 * Capture entry points reachable from deep links, Android shortcuts and
 * external voice-assistant hooks (issue #53).
 *
 * Only the allowlisted kinds below are valid capture targets; anything else
 * must be rejected so an external link can never open an arbitrary screen
 * (plan §10: notification/deep-link targets stay on an allowlist).
 */

export const CAPTURE_KINDS = ['ocr', 'voice', 'manual'] as const;

export type CaptureKind = (typeof CAPTURE_KINDS)[number];

export const CAPTURE_SCHEME = 'carenta';

/**
 * Allowlisted feature identifiers, shortcut IDs, and App Actions synonyms
 * mapped strictly to canonical capture kinds. Keep in sync with
 * `plugins/withCaptureShortcuts.js` (`__tests__/capture-shortcuts.test.ts` checks this).
 */
export const CAPTURE_FEATURE_ALIASES: Record<CaptureKind, readonly string[]> = {
  ocr: ['ocr', 'capture_ocr', 'quét hóa đơn', 'chụp hóa đơn', 'scan receipt'],
  voice: ['voice', 'capture_voice', 'ghi âm', 'ghi chi tiêu bằng giọng nói', 'voice expense'],
  manual: ['manual', 'capture_manual', 'nhập tay', 'nhập thủ công', 'manual expense'],
};

export function isCaptureKind(value: unknown): value is CaptureKind {
  return typeof value === 'string' && (CAPTURE_KINDS as readonly string[]).includes(value);
}

/** In-app Expo Router path for a capture kind, e.g. `/capture/voice`. */
export function capturePath(kind: CaptureKind): string {
  return `/capture/${kind}`;
}

/** External deep link for a capture kind, e.g. `carenta://capture/voice`. */
export function captureDeepLink(kind: CaptureKind): string {
  return `${CAPTURE_SCHEME}://capture/${kind}`;
}

/**
 * Resolve an App Actions `feature` parameter (`carenta://capture{?feature}`)
 * against the strict allowlist of capture kinds, shortcut IDs, and synonyms.
 */
export function resolveCaptureFeature(feature: unknown): CaptureKind | null {
  if (typeof feature !== 'string') return null;
  const normalized = feature.trim().toLowerCase();
  if (!normalized) return null;

  for (const kind of CAPTURE_KINDS) {
    if (CAPTURE_FEATURE_ALIASES[kind].includes(normalized)) {
      return kind;
    }
  }
  return null;
}

/**
 * Parse an external `carenta://capture/<kind>` or App Actions
 * `carenta://capture?feature=<feature>` deep link. Returns the capture kind,
 * or `null` for any other scheme, host, extra segment, or unknown target.
 */
export function parseCaptureDeepLink(url: string): CaptureKind | null {
  const trimmed = url.trim();
  const pathMatch = /^([a-z][a-z0-9+.-]*):\/\/capture\/([^/?#]+)\/?(?:[?#].*)?$/i.exec(trimmed);
  if (pathMatch) {
    const [, scheme, kind] = pathMatch;
    if (scheme.toLowerCase() !== CAPTURE_SCHEME) return null;
    return isCaptureKind(kind) ? kind : null;
  }

  const queryMatch = /^([a-z][a-z0-9+.-]*):\/\/capture\/?\?([^#]+)(?:#.*)?$/i.exec(trimmed);
  if (queryMatch) {
    const [, scheme, queryString] = queryMatch;
    if (scheme.toLowerCase() !== CAPTURE_SCHEME) return null;
    const params = new URLSearchParams(queryString);
    return resolveCaptureFeature(params.get('feature'));
  }

  return null;
}
