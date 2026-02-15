import { useCallback, useEffect, useRef, useState } from "react";
import { speakWithElevenLabs } from "../lib/ElevenLabs.ts";

function getElevenLabsKey(): string | undefined {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const key = env?.VITE_ELEVENLABS_API_KEY;
  return typeof key === "string" && key.trim() ? key.trim() : undefined;
}

export function useTextToSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const elevenLabsCancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const hasElevenLabs = !!getElevenLabsKey();
    setSupported(hasElevenLabs);
  }, []);

  const speak = useCallback(
    (text: string): Promise<void> => {
      if (!text.trim()) return Promise.resolve();

      const apiKey = getElevenLabsKey();
      if (!apiKey) {
        throw new Error("Missing VITE_ELEVENLABS_API_KEY for speech.");
      }

      elevenLabsCancelRef.current = null;
      setIsSpeaking(true);

      const { promise, cancel } = speakWithElevenLabs(apiKey, text);
      elevenLabsCancelRef.current = cancel;

      return promise
        .then(() => {
          elevenLabsCancelRef.current = null;
          setIsSpeaking(false);
        })
        .catch((error: unknown) => {
          elevenLabsCancelRef.current = null;
          setIsSpeaking(false);
          if (error instanceof Error) {
            throw error;
          }
          throw new Error("ElevenLabs speech failed");
        });
    },
    []
  );

  const cancel = useCallback(() => {
    const elevenLabsCancel = elevenLabsCancelRef.current;
    if (elevenLabsCancel) {
      elevenLabsCancel();
      elevenLabsCancelRef.current = null;
      setIsSpeaking(false);
    }
  }, []);

  return {
    speak,
    isSpeaking,
    cancel,
    supported: supported ?? false,
  };
}