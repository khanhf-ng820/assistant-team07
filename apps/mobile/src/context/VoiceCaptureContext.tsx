import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { VoiceDraftLike } from '../api/contracts';

export type VoiceCaptureFlowState =
  | 'idle'
  | 'requesting_permission'
  | 'recording'
  | 'uploading'
  | 'processing'
  | 'revealing'
  | 'review'
  | 'error';

export interface VoiceCaptureContextValue {
  isVoiceCaptureOpen: boolean;
  flowState: VoiceCaptureFlowState;
  draft: VoiceDraftLike | null;
  errorMessage: string | null;
  openVoiceCapture: () => void;
  closeVoiceCapture: () => void;
  setFlowState: (state: VoiceCaptureFlowState) => void;
  setDraft: (draft: VoiceDraftLike | null) => void;
  setErrorMessage: (message: string | null) => void;
}

const VoiceCaptureContext = createContext<VoiceCaptureContextValue | undefined>(undefined);

export function VoiceCaptureProvider({ children }: { children: React.ReactNode }) {
  const [isVoiceCaptureOpen, setIsVoiceCaptureOpen] = useState<boolean>(false);
  const [flowState, setFlowState] = useState<VoiceCaptureFlowState>('idle');
  const [draft, setDraft] = useState<VoiceDraftLike | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const openVoiceCapture = useCallback(() => {
    setDraft(null);
    setErrorMessage(null);
    setFlowState('requesting_permission');
    setIsVoiceCaptureOpen(true);
  }, []);

  const closeVoiceCapture = useCallback(() => {
    setIsVoiceCaptureOpen(false);
    setFlowState('idle');
    setDraft(null);
    setErrorMessage(null);
  }, []);

  const value = useMemo<VoiceCaptureContextValue>(
    () => ({
      isVoiceCaptureOpen,
      flowState,
      draft,
      errorMessage,
      openVoiceCapture,
      closeVoiceCapture,
      setFlowState,
      setDraft,
      setErrorMessage,
    }),
    [closeVoiceCapture, draft, errorMessage, flowState, isVoiceCaptureOpen, openVoiceCapture]
  );

  return <VoiceCaptureContext.Provider value={value}>{children}</VoiceCaptureContext.Provider>;
}

export function useVoiceCapture(): VoiceCaptureContextValue {
  const context = useContext(VoiceCaptureContext);
  if (!context) {
    throw new Error('useVoiceCapture must be used within a VoiceCaptureProvider');
  }
  return context;
}

export function useOptionalVoiceCapture(): VoiceCaptureContextValue | undefined {
  return useContext(VoiceCaptureContext);
}
