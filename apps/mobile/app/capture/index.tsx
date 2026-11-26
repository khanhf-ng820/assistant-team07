import { Redirect, useLocalSearchParams } from 'expo-router';
import { capturePath, resolveCaptureFeature } from '../../src/capture/routes';

/**
 * Fulfillment entry for App Actions `carenta://capture{?feature}` (issue #53).
 * Maps only allowlisted feature identifiers/synonyms to `/capture/{ocr,voice,manual}`,
 * redirecting any unknown or missing feature safely to the home tab.
 */
export default function CaptureFeatureRoute() {
  const { feature } = useLocalSearchParams<{ feature?: string | string[] }>();
  const value = Array.isArray(feature) ? feature[0] : feature;
  const kind = resolveCaptureFeature(value);

  return <Redirect href={kind ? capturePath(kind) : '/'} />;
}
