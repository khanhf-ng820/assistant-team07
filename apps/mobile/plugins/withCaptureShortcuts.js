/**
 * Expo config plugin: Android static app shortcuts and Google Assistant
 * App Actions capability bindings for quick expense capture (issue #53).
 * Long-pressing the launcher icon shows one shortcut per capture kind, and
 * `actions.intent.OPEN_APP_FEATURE` binds voice queries to `carenta://capture/<kind>`.
 *
 * Shortcuts and capabilities are static (declared at build time), so they only
 * exist in a development build or an installed APK, not in Expo Go.
 *
 * Keep CAPTURE_SHORTCUTS in sync with `src/capture/routes.ts`
 * (`__tests__/capture-shortcuts.test.ts` fails if they drift).
 */
const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withStringsXml,
} = require('@expo/config-plugins');

const SCHEME = 'carenta';
const SHORTCUTS_RESOURCE = 'carenta_shortcuts';
const ARRAYS_RESOURCE = 'carenta_shortcut_arrays';
const OPEN_FEATURE_INTENT = 'actions.intent.OPEN_APP_FEATURE';

const CAPTURE_SHORTCUTS = [
  {
    kind: 'ocr',
    short: 'Quét hóa đơn',
    long: 'Quét hóa đơn để ghi chi tiêu',
    synonyms: ['Quét hóa đơn', 'Chụp hóa đơn', 'Scan receipt'],
  },
  {
    kind: 'voice',
    short: 'Ghi âm',
    long: 'Ghi chi tiêu bằng giọng nói',
    synonyms: ['Ghi âm', 'Ghi chi tiêu bằng giọng nói', 'Voice expense'],
  },
  {
    kind: 'manual',
    short: 'Nhập tay',
    long: 'Nhập giao dịch thủ công',
    synonyms: ['Nhập tay', 'Nhập thủ công', 'Manual expense'],
  },
];

const stringName = (kind, variant) => `carenta_shortcut_${kind}_${variant}`;
const arrayName = (kind) => `carenta_shortcut_${kind}_synonyms`;

function requirePackage(config) {
  const pkg = config.android && config.android.package;
  if (!pkg) {
    throw new Error('withCaptureShortcuts requires expo.android.package to be set in app.config.ts');
  }
  return pkg;
}

/** Contents of res/xml/carenta_shortcuts.xml including App Actions capability. */
function buildShortcutsXml(pkg) {
  const capability = `  <capability android:name="${OPEN_FEATURE_INTENT}">
    <shortcut-fulfillment>
      <parameter android:name="feature" />
    </shortcut-fulfillment>
    <intent
      android:action="android.intent.action.VIEW"
      android:targetPackage="${pkg}"
      android:targetClass="${pkg}.MainActivity">
      <url-template android:value="${SCHEME}://capture{?feature}" />
      <parameter
        android:name="feature"
        android:key="feature" />
    </intent>
  </capability>`;

  const items = CAPTURE_SHORTCUTS.map(
    ({ kind }) => `  <shortcut
    android:shortcutId="capture_${kind}"
    android:enabled="true"
    android:shortcutShortLabel="@string/${stringName(kind, 'short')}"
    android:shortcutLongLabel="@string/${stringName(kind, 'long')}">
    <capability-binding android:key="${OPEN_FEATURE_INTENT}">
      <parameter-binding
        android:key="feature"
        android:value="@array/${arrayName(kind)}" />
    </capability-binding>
    <intent
      android:action="android.intent.action.VIEW"
      android:data="${SCHEME}://capture/${kind}"
      android:targetPackage="${pkg}"
      android:targetClass="${pkg}.MainActivity" />
  </shortcut>`,
  ).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
${capability}
${items}
</shortcuts>
`;
}

/** Contents of res/values/carenta_shortcut_arrays.xml for inline voice synonyms. */
function buildShortcutArraysXml() {
  const arrays = CAPTURE_SHORTCUTS.map(({ kind, synonyms }) => {
    const entries = synonyms.map((label) => `    <item>${label}</item>`).join('\n');
    return `  <string-array name="${arrayName(kind)}">\n${entries}\n  </string-array>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
${arrays}
</resources>
`;
}

/** Adds the android.app.shortcuts meta-data to an activity (idempotent). */
function addShortcutsMetaData(activity) {
  const metaData = (activity['meta-data'] = activity['meta-data'] || []);
  const exists = metaData.some((item) => item.$['android:name'] === 'android.app.shortcuts');
  if (!exists) {
    metaData.push({
      $: {
        'android:name': 'android.app.shortcuts',
        'android:resource': `@xml/${SHORTCUTS_RESOURCE}`,
      },
    });
  }
  return activity;
}

function withCaptureShortcuts(config) {
  const pkg = requirePackage(config);

  config = withStringsXml(config, (cfg) => {
    let strings = cfg.modResults;
    for (const { kind, short, long } of CAPTURE_SHORTCUTS) {
      for (const [variant, text] of [
        ['short', short],
        ['long', long],
      ]) {
        strings = AndroidConfig.Strings.setStringItem(
          [{ $: { name: stringName(kind, variant), translatable: 'false' }, _: text }],
          strings,
        );
      }
    }
    cfg.modResults = strings;
    return cfg;
  });

  config = withAndroidManifest(config, (cfg) => {
    addShortcutsMetaData(AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults));
    return cfg;
  });

  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const resDir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
      const xmlDir = path.join(resDir, 'xml');
      const valuesDir = path.join(resDir, 'values');
      await fs.promises.mkdir(xmlDir, { recursive: true });
      await fs.promises.mkdir(valuesDir, { recursive: true });
      await fs.promises.writeFile(path.join(xmlDir, `${SHORTCUTS_RESOURCE}.xml`), buildShortcutsXml(pkg));
      await fs.promises.writeFile(path.join(valuesDir, `${ARRAYS_RESOURCE}.xml`), buildShortcutArraysXml());
      return cfg;
    },
  ]);

  return config;
}

module.exports = withCaptureShortcuts;
module.exports.CAPTURE_SHORTCUTS = CAPTURE_SHORTCUTS;
module.exports.OPEN_FEATURE_INTENT = OPEN_FEATURE_INTENT;
module.exports.buildShortcutsXml = buildShortcutsXml;
module.exports.buildShortcutArraysXml = buildShortcutArraysXml;
module.exports.addShortcutsMetaData = addShortcutsMetaData;
