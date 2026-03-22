import * as env from '@main/env';
import { logger } from '@main/logger';
import { SettingStore } from '@main/store/setting';

const ELEVENLABS_STT_ENDPOINT = 'https://api.elevenlabs.io/v1/speech-to-text';
const TRANSCRIPTION_MODEL = 'scribe_v2';
const TRANSCRIPTION_HEADER = 'xi-api-key';
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

type TranscribePromptParams = {
  audioBase64: string;
  mimeType: string;
  fileName?: string;
};

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

const decodeBase64Audio = (audioBase64: string) => {
  const buffer = Buffer.from(audioBase64, 'base64');
  if (!buffer.length) {
    throw new Error('Audio recording was empty');
  }
  if (buffer.length > MAX_AUDIO_BYTES) {
    throw new Error('Audio recording is too large');
  }
  return buffer;
};

const normalizeMimeType = (mimeType: string) => {
  if (!mimeType) {
    return 'audio/webm';
  }

  return mimeType.split(';')[0]?.trim() || 'audio/webm';
};

const getFileExtension = (mimeType: string) => {
  switch (mimeType) {
    case 'audio/webm':
      return 'webm';
    case 'audio/mp4':
    case 'audio/x-m4a':
    case 'audio/m4a':
      return 'm4a';
    case 'audio/wav':
    case 'audio/x-wav':
      return 'wav';
    case 'audio/mpeg':
      return 'mp3';
    default:
      return 'webm';
  }
};

const extractResponseText = (data: OpenAIChatResponse) => {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => item.text || '')
      .join(' ')
      .trim();
  }

  return '';
};

const cleanupTranscript = async (transcript: string) => {
  const settings = SettingStore.getStore();
  const baseUrl = trimTrailingSlash(settings.vlmBaseUrl || '');
  if (!baseUrl || !settings.vlmModelName) {
    return transcript;
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.vlmApiKey
          ? { Authorization: `Bearer ${settings.vlmApiKey}` }
          : {}),
      },
      body: JSON.stringify({
        model: settings.vlmModelName,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'Rewrite spoken desktop tasks into concise instructions for a computer-use agent. Remove filler words and disfluencies. Preserve all concrete details. Do not add steps, assumptions, or extra commentary. Return only the rewritten task.',
          },
          {
            role: 'user',
            content: transcript,
          },
        ],
      }),
    });

    if (!response.ok) {
      logger.warn(
        `[voice] cleanup request failed: ${response.status} ${response.statusText}`,
      );
      return transcript;
    }

    const data = (await response.json()) as OpenAIChatResponse;
    const cleaned = extractResponseText(data);
    return cleaned || transcript;
  } catch (error) {
    logger.warn('[voice] cleanup failed', error);
    return transcript;
  }
};

export const transcribePromptAudio = async ({
  audioBase64,
  mimeType,
  fileName,
}: TranscribePromptParams) => {
  if (!env.elevenLabsKeyV2) {
    throw new Error('ELEVENLABS_API_KEY_V2 is not configured');
  }

  const normalizedMimeType = normalizeMimeType(mimeType);
  const audioBuffer = decodeBase64Audio(audioBase64);
  const uploadName =
    fileName || `voice-input.${getFileExtension(normalizedMimeType)}`;

  const formData = new FormData();
  formData.append(
    'file',
    new Blob([new Uint8Array(audioBuffer)], { type: normalizedMimeType }),
    uploadName,
  );
  formData.append('model_id', TRANSCRIPTION_MODEL);

  const response = await fetch(ELEVENLABS_STT_ENDPOINT, {
    method: 'POST',
    headers: {
      [TRANSCRIPTION_HEADER]: env.elevenLabsKeyV2,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Transcription request failed (${response.status}): ${errorText || response.statusText}`,
    );
  }

  const data = (await response.json()) as {
    text?: string;
    language_code?: string;
  };

  const rawTranscript = data.text?.trim();
  if (!rawTranscript) {
    throw new Error('No transcript was returned from ElevenLabs');
  }

  const finalPrompt = await cleanupTranscript(rawTranscript);

  return {
    rawTranscript,
    finalPrompt: finalPrompt.trim() || rawTranscript,
    detectedLanguage: data.language_code || null,
    provider: 'elevenlabs' as const,
  };
};
