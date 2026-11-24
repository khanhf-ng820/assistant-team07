/**
 * Expo config plugin: Android static app shortcuts for quick expense capture
 * (issue #53). Long-pressing the launcher icon shows one shortcut per capture
 * kind; each opens `carenta://capture/<kind>`.
 *
 * Shortcuts are static (declared at build time), so they only exist in a
 * development build or an installed APK, not in Expo Go.
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

const CAPTURE_SHORTCUTS = [
  { kind: 'ocr', short: 'Quét hóa đơn', long: 'Quét hóa đơn để ghi chi tiêu' },
  { kind: 'voice', short: 'Ghi âm', long: 'Ghi chi tiêu bằng giọng nói' },
  { kind: 'manual', short: 'Nhập tay', long: 'Nhập giao dịch thủ công' },
];

const stringName = (kind, variant) => `carenta_shortcut_${kind}_${variant}`;

function requirePackage(config) {
  const pkg = config.android && config.android.package;
  if (!pkg) {
    throw new Error('withCaptureShortcuts requires expo.android.package to be set in app.config.ts');
  }
  return pkg;
}

/** Contents of res/xml/carenta_shortcuts.xml. */
function buildShortcutsXml(pkg) {
  const items = CAPTURE_SHORTCUTS.map(
    ({ kind }) => `  <shortcut
    android:shortcutId="capture_${kind}"
    android:enabled="true"
    android:shortcutShortLabel="@string/${stringName(kind, 'short')}"
    android:shortcutLongLabel="@string/${stringName(kind, 'long')}">
    <intent
      android:action="android.intent.action.VIEW"
      android:data="${SCHEME}://capture/${kind}"
      android:targetPackage="${pkg}"
      android:targetClass="${pkg}.MainActivity" />
  </shortcut>`,
  ).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
${items}
</shortcuts>
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
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(path.join(dir, `${SHORTCUTS_RESOURCE}.xml`), buildShortcutsXml(pkg));
      return cfg;
    },
  ]);

  return config;
}

module.exports = withCaptureShortcuts;
module.exports.CAPTURE_SHORTCUTS = CAPTURE_SHORTCUTS;
module.exports.buildShortcutsXml = buildShortcutsXml;
module.exports.addShortcutsMetaData = addShortcutsMetaData;
