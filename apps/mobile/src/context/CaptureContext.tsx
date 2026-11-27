import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import {
  CapturePermissionKind,
  checkCapturePermission,
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
  dismissPermissionPrompt: () => void;
  fallbackToManualEntry: () => void;
  cancelCapture: () => void;
}

const CaptureContext = createContext<CaptureContextType | undefined>(undefined);

interface CaptureProviderProps {
  children: React.ReactNode;
  permissionAdapters?: PermissionAdapters;
  /** Optional route handoff when camera permission is granted (e.g. PR #96 app/capture/ocr). */
  onOcrGranted?: () => void;
  /** Optional route handoff when microphone permission is granted (e.g. #49 voice pipeline). */
  onVoiceGranted?: () => void;
}

export function CaptureProvider({
  children,
  permissionAdapters,
  onOcrGranted,
  onVoiceGranted,
}: CaptureProviderProps) {
  const { isManualEntryOpen, openManualEntry } = useLedger();

  const [captureFlow, setCaptureFlow] = useState<CaptureFlowState>('idle');
  const [activeMethod, setActiveMethod] = useState<CaptureMethod | null>(null);
  const [permissionResult, setPermissionResult] = useState<PermissionCheckResult | null>(null);

  const flowTokenRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  // Track synchronous busy and in-flight request state so rapid double-taps cannot launch duplicate OS prompts
  const busyRef = useRef<boolean>(false);
  const requestingRef = useRef<boolean>(false);
  const awaitingSettingsReturnRef = useRef<boolean>(false);

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
    requestingRef.current = false;
    awaitingSettingsReturnRef.current = false;
    setCaptureFlow('idle');
    setActiveMethod(null);
    setPermissionResult(null);
  }, []);

  const applyPermissionOutcome = useCallback(
    (method: 'ocr' | 'voice', result: PermissionCheckResult) => {
      if (result.outcome === 'granted') {
        if (method === 'ocr' && onOcrGranted) {
          resetToIdle();
          onOcrGranted();
          return;
        }
        if (method === 'voice' && onVoiceGranted) {
          resetToIdle();
          onVoiceGranted();
          return;
        }
        awaitingSettingsReturnRef.current = false;
        setPermissionResult(result);
        setCaptureFlow(method === 'ocr' ? 'camera_preview' : 'recording');
      } else {
        setPermissionResult(result);
        setCaptureFlow('permission_prompt');
      }
    },
    [onOcrGranted, onVoiceGranted, resetToIdle]
  );

  // Re-check permission automatically when returning from OS settings
  useEffect(() => {
    if (captureFlow !== 'permission_prompt' || !permissionResult || !activeMethod || activeMethod === 'manual') {
      return;
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' || !awaitingSettingsReturnRef.current || requestingRef.current) {
        return;
      }

      awaitingSettingsReturnRef.current = false;
      const requestToken = flowTokenRef.current;

      void checkCapturePermission(permissionResult.kind, permissionAdapters).then((rechecked) => {
        if (!isMountedRef.current || flowTokenRef.current !== requestToken) {
          return;
        }
        applyPermissionOutcome(activeMethod, rechecked);
      });
    });

    return () => {
      subscription?.remove?.();
    };
  }, [activeMethod, applyPermissionOutcome, captureFlow, permissionAdapters, permissionResult]);

  const executePermissionRequest = useCallback(
    async (method: 'ocr' | 'voice', kind: CapturePermissionKind) => {
      if (requestingRef.current) return;

      const requestToken = ++flowTokenRef.current;
      busyRef.current = true;
      requestingRef.current = true;
      setActiveMethod(method);
      setPermissionResult(null);
      setCaptureFlow('requesting_permission');

      try {
        const result = await requestCapturePermission(kind, permissionAdapters);
        if (!isMountedRef.current || flowTokenRef.current !== requestToken) {
          return;
        }
        applyPermissionOutcome(method, result);
      } finally {
        if (flowTokenRef.current === requestToken) {
          requestingRef.current = false;
        }
      }
    },
    [applyPermissionOutcome, permissionAdapters]
  );

  const startCapture = useCallback(
    async (method: CaptureMethod) => {
      if (busyRef.current || requestingRef.current || captureFlow !== 'idle' || isManualEntryOpen) {
        return;
      }

      if (method === 'manual') {
        openManualEntry();
        return;
      }

      const kind: CapturePermissionKind = method === 'ocr' ? 'camera' : 'microphone';
      await executePermissionRequest(method, kind);
    },
    [captureFlow, executePermissionRequest, isManualEntryOpen, openManualEntry]
  );

  const retryPermission = useCallback(async () => {
    if (!activeMethod || activeMethod === 'manual' || requestingRef.current) {
      return;
    }
    const kind: CapturePermissionKind =
      permissionResult?.kind ?? (activeMethod === 'ocr' ? 'camera' : 'microphone');
    await executePermissionRequest(activeMethod, kind);
  }, [activeMethod, executePermissionRequest, permissionResult]);

  const openSettingsForPermission = useCallback(async () => {
    awaitingSettingsReturnRef.current = true;
    const opened = await openAppPermissionSettings(permissionAdapters);
    if (!opened) {
      awaitingSettingsReturnRef.current = false;
    }
    return opened;
  }, [permissionAdapters]);

  const requestGalleryPermission = useCallback(async () => {
    if (requestingRef.current) {
      return {
        kind: 'media_library',
        outcome: 'unavailable',
        canAskAgain: false,
      } satisfies PermissionCheckResult;
    }

    const requestToken = ++flowTokenRef.current;
    requestingRef.current = true;

    try {
      const result = await requestCapturePermission('media_library', permissionAdapters);
      if (isMountedRef.current && flowTokenRef.current === requestToken && result.outcome !== 'granted') {
        setPermissionResult(result);
        setCaptureFlow('permission_prompt');
      }
      return result;
    } finally {
      if (flowTokenRef.current === requestToken) {
        requestingRef.current = false;
      }
    }
  }, [permissionAdapters]);

  const dismissPermissionPrompt = useCallback(() => {
    // Keep the camera viewfinder open if the user only dismissed the optional gallery permission prompt
    if (activeMethod === 'ocr' && permissionResult?.kind === 'media_library') {
      awaitingSettingsReturnRef.current = false;
      setPermissionResult(null);
      setCaptureFlow('camera_preview');
      return;
    }
    resetToIdle();
  }, [activeMethod, permissionResult, resetToIdle]);

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
      dismissPermissionPrompt,
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
      dismissPermissionPrompt,
      fallbackToManualEntry,
      cancelCapture,
    ]
  );

  return <CaptureContext.Provider value={value}>{children}</CaptureContext.Provider>;
}

export function useOptionalCapture(): CaptureContextType | null {
  return useContext(CaptureContext) ?? null;
}

export function useCapture(): CaptureContextType {
  const ctx = useContext(CaptureContext);
  if (!ctx) {
    throw new Error('useCapture must be used within a CaptureProvider');
  }
  return ctx;
}
