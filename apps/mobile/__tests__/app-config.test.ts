/** @jest-environment node */
/// <reference types="node" />

import { getConfig } from 'expo/config';

it('enables iOS development and exports without disabling Android', () => {
  const { exp } = getConfig(process.cwd(), { isPublicConfig: true });

  expect(exp.platforms).toEqual(expect.arrayContaining(['android', 'ios']));
});

it('registers the carenta:// deep-link scheme used by capture shortcuts', () => {
  const { exp } = getConfig(process.cwd(), { isPublicConfig: true });

  expect(exp.scheme).toBe('carenta');
});
