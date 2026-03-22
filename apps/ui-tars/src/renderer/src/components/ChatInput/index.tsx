/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { IMAGE_PLACEHOLDER } from '@ui-tars/shared/constants';
import { StatusEnum } from '@ui-tars/shared/types';

import { useRunAgent } from '@renderer/hooks/useRunAgent';
import { useStore } from '@renderer/hooks/useStore';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@renderer/components/ui/tooltip';
import { Button } from '@renderer/components/ui/button';
// import { useScreenRecord } from '@renderer/hooks/useScreenRecord';
import { api } from '@renderer/api';

import { Mic, Play, Send, Square, Loader2 } from 'lucide-react';
import { Textarea } from '@renderer/components/ui/textarea';
import { useSession } from '@renderer/hooks/useSession';

import { Operator } from '@main/store/types';
import { useSetting } from '../../hooks/useSetting';

const ChatInput = ({
  operator,
  sessionId,
  disabled,
  checkBeforeRun,
}: {
  operator: Operator;
  sessionId: string;
  disabled: boolean;
  checkBeforeRun?: () => Promise<boolean>;
}) => {
  const preferredRecordingTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ];
  const {
    status,
    instructions: savedInstructions,
    messages,
    restUserData,
  } = useStore();
  const [localInstructions, setLocalInstructions] = useState('');
  const { run, stopAgentRuning } = useRunAgent();
  const { getSession, updateSession, chatMessages } = useSession();
  const { settings, updateSetting } = useSetting();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const running = status === StatusEnum.RUNNING;
  const [voiceState, setVoiceState] = useState<
    'idle' | 'listening' | 'transcribing'
  >('idle');
  const lastHumanMessage =
    [...(messages || [])]
      .reverse()
      .find((m) => m?.from === 'human' && m?.value !== IMAGE_PLACEHOLDER)
      ?.value || '';

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
      mediaStreamRef.current = null;
      recordingChunksRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (status === StatusEnum.INIT) {
      return;
    }
  }, [status]);

  useEffect(() => {
    switch (operator) {
      case Operator.RemoteComputer:
        updateSetting({ ...settings, operator: Operator.RemoteComputer });
        break;
      case Operator.RemoteBrowser:
        updateSetting({ ...settings, operator: Operator.RemoteBrowser });
        break;
      case Operator.LocalComputer:
        updateSetting({ ...settings, operator: Operator.LocalComputer });
        break;
      case Operator.LocalBrowser:
        updateSetting({ ...settings, operator: Operator.LocalBrowser });
        break;
      default:
        updateSetting({ ...settings, operator: Operator.LocalComputer });
        break;
    }
  }, [operator]);

  const getInstantInstructions = () => {
    return (
      [localInstructions, savedInstructions, lastHumanMessage]
        .find((value) => value?.trim())
        ?.trim() || ''
    );
  };

  // console.log('running', 'status', status, running);

  const startRun = async () => {
    if (checkBeforeRun) {
      const checked = await checkBeforeRun();

      if (!checked) {
        return;
      }
    }

    const instructions = getInstantInstructions();

    if (!instructions) {
      toast.error('Enter a task before running Aria');
      return;
    }

    console.log('startRun', instructions, restUserData);

    const history = chatMessages;

    const session = await getSession(sessionId);
    await updateSession(sessionId, {
      name: instructions,
      meta: {
        ...session!.meta,
        ...(restUserData || {}),
      },
    });

    run(instructions, history, () => {
      setLocalInstructions('');
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) {
      return;
    }

    // `enter` to submit
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !e.metaKey &&
      getInstantInstructions()
    ) {
      e.preventDefault();

      startRun();
    }
  };

  const isCallUser = useMemo(() => status === StatusEnum.CALL_USER, [status]);
  const isVoiceBusy = voiceState !== 'idle';

  const stopRun = async () => {
    await stopAgentRuning(() => {
      setLocalInstructions('');
    });
    await api.clearHistory();
  };

  const blobToBase64 = async (blob: Blob) => {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('Unable to read the recording'));
          return;
        }

        resolve(result.split(',')[1] || '');
      };
      reader.onerror = () => {
        reject(reader.error || new Error('Unable to read the recording'));
      };
      reader.readAsDataURL(blob);
    });
  };

  const mergeTranscriptIntoComposer = (nextText: string) => {
    setLocalInstructions((current) => {
      const trimmedCurrent = current.trim();
      const trimmedNext = nextText.trim();

      if (!trimmedNext) {
        return current;
      }

      if (!trimmedCurrent) {
        return trimmedNext;
      }

      if (trimmedCurrent.includes(trimmedNext)) {
        return current;
      }

      return `${trimmedCurrent}\n${trimmedNext}`;
    });
  };

  const cleanupVoiceSession = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    recordingChunksRef.current = [];
  };

  const finishVoiceRecording = async (blob: Blob, mimeType: string) => {
    try {
      setVoiceState('transcribing');
      const audioBase64 = await blobToBase64(blob);
      const result = await api.transcribePrompt({
        audioBase64,
        mimeType,
        fileName: `voice-input.${mimeType.includes('mp4') ? 'm4a' : 'webm'}`,
      });

      mergeTranscriptIntoComposer(result.finalPrompt);
      toast.success('Voice input added to the prompt');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Voice input failed',
      );
    } finally {
      cleanupVoiceSession();
      setVoiceState('idle');
    }
  };

  const startVoiceRecording = async () => {
    if (running || disabled || isVoiceBusy) {
      return;
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      toast.error('Voice input is not supported in this environment');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType =
        preferredRecordingTypes.find((type) =>
          MediaRecorder.isTypeSupported(type),
        ) || '';
      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = mediaRecorder;
      recordingChunksRef.current = [];

      mediaRecorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      });

      mediaRecorder.addEventListener('stop', () => {
        const effectiveMimeType =
          mediaRecorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(recordingChunksRef.current, {
          type: effectiveMimeType,
        });
        void finishVoiceRecording(blob, effectiveMimeType);
      });

      mediaRecorder.start();
      setVoiceState('listening');
    } catch (error) {
      cleanupVoiceSession();
      setVoiceState('idle');
      toast.error(
        error instanceof Error
          ? error.message
          : 'Microphone access was not granted',
      );
    }
  };

  const stopVoiceRecording = () => {
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      return;
    }

    mediaRecorder.stop();
  };

  const renderButton = () => {
    if (running) {
      return (
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8"
          onClick={stopRun}
        >
          <Square className="h-4 w-4" />
        </Button>
      );
    }

    if (isCallUser && !localInstructions) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8 bg-amber-100 hover:bg-amber-200 text-amber-600 border-amber-200"
                onClick={startRun}
                disabled={!getInstantInstructions()}
              >
                <Play className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="whitespace-pre-line">
                Resume with previous instruction
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <Button
        variant="secondary"
        size="icon"
        className="h-8 w-8"
        onClick={startRun}
        disabled={!getInstantInstructions() || disabled || isVoiceBusy}
      >
        <Send className="h-4 w-4" />
      </Button>
    );
  };

  return (
    <div className="px-4 w-full">
      <div className="flex flex-col space-y-4">
        <div className="relative w-full">
          <Textarea
            ref={textareaRef}
            placeholder={
              isCallUser && savedInstructions
                ? `${savedInstructions}`
                : running && lastHumanMessage && messages?.length > 1
                  ? lastHumanMessage
                  : 'Describe a task...'
            }
            className="min-h-[80px] rounded-2xl resize-none px-4 pb-14"
            value={localInstructions}
            disabled={running || disabled || voiceState === 'transcribing'}
            onChange={(e) => setLocalInstructions(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="absolute right-4 bottom-4 flex items-center gap-2">
            {voiceState === 'transcribing' && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {running && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            <Button
              variant={voiceState === 'listening' ? 'default' : 'secondary'}
              size="icon"
              className="h-8 w-8"
              onClick={
                voiceState === 'listening'
                  ? stopVoiceRecording
                  : startVoiceRecording
              }
              disabled={disabled || running || voiceState === 'transcribing'}
            >
              {voiceState === 'listening' ? (
                <Square className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
            {renderButton()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
