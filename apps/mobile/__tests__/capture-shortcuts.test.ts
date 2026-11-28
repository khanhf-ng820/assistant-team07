/** @jest-environment node */
/// <reference types="node" />

import { getConfig } from 'expo/config';
import { CAPTURE_KINDS, captureDeepLink, resolveCaptureFeature } from '../src/capture/routes';

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

  it('keeps shortcut synonyms aligned with resolveCaptureFeature allowlist', () => {
    for (const shortcut of plugin.CAPTURE_SHORTCUTS as { kind: string; synonyms: string[] }[]) {
      expect(resolveCaptureFeature(`capture_${shortcut.kind}`)).toBe(shortcut.kind);
      for (const synonym of shortcut.synonyms) {
        expect(resolveCaptureFeature(synonym)).toBe(shortcut.kind);
      }
    }
  });

  it.each(CAPTURE_KINDS)('generates a VIEW intent and App Actions binding for %s', (kind) => {
    const xml: string = plugin.buildShortcutsXml(PKG);

    expect(xml).toContain(`android:shortcutId="capture_${kind}"`);
    expect(xml).toContain(`android:data="${captureDeepLink(kind)}"`);
    expect(xml).toContain('android:action="android.intent.action.VIEW"');
    expect(xml).toContain(`android:targetPackage="${PKG}"`);
    expect(xml).toContain(`android:targetClass="${PKG}.MainActivity"`);
    expect(xml).toContain(`@string/carenta_shortcut_${kind}_short`);
    expect(xml).toContain(`@string/carenta_shortcut_${kind}_long`);
    expect(xml).toContain(`@array/carenta_shortcut_${kind}_synonyms`);
  });

  it('emits well-formed XML with App Actions OPEN_APP_FEATURE capability, url-template mapping, and shortcuts', () => {
    const xml: string = plugin.buildShortcutsXml(PKG);

    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
    expect(xml).toContain(`<capability android:name="${plugin.OPEN_FEATURE_INTENT}">`);
    expect(xml).toContain('<shortcut-fulfillment>');
    expect(xml).toContain('<url-template android:value="carenta://capture{?feature}" />');
    expect(xml).toContain('android:name="feature"');
    expect(xml).toContain('android:key="feature"');
    expect(xml.match(/<capability-binding\b/g)).toHaveLength(CAPTURE_KINDS.length);
    expect(xml.match(/<shortcut\s/g)).toHaveLength(CAPTURE_KINDS.length);
    expect(xml.match(/<\/shortcut>/g)).toHaveLength(CAPTURE_KINDS.length);
    expect(xml.trim().endsWith('</shortcuts>')).toBe(true);
  });

  it('generates voice-trigger synonym string arrays for each capture kind', () => {
    const arraysXml: string = plugin.buildShortcutArraysXml();

    expect(arraysXml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
    for (const kind of CAPTURE_KINDS) {
      expect(arraysXml).toContain(`<string-array name="carenta_shortcut_${kind}_synonyms">`);
    }
    expect(arraysXml.match(/<string-array\b/g)).toHaveLength(CAPTURE_KINDS.length);
    expect(arraysXml.trim().endsWith('</resources>')).toBe(true);
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

  it('is registered in the Expo config with an Android package and secure store plugin', () => {
    const { exp } = getConfig(process.cwd(), { isPublicConfig: true });

    expect(exp.android?.package).toBe(PKG);
    expect(JSON.stringify(exp.plugins)).toContain('withCaptureShortcuts');
    expect(JSON.stringify(exp.plugins)).toContain('expo-secure-store');
  });
});
