import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export interface VoiceCaptureContextValue {
  isVoiceCaptureOpen: boolean;
  openVoiceCapture: () => void;
  closeVoiceCapture: () => void;
}

const VoiceCaptureContext = createContext<VoiceCaptureContextValue | undefined>(undefined);

export function VoiceCaptureProvider({ children }: { children: React.ReactNode }) {
  const [isVoiceCaptureOpen, setIsVoiceCaptureOpen] = useState<boolean>(false);

  const openVoiceCapture = useCallback(() => {
    setIsVoiceCaptureOpen(true);
  }, []);

  const closeVoiceCapture = useCallback(() => {
    setIsVoiceCaptureOpen(false);
  }, []);

  const value = useMemo<VoiceCaptureContextValue>(
    () => ({
      isVoiceCaptureOpen,
      openVoiceCapture,
      closeVoiceCapture,
    }),
    [closeVoiceCapture, isVoiceCaptureOpen, openVoiceCapture]
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
