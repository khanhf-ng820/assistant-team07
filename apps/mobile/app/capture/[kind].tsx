import { Redirect } from 'expo-router';

/**
 * Fallback for `carenta://capture/<anything else>`. Static routes (ocr, voice,
 * manual) take precedence; every other kind is sent to the home tab instead of
 * opening an arbitrary or broken screen.
 */
export default function UnknownCaptureRoute() {
  return <Redirect href="/" />;
}
