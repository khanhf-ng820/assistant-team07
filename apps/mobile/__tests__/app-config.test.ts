/** @jest-environment node */
/// <reference types="node" />

import { getConfig } from 'expo/config';

it('enables iOS development and exports without disabling Android', () => {
  const { exp } = getConfig(process.cwd(), { isPublicConfig: true });

  expect(exp.platforms).toEqual(expect.arrayContaining(['android', 'ios']));
});

it('registers the expo-audio plugin with microphone permission and background recording disabled', () => {
  const { exp } = getConfig(process.cwd(), { isPublicConfig: true });

  expect(exp.plugins).toEqual(
    expect.arrayContaining([
      [
        'expo-audio',
        expect.objectContaining({
          microphonePermission: expect.any(String),
          recordAudioAndroid: true,
          enableBackgroundRecording: false,
        }),
      ],
    ])
  );
});
