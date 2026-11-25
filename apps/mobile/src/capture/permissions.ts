import { Linking } from 'react-native';

export type CapturePermissionKind = 'camera' | 'media_library' | 'microphone';

export type PermissionOutcome = 'granted' | 'denied' | 'blocked' | 'unavailable';

export interface PermissionCheckResult {
  kind: CapturePermissionKind;
  outcome: PermissionOutcome;
  canAskAgain: boolean;
}

export interface RawPermissionResponse {
  status?: string;
  granted?: boolean;
  canAskAgain?: boolean;
}

export interface PermissionAdapters {
  getCamera?: () => Promise<RawPermissionResponse>;
  requestCamera?: () => Promise<RawPermissionResponse>;
  getMediaLibrary?: () => Promise<RawPermissionResponse>;
  requestMediaLibrary?: () => Promise<RawPermissionResponse>;
  getMicrophone?: () => Promise<RawPermissionResponse>;
  requestMicrophone?: () => Promise<RawPermissionResponse>;
  openSettings?: () => Promise<void> | void;
}

export function normalizePermissionResponse(
  kind: CapturePermissionKind,
  response: RawPermissionResponse | null | undefined
): PermissionCheckResult {
  if (!response) {
    return { kind, outcome: 'unavailable', canAskAgain: false };
  }

  if (response.granted === true || response.status === 'granted') {
    return { kind, outcome: 'granted', canAskAgain: true };
  }

  if (response.canAskAgain === false) {
    return { kind, outcome: 'blocked', canAskAgain: false };
  }

  return {
    kind,
    outcome: 'denied',
    canAskAgain: response.canAskAgain ?? true,
  };
}

function getDefaultCheckFn(
  kind: CapturePermissionKind
): (() => Promise<RawPermissionResponse>) | null {
  try {
    if (kind === 'camera') {
      const { Camera } = require('expo-camera') as typeof import('expo-camera');
      return Camera?.getCameraPermissionsAsync
        ? () => Camera.getCameraPermissionsAsync()
        : null;
    }
    if (kind === 'media_library') {
      const ImagePicker = require('expo-image-picker') as typeof import('expo-image-picker');
      return ImagePicker?.getMediaLibraryPermissionsAsync
        ? () => ImagePicker.getMediaLibraryPermissionsAsync()
        : null;
    }
    const ExpoAudio = require('expo-audio') as typeof import('expo-audio');
    return ExpoAudio?.getRecordingPermissionsAsync
      ? () => ExpoAudio.getRecordingPermissionsAsync()
      : null;
  } catch {
    return null;
  }
}

function getDefaultRequestFn(
  kind: CapturePermissionKind
): (() => Promise<RawPermissionResponse>) | null {
  try {
    if (kind === 'camera') {
      const { Camera } = require('expo-camera') as typeof import('expo-camera');
      return Camera?.requestCameraPermissionsAsync
        ? () => Camera.requestCameraPermissionsAsync()
        : null;
    }
    if (kind === 'media_library') {
      const ImagePicker = require('expo-image-picker') as typeof import('expo-image-picker');
      return ImagePicker?.requestMediaLibraryPermissionsAsync
        ? () => ImagePicker.requestMediaLibraryPermissionsAsync()
        : null;
    }
    const ExpoAudio = require('expo-audio') as typeof import('expo-audio');
    return ExpoAudio?.requestRecordingPermissionsAsync
      ? () => ExpoAudio.requestRecordingPermissionsAsync()
      : null;
  } catch {
    return null;
  }
}

function resolveCheckAdapter(
  kind: CapturePermissionKind,
  adapters?: PermissionAdapters
): (() => Promise<RawPermissionResponse>) | null {
  if (kind === 'camera' && adapters?.getCamera) return adapters.getCamera;
  if (kind === 'media_library' && adapters?.getMediaLibrary) return adapters.getMediaLibrary;
  if (kind === 'microphone' && adapters?.getMicrophone) return adapters.getMicrophone;
  return getDefaultCheckFn(kind);
}

function resolveRequestAdapter(
  kind: CapturePermissionKind,
  adapters?: PermissionAdapters
): (() => Promise<RawPermissionResponse>) | null {
  if (kind === 'camera' && adapters?.requestCamera) return adapters.requestCamera;
  if (kind === 'media_library' && adapters?.requestMediaLibrary) return adapters.requestMediaLibrary;
  if (kind === 'microphone' && adapters?.requestMicrophone) return adapters.requestMicrophone;
  return getDefaultRequestFn(kind);
}

/** Checks current permission state without prompting the user. */
export async function checkCapturePermission(
  kind: CapturePermissionKind,
  adapters?: PermissionAdapters
): Promise<PermissionCheckResult> {
  const checkFn = resolveCheckAdapter(kind, adapters);
  if (!checkFn) {
    return { kind, outcome: 'unavailable', canAskAgain: false };
  }

  try {
    const raw = await checkFn();
    return normalizePermissionResponse(kind, raw);
  } catch {
    return { kind, outcome: 'unavailable', canAskAgain: false };
  }
}

/**
 * Requests hardware permission for camera, media library, or microphone.
 * Skips redundant OS prompts when already granted or permanently blocked.
 */
export async function requestCapturePermission(
  kind: CapturePermissionKind,
  adapters?: PermissionAdapters
): Promise<PermissionCheckResult> {
  const checkFn = resolveCheckAdapter(kind, adapters);
  if (checkFn) {
    try {
      const current = normalizePermissionResponse(kind, await checkFn());
      if (current.outcome === 'granted' || current.outcome === 'blocked') {
        return current;
      }
    } catch {
      // Fall through to explicit request attempt
    }
  }

  const requestFn = resolveRequestAdapter(kind, adapters);
  if (!requestFn) {
    return { kind, outcome: 'unavailable', canAskAgain: false };
  }

  try {
    const raw = await requestFn();
    return normalizePermissionResponse(kind, raw);
  } catch {
    return { kind, outcome: 'unavailable', canAskAgain: false };
  }
}

/** Opens OS application settings so the user can re-enable blocked permissions. */
export async function openAppPermissionSettings(
  adapters?: PermissionAdapters
): Promise<boolean> {
  try {
    if (adapters?.openSettings) {
      await adapters.openSettings();
    } else {
      await Linking.openSettings();
    }
    return true;
  } catch {
    return false;
  }
}
