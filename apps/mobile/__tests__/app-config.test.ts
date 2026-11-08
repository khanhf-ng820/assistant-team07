/** @jest-environment node */
/// <reference types="node" />

import { getConfig } from 'expo/config';

it('enables iOS development and exports without disabling Android', () => {
  const { exp } = getConfig(process.cwd(), { isPublicConfig: true });

  expect(exp.platforms).toEqual(expect.arrayContaining(['android', 'ios']));
});
