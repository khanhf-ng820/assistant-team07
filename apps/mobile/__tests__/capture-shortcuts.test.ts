/** @jest-environment node */
/// <reference types="node" />

import { getConfig } from 'expo/config';
import { CAPTURE_KINDS, captureDeepLink } from '../src/capture/routes';

const plugin = require('../plugins/withCaptureShortcuts');

const PKG = 'com.carenta.app';

describe('Android capture shortcuts plugin', () => {
  it('declares one shortcut per capture kind, in the same order as the route allowlist', () => {
    const kinds = plugin.CAPTURE_SHORTCUTS.map((s: { kind: string }) => s.kind);
    expect(kinds).toEqual([...CAPTURE_KINDS]);
  });

  it('keeps within the Android limit of 4 static shortcuts', () => {
    expect(plugin.CAPTURE_SHORTCUTS.length).toBeLessThanOrEqual(4);
  });

  it.each(CAPTURE_KINDS)('generates a VIEW intent for %s that targets the app and deep link', (kind) => {
    const xml: string = plugin.buildShortcutsXml(PKG);

    expect(xml).toContain(`android:shortcutId="capture_${kind}"`);
    expect(xml).toContain(`android:data="${captureDeepLink(kind)}"`);
    expect(xml).toContain('android:action="android.intent.action.VIEW"');
    expect(xml).toContain(`android:targetPackage="${PKG}"`);
    expect(xml).toContain(`android:targetClass="${PKG}.MainActivity"`);
    expect(xml).toContain(`@string/carenta_shortcut_${kind}_short`);
    expect(xml).toContain(`@string/carenta_shortcut_${kind}_long`);
  });

  it('emits well-formed XML with exactly one <shortcut> per kind', () => {
    const xml: string = plugin.buildShortcutsXml(PKG);

    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
    expect(xml.match(/<shortcut\b/g)).toHaveLength(CAPTURE_KINDS.length);
    expect(xml.match(/<\/shortcut>/g)).toHaveLength(CAPTURE_KINDS.length);
    expect(xml.trim().endsWith('</shortcuts>')).toBe(true);
  });

  it('adds the shortcuts meta-data to the activity exactly once', () => {
    const activity: Record<string, any> = { $: { 'android:name': '.MainActivity' } };

    plugin.addShortcutsMetaData(activity);
    plugin.addShortcutsMetaData(activity);

    expect(activity['meta-data']).toEqual([
      { $: { 'android:name': 'android.app.shortcuts', 'android:resource': '@xml/carenta_shortcuts' } },
    ]);
  });

  it('keeps existing meta-data on the activity', () => {
    const existing = { $: { 'android:name': 'other', 'android:value': '1' } };
    const activity: Record<string, any> = { 'meta-data': [existing] };

    plugin.addShortcutsMetaData(activity);

    expect(activity['meta-data']).toHaveLength(2);
    expect(activity['meta-data'][0]).toBe(existing);
  });

  it('refuses to run without an Android package name', () => {
    expect(() => plugin({ name: 'x', slug: 'x' })).toThrow(/android\.package/);
  });

  it('is registered in the Expo config with an Android package', () => {
    const { exp } = getConfig(process.cwd(), { isPublicConfig: true });

    expect(exp.android?.package).toBe(PKG);
    expect(JSON.stringify(exp.plugins)).toContain('withCaptureShortcuts');
  });
});
