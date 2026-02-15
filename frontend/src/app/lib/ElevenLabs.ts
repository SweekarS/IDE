interface SpeakWithElevenLabsResult {
  promise: Promise<void>;
  cancel: () => void;
}

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";

export function speakWithElevenLabs(apiKey: string, text: string): SpeakWithElevenLabsResult {
  const controller = new AbortController();
  let audio: HTMLAudioElement | null = null;
  let objectUrl: string | null = null;

  const cleanup = () => {
    if (audio) {
      audio.pause();
      audio.src = "";
      audio = null;
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  };

  const cancel = () => {
    controller.abort();
    cleanup();
  };

  const promise = (async () => {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${DEFAULT_VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: DEFAULT_MODEL_ID,
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      let details = "";
      try {
        details = await response.text();
      } catch {
        /* ignore */
      }
      throw new Error(
        `ElevenLabs request failed: ${response.status}${details ? ` - ${details}` : ""}`
      );
    }

    const blob = await response.blob();
    objectUrl = URL.createObjectURL(blob);
    audio = new Audio(objectUrl);

    await new Promise<void>((resolve, reject) => {
      if (!audio) {
        reject(new Error("Audio player not available"));
        return;
      }

      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("Audio playback failed"));
      audio.play().catch(reject);
    });

    cleanup();
  })();

  return { promise, cancel };
}