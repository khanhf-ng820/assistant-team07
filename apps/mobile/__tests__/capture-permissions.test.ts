import { Linking } from 'react-native';
import {
  checkCapturePermission,
  normalizePermissionResponse,
  openAppPermissionSettings,
  requestCapturePermission,
} from '../src/capture/permissions';

describe('capture permissions adapter', () => {
  it('normalizes granted, denied, blocked, and null responses', () => {
    expect(normalizePermissionResponse('camera', { status: 'granted', granted: true })).toEqual({
      kind: 'camera',
      outcome: 'granted',
      canAskAgain: true,
    });

    expect(
      normalizePermissionResponse('microphone', {
        status: 'denied',
        granted: false,
        canAskAgain: true,
      })
    ).toEqual({
      kind: 'microphone',
      outcome: 'denied',
      canAskAgain: true,
    });

    expect(
      normalizePermissionResponse('media_library', {
        status: 'denied',
        granted: false,
        canAskAgain: false,
      })
    ).toEqual({
      kind: 'media_library',
      outcome: 'blocked',
      canAskAgain: false,
    });

    expect(normalizePermissionResponse('camera', null)).toEqual({
      kind: 'camera',
      outcome: 'unavailable',
      canAskAgain: false,
    });
  });

  it('returns granted immediately without re-prompting when already granted', async () => {
    const getCamera = jest.fn().mockResolvedValue({ status: 'granted', granted: true });
    const requestCamera = jest.fn();

    const result = await requestCapturePermission('camera', { getCamera, requestCamera });
    expect(result.outcome).toBe('granted');
    expect(getCamera).toHaveBeenCalledTimes(1);
    expect(requestCamera).not.toHaveBeenCalled();
  });

  it('skips request prompt and returns blocked when already permanently denied', async () => {
    const getMicrophone = jest
      .fn()
      .mockResolvedValue({ status: 'denied', granted: false, canAskAgain: false });
    const requestMicrophone = jest.fn();

    const result = await requestCapturePermission('microphone', {
      getMicrophone,
      requestMicrophone,
    });
    expect(result).toEqual({
      kind: 'microphone',
      outcome: 'blocked',
      canAskAgain: false,
    });
    expect(requestMicrophone).not.toHaveBeenCalled();
  });

  it('requests permission when undetermined and returns normalized outcome', async () => {
    const getMediaLibrary = jest
      .fn()
      .mockResolvedValue({ status: 'undetermined', granted: false, canAskAgain: true });
    const requestMediaLibrary = jest
      .fn()
      .mockResolvedValue({ status: 'granted', granted: true, canAskAgain: true });

    const result = await requestCapturePermission('media_library', {
      getMediaLibrary,
      requestMediaLibrary,
    });
    expect(result.outcome).toBe('granted');
    expect(requestMediaLibrary).toHaveBeenCalledTimes(1);
  });

  it('handles adapter errors gracefully as unavailable', async () => {
    const checkResult = await checkCapturePermission('camera', {
      getCamera: jest.fn().mockRejectedValue(new Error('Native module missing')),
    });
    expect(checkResult).toEqual({
      kind: 'camera',
      outcome: 'unavailable',
      canAskAgain: false,
    });

    const reqResult = await requestCapturePermission('microphone', {
      getMicrophone: jest.fn().mockResolvedValue({ status: 'undetermined', granted: false }),
      requestMicrophone: jest.fn().mockRejectedValue(new Error('Permission error')),
    });
    expect(reqResult).toEqual({
      kind: 'microphone',
      outcome: 'unavailable',
      canAskAgain: false,
    });
  });

  it('opens OS settings and handles Linking failures safely', async () => {
    const openSettingsSpy = jest.spyOn(Linking, 'openSettings').mockResolvedValueOnce(undefined);
    await expect(openAppPermissionSettings()).resolves.toBe(true);
    expect(openSettingsSpy).toHaveBeenCalledTimes(1);

    openSettingsSpy.mockRejectedValueOnce(new Error('Cannot open settings'));
    await expect(openAppPermissionSettings()).resolves.toBe(false);
    openSettingsSpy.mockRestore();
  });
});
