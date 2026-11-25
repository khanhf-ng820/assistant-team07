import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  CapturePermissionKind,
  openAppPermissionSettings,
  PermissionAdapters,
  PermissionCheckResult,
  requestCapturePermission,
} from '../capture/permissions';
import { useLedger } from './LedgerContext';

export type CaptureMethod = 'ocr' | 'voice' | 'manual';

export type CaptureFlowState =
  | 'idle'
  | 'requesting_permission'
  | 'permission_prompt'
  | 'camera_preview'
  | 'recording';

export interface CaptureContextType {
  captureFlow: CaptureFlowState;
  activeMethod: CaptureMethod | null;
  permissionResult: PermissionCheckResult | null;
  isCaptureBusy: boolean;
  startCapture: (method: CaptureMethod) => Promise<void>;
  retryPermission: () => Promise<void>;
  openSettingsForPermission: () => Promise<boolean>;
  requestGalleryPermission: () => Promise<PermissionCheckResult>;
  fallbackToManualEntry: () => void;
  cancelCapture: () => void;
}

const CaptureContext = createContext<CaptureContextType | undefined>(undefined);

interface CaptureProviderProps {
  children: React.ReactNode;
  permissionAdapters?: PermissionAdapters;
}

export function CaptureProvider({ children, permissionAdapters }: CaptureProviderProps) {
  const { isManualEntryOpen, openManualEntry } = useLedger();

  const [captureFlow, setCaptureFlow] = useState<CaptureFlowState>('idle');
  const [activeMethod, setActiveMethod] = useState<CaptureMethod | null>(null);
  const [permissionResult, setPermissionResult] = useState<PermissionCheckResult | null>(null);

  const flowTokenRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  // Track synchronous flow state so rapid back-to-back taps cannot bypass state updates
  const busyRef = useRef<boolean>(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      flowTokenRef.current += 1;
    };
  }, []);

  const isCaptureBusy = captureFlow !== 'idle' || isManualEntryOpen;

  const resetToIdle = useCallback(() => {
    flowTokenRef.current += 1;
    busyRef.current = false;
    setCaptureFlow('idle');
    setActiveMethod(null);
    setPermissionResult(null);
  }, []);

  const runPermissionFlow = useCallback(
    async (method: 'ocr' | 'voice', kind: CapturePermissionKind) => {
      const requestToken = ++flowTokenRef.current;
      busyRef.current = true;
      setActiveMethod(method);
      setPermissionResult(null);
      setCaptureFlow('requesting_permission');

      const result = await requestCapturePermission(kind, permissionAdapters);
      if (!isMountedRef.current || flowTokenRef.current !== requestToken) {
        return;
      }

      if (result.outcome === 'granted') {
        setPermissionResult(result);
        setCaptureFlow(method === 'ocr' ? 'camera_preview' : 'recording');
      } else {
        setPermissionResult(result);
        setCaptureFlow('permission_prompt');
      }
    },
    [permissionAdapters]
  );

  const startCapture = useCallback(
    async (method: CaptureMethod) => {
      if (busyRef.current || captureFlow !== 'idle' || isManualEntryOpen) {
        return;
      }

      if (method === 'manual') {
        openManualEntry();
        return;
      }

      const kind: CapturePermissionKind = method === 'ocr' ? 'camera' : 'microphone';
      await runPermissionFlow(method, kind);
    },
    [captureFlow, isManualEntryOpen, openManualEntry, runPermissionFlow]
  );

  const retryPermission = useCallback(async () => {
    if (!activeMethod || activeMethod === 'manual') return;
    const kind: CapturePermissionKind =
      permissionResult?.kind ?? (activeMethod === 'ocr' ? 'camera' : 'microphone');
    const requestToken = ++flowTokenRef.current;
    setCaptureFlow('requesting_permission');

    const result = await requestCapturePermission(kind, permissionAdapters);
    if (!isMountedRef.current || flowTokenRef.current !== requestToken) {
      return;
    }

    if (result.outcome === 'granted') {
      setPermissionResult(result);
      setCaptureFlow(activeMethod === 'ocr' ? 'camera_preview' : 'recording');
    } else {
      setPermissionResult(result);
      setCaptureFlow('permission_prompt');
    }
  }, [activeMethod, permissionAdapters, permissionResult]);

  const openSettingsForPermission = useCallback(async () => {
    return openAppPermissionSettings(permissionAdapters);
  }, [permissionAdapters]);

  const requestGalleryPermission = useCallback(async () => {
    const requestToken = ++flowTokenRef.current;
    const result = await requestCapturePermission('media_library', permissionAdapters);
    if (isMountedRef.current && flowTokenRef.current === requestToken && result.outcome !== 'granted') {
      setPermissionResult(result);
      setCaptureFlow('permission_prompt');
    }
    return result;
  }, [permissionAdapters]);

  const fallbackToManualEntry = useCallback(() => {
    resetToIdle();
    openManualEntry();
  }, [openManualEntry, resetToIdle]);

  const cancelCapture = useCallback(() => {
    resetToIdle();
  }, [resetToIdle]);

  const value = useMemo<CaptureContextType>(
    () => ({
      captureFlow,
      activeMethod,
      permissionResult,
      isCaptureBusy,
      startCapture,
      retryPermission,
      openSettingsForPermission,
      requestGalleryPermission,
      fallbackToManualEntry,
      cancelCapture,
    }),
    [
      captureFlow,
      activeMethod,
      permissionResult,
      isCaptureBusy,
      startCapture,
      retryPermission,
      openSettingsForPermission,
      requestGalleryPermission,
      fallbackToManualEntry,
      cancelCapture,
    ]
  );

  return <CaptureContext.Provider value={value}>{children}</CaptureContext.Provider>;
}

export function useCapture(): CaptureContextType {
  const ctx = useContext(CaptureContext);
  if (!ctx) {
    throw new Error('useCapture must be used within a CaptureProvider');
  }
  return ctx;
}
