import { Redirect } from 'expo-router';

/**
 * Fallback for any unmatched `carenta://` deep-link path outside the
 * allowlisted capture routes (plan §10: allowlist notification/deep-link targets).
 */
export default function NotFoundRoute() {
  return <Redirect href="/" />;
}
