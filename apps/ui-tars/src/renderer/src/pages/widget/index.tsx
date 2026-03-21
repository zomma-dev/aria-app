/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useStore } from '@renderer/hooks/useStore';
import {
  Monitor,
  Globe,
  Pause,
  Play,
  Square,
  Loader,
  MousePointerClick,
} from 'lucide-react';
import { ActionIconMap } from '@renderer/const/actions';
import { useSetting } from '@renderer/hooks/useSetting';

import { Button } from '@renderer/components/ui/button';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@renderer/api';

import './widget.css';
import { StatusEnum } from '@ui-tars/sdk';

// https://developer.mozilla.org/en-US/docs/Web/API/Navigator/platform
// chrome 93 support
// @ts-ignore
const isWin = navigator.userAgentData.platform === 'Windows';

interface Action {
  action: string;
  type: string;
  cost?: number;
  input?: string;
  reflection?: string;
  thought?: string;
  query?: string;
}

const getOperatorIcon = (type: string) => {
  switch (type) {
    case 'nutjs':
      return <Monitor className="h-3 w-3 mr-1" />;
    case 'browser':
      return <Globe className="h-3 w-3 mr-1" />;
    default:
      return <Monitor className="h-3 w-3 mr-1" />;
  }
};

const getOperatorLabel = (type: string) => {
  switch (type) {
    case 'nutjs':
      return 'Computer';
    case 'browser':
      return 'Browser';
    default:
      return 'Computer';
  }
};

const Widget = () => {
  const { messages = [], errorMsg, status } = useStore();
  const { settings } = useSetting();

  const currentOperator = settings.operator || 'nutjs';

  const [actions, setActions] = useState<Action[]>([]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];

    console.log('lastMessage', lastMessage);

    if (!lastMessage) {
      return;
    }

    if (lastMessage.from === 'human') {
      if (!lastMessage.screenshotBase64) {
        setActions([
          {
            action: '',
            type: '',
            query: lastMessage.value,
          },
        ]);
        return;
      } else {
        return;
      }
    }

    const ac =
      lastMessage.predictionParsed?.map((item) => {
        const input = [
          item.action_inputs?.start_box &&
            `(start_box: ${item.action_inputs.start_box})`,
          item.action_inputs?.content && `(${item.action_inputs.content})`,
          item.action_inputs?.key && `(${item.action_inputs.key})`,
        ]
          .filter(Boolean)
          .join(' ');

        return {
          action: 'Action',
          type: item.action_type,
          cost: lastMessage.timing?.cost,
          input: input || undefined,
          reflection: item.reflection || '',
          thought: item.thought,
        };
      }) || [];

    setActions(ac);
  }, [messages.length]);

  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (status === StatusEnum.PAUSE && isLoading) {
      setIsLoading(false);
      setIsPaused(true);
    }
  }, [status, isLoading]);

  const handlePlayPauseClick = useCallback(async () => {
    if (isLoading) return;

    if (isPaused) {
      await api.resumeRun();
      setIsPaused(false);
    } else {
      await api.pauseRun();
      setIsLoading(true);
    }
  }, [isPaused]);

  const handleStop = useCallback(async () => {
    await api.stopRun();
    await api.clearHistory();
  }, []);

  return (
    <div
      className="w-100 h-100 overflow-hidden p-3 bg-white/92 dark:bg-gray-800/90 rounded-[10px] border-border"
      style={{ borderWidth: isWin ? '1px' : '0' }}
    >
      <div className="flex draggable-area items-center">
        <span className="font-display text-sm mr-auto">Aria</span>
        <div className="flex items-center text-[11px] border border-border px-2 py-0.5 rounded-full text-muted-foreground">
          {getOperatorIcon(currentOperator)}
          {getOperatorLabel(currentOperator)}
        </div>
      </div>

      {!!errorMsg && (
        <div className="mt-2 text-xs text-destructive">{errorMsg}</div>
      )}

      {!!actions.length && !errorMsg && (
        <div className="mt-3 max-h-70 overflow-scroll hide_scroll_bar space-y-3">
          {actions.map((action, idx) => {
            const ActionIcon = ActionIconMap[action.type] || MousePointerClick;
            return (
              <div key={idx} className="text-sm">
                {!!action.type && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    {!!ActionIcon && (
                      <ActionIcon
                        className="w-3.5 h-3.5 shrink-0"
                        strokeWidth={2}
                      />
                    )}
                    <span className="font-mono text-xs">{action.type}</span>
                    {action.input && (
                      <span className="font-mono text-xs text-muted-foreground/70 truncate">
                        {action.input}
                      </span>
                    )}
                  </div>
                )}
                {!!action.thought && (
                  <p className="mt-1 text-xs leading-relaxed text-foreground/80">
                    {action.thought}
                  </p>
                )}
                {!!action.reflection && (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground italic">
                    {action.reflection}
                  </p>
                )}
                {!!action.query && (
                  <p className="text-xs text-foreground/80">{action.query}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="absolute bottom-3 right-3 flex gap-1.5">
        <Button
          variant="outline"
          size="icon"
          onClick={handlePlayPauseClick}
          className="h-7 w-7 border-border hover:border-border bg-white/60 hover:bg-white/80"
        >
          {isLoading ? (
            <Loader className="h-3.5 w-3.5 loader-icon" />
          ) : isPaused ? (
            <Play className="h-3.5 w-3.5" />
          ) : (
            <Pause className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleStop}
          className="h-7 w-7 text-destructive border-destructive/40 bg-white/60 hover:bg-destructive/10"
        >
          <Square className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};

export default Widget;
