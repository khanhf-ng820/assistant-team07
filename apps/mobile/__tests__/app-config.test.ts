/** @jest-environment node */
/// <reference types="node" />

import { getConfig } from 'expo/config';

it('enables iOS development, Android export, and required capture plugins', () => {
  const { exp } = getConfig(process.cwd(), { isPublicConfig: true });

  expect(exp.platforms).toEqual(expect.arrayContaining(['android', 'ios']));

  const pluginNames = (exp.plugins ?? []).map((entry) =>
    Array.isArray(entry) ? entry[0] : entry
  );
  expect(pluginNames).toEqual(
    expect.arrayContaining([
      'expo-router',
      'expo-secure-store',
      'expo-camera',
      'expo-image-picker',
      'expo-audio',
    ])
  );
});
