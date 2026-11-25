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
 * Parse an external `carenta://capture/<kind>` link. Returns the capture kind,
 * or `null` for any other scheme, host, path, extra segment or unknown kind.
 * Query strings and fragments are ignored; they never select the target.
 */
export function parseCaptureDeepLink(url: string): CaptureKind | null {
  const match = /^([a-z][a-z0-9+.-]*):\/\/capture\/([^/?#]+)\/?(?:[?#].*)?$/i.exec(url.trim());
  if (!match) return null;
  const [, scheme, kind] = match;
  if (scheme.toLowerCase() !== CAPTURE_SCHEME) return null;
  return isCaptureKind(kind) ? kind : null;
}
