import { MessageCirclePlus, Settings2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@renderer/components/ui/button';
import { SidebarTrigger, useSidebar } from '@renderer/components/ui/sidebar';
import { NavHeader } from '@renderer/components/Detail/NavHeader';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { Textarea } from '@renderer/components/ui/textarea';

import { useStore } from '@renderer/hooks/useStore';
import { useSetting } from '@renderer/hooks/useSetting';
import { useSession } from '@renderer/hooks/useSession';
import Prompts from '../../components/Prompts';
import { IMAGE_PLACEHOLDER } from '@ui-tars/shared/constants';
import {
  AssistantTextMessage,
  ErrorMessage,
  HumanTextMessage,
  LoadingText,
  ScreenshotMessage,
} from '../../components/RunMessages/Messages';
import ThoughtChain from '../../components/ThoughtChain';
import { api } from '../../api';
import ImageGallery from '../../components/ImageGallery';
import { PredictionParsed, StatusEnum } from '@ui-tars/shared/types';
import { RouterState } from '../../typings';
import ChatInput from '../../components/ChatInput';
import { NavDialog } from '../../components/AlertDialog/navDialog';
import {
  checkVLMSettings,
  LocalSettingsDialog,
} from '../../components/Settings/local';
import { sleep } from '@ui-tars/shared/utils';
import { FeedbackButtons } from '@renderer/components/FeedbackButtons';
import { useGlobalSettings } from '@renderer/components/Settings/global';
import { Operator } from '@main/store/types';

const getFinishedContent = (predictionParsed?: PredictionParsed[]) =>
  predictionParsed?.find(
    (step) =>
      step.action_type === 'finished' &&
      typeof step.action_inputs?.content === 'string' &&
      step.action_inputs.content.trim() !== '',
  )?.action_inputs?.content as string | undefined;

const OPERATOR_META = {
  [Operator.LocalComputer]: {
    title: 'Local computer',
    description: 'Desktop operator',
  },
  [Operator.LocalBrowser]: {
    title: 'Local browser',
    description: 'Browser operator',
  },
  [Operator.RemoteComputer]: {
    title: 'Remote computer',
    description: 'Remote operator',
  },
  [Operator.RemoteBrowser]: {
    title: 'Remote browser',
    description: 'Remote operator',
  },
};

const cleanTypedContent = (value?: string) =>
  (value || '').replace(/\\n/g, '\n').replace(/\n+/g, '\n').trim();

const toQuotedInline = (value: string) => `\`${value.replace(/`/g, '\\`')}\``;

const buildTaskHintsDraft = (instruction: string, runMessages: any[]) => {
  const normalizedInstruction = instruction.trim();
  const actionSteps = runMessages.flatMap(
    (message) => message.predictionParsed || [],
  );

  if (!normalizedInstruction || actionSteps.length === 0) {
    return '';
  }

  const typedCommands = actionSteps
    .filter((step) => step.action_type === 'type')
    .map((step) => cleanTypedContent(step.action_inputs?.content))
    .filter(Boolean);
  const hotkeys = actionSteps
    .filter((step) => step.action_type === 'hotkey')
    .map((step) => cleanTypedContent(step.action_inputs?.key))
    .filter(Boolean);
  const thoughtHints = actionSteps
    .map((step) => step.thought?.trim())
    .filter(Boolean)
    .filter((thought, index, list) => list.indexOf(thought) === index)
    .slice(0, 3);
  const uniqueCommands = typedCommands.filter(
    (command, index, list) => list.indexOf(command) === index,
  );
  const uniqueHotkeys = hotkeys.filter(
    (command, index, list) => list.indexOf(command) === index,
  );

  const adaptationHints: string[] = [];
  if (
    /desktop/i.test(normalizedInstruction) ||
    uniqueCommands.some((cmd) => /Desktop/i.test(cmd))
  ) {
    adaptationHints.push(
      '- For another Desktop folder, keep the same flow and swap only the folder name or path.',
    );
  }
  if (/folder/i.test(normalizedInstruction)) {
    adaptationHints.push(
      '- If the task changes from opening a folder to opening a file inside it, open the folder first, then switch to GUI actions for the specific item.',
    );
  }

  return [
    `# Reusable Task Hints`,
    ``,
    `## Goal Pattern`,
    `- Base task: ${normalizedInstruction}`,
    `- Prefer Terminal and keyboard-first actions for file and folder tasks before using coordinate-based clicks.`,
    ``,
    `## Reusable Sequence`,
    ...(uniqueHotkeys.length
      ? uniqueHotkeys.map(
          (hotkey) =>
            `- Use ${toQuotedInline(`hotkey(key='${hotkey}')`)} when the same keyboard shortcut applies.`,
        )
      : [
          '- Prefer keyboard shortcuts such as Spotlight before mouse navigation.',
        ]),
    ...(uniqueCommands.length
      ? uniqueCommands.map(
          (command) =>
            `- Reuse ${toQuotedInline(command)} when the target is similar; change only the folder, file name, or path.`,
        )
      : [
          '- If Terminal is already focused, type the minimum command needed instead of navigating Finder manually.',
        ]),
    ``,
    `## Observations`,
    ...(thoughtHints.length
      ? thoughtHints.map((thought) => `- ${thought}`)
      : [
          '- Keep the next action short and explicit so the agent can stay on the fast path.',
        ]),
    ``,
    `## Adaptation Rules`,
    ...(adaptationHints.length
      ? adaptationHints
      : [
          '- Adjust names and paths for the new task, but keep the same general keyboard-first workflow when it still fits.',
        ]),
  ].join('\n');
};

const LocalOperator = () => {
  const state = useLocation().state as RouterState;
  const navigate = useNavigate();
  const { setOpen } = useSidebar();
  const { openSettings } = useGlobalSettings();
  const { settings, updateSetting } = useSetting();

  const {
    status,
    messages = [],
    thinking,
    errorMsg,
    instructions,
    restUserData,
  } = useStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const suggestions: string[] = [];
  const [selectImg, setSelectImg] = useState<number | undefined>(undefined);
  const [initId, setInitId] = useState('');
  const {
    currentSessionId,
    setActiveSession,
    updateMessages,
    createSession,
    chatMessages,
  } = useSession();
  const [pendingAction, setPendingAction] = useState<'newChat' | 'back' | null>(
    null,
  );
  const [hintDraft, setHintDraft] = useState('');
  const [hintDraftKey, setHintDraftKey] = useState('');
  const [isNavDialogOpen, setNavDialogOpen] = useState(false);
  const [localOpen, setLocalOpen] = useState(false);
  const operatorMeta =
    OPERATOR_META[state.operator] ?? OPERATOR_META[Operator.LocalComputer];

  useEffect(() => {
    const update = async () => {
      if (state.sessionId) {
        await setActiveSession(state.sessionId);
        setInitId(state.sessionId);
      }
    };
    update();
    setOpen(false);
  }, [state.sessionId]);

  useEffect(() => {
    if (initId !== state.sessionId) {
      return;
    }

    if (
      state.sessionId &&
      currentSessionId &&
      state.sessionId !== currentSessionId
    ) {
      return;
    }

    if (messages.length) {
      const existingMessagesSet = new Set(
        chatMessages.map(
          (msg) => `${msg.value}-${msg.from}-${msg.timing?.start}`,
        ),
      );
      const newMessages = messages.filter(
        (msg) =>
          !existingMessagesSet.has(
            `${msg.value}-${msg.from}-${msg.timing?.start}`,
          ),
      );
      const allMessages = [...chatMessages, ...newMessages];

      updateMessages(state.sessionId, allMessages);
    }
  }, [
    initId,
    state.sessionId,
    currentSessionId,
    chatMessages.length,
    messages.length,
  ]);

  useEffect(() => {
    setTimeout(() => {
      containerRef.current?.scrollIntoView(false);
    }, 100);
  }, [messages, thinking, errorMsg]);

  useEffect(() => {
    if (status !== StatusEnum.END) {
      return;
    }

    const effectiveInstruction =
      instructions?.trim() ||
      [...messages]
        .reverse()
        .find(
          (message) =>
            message?.from === 'human' && message?.value !== IMAGE_PLACEHOLDER,
        )
        ?.value?.trim() ||
      '';

    const latestActionMessage = [...messages]
      .reverse()
      .find(
        (message) =>
          message?.from === 'gpt' && message?.predictionParsed?.length,
      );

    const draftKey = [
      effectiveInstruction,
      latestActionMessage?.timing?.end ||
        latestActionMessage?.timing?.start ||
        '',
      messages.length,
    ].join('::');

    if (
      !effectiveInstruction ||
      !latestActionMessage ||
      draftKey === hintDraftKey
    ) {
      return;
    }

    const draft = buildTaskHintsDraft(effectiveInstruction, messages);
    if (!draft) {
      return;
    }

    setHintDraft(draft);
    setHintDraftKey(draftKey);
  }, [status, instructions, messages, hintDraftKey]);

  const handleSelect = async (suggestion: string) => {
    await api.setInstructions({ instructions: suggestion });
  };

  const handleImageSelect = async (index: number) => {
    setSelectImg(index);
  };

  // check status before nav
  const needsConfirm =
    status === StatusEnum.RUNNING ||
    status === StatusEnum.CALL_USER ||
    status === StatusEnum.PAUSE;

  const onNewChat = useCallback(async () => {
    const session = await createSession('New Session', {
      operator: state.operator,
    });

    navigate('/local', {
      state: {
        operator: state.operator,
        sessionId: session?.id,
        from: 'new',
      },
    });
  }, []);

  const onBack = useCallback(async () => {
    navigate('/');
  }, []);

  const handleNewChat = useCallback(() => {
    if (needsConfirm) {
      setPendingAction('newChat');
      setNavDialogOpen(true);
    } else {
      onNewChat();
    }
  }, [needsConfirm]);

  const handleBack = useCallback(() => {
    if (needsConfirm) {
      setPendingAction('back');
      setNavDialogOpen(true);
    } else {
      onBack();
    }
  }, [needsConfirm]);

  const onConfirm = useCallback(async () => {
    await api.stopRun();
    await api.clearHistory();

    if (pendingAction === 'newChat') {
      await onNewChat();
    } else if (pendingAction === 'back') {
      await onBack();
    }
    setPendingAction(null);
    setNavDialogOpen(false);
  }, [pendingAction]);

  const onCancel = useCallback(() => {
    setPendingAction(null);
    setNavDialogOpen(false);
  }, []);

  const handleLocalSettingsSubmit = async () => {
    setLocalOpen(false);

    await sleep(200);
  };

  const handleLocalSettingsClose = () => {
    setLocalOpen(false);
  };

  const saveHintDraft = async (mode: 'replace' | 'append') => {
    const nextDraft = hintDraft.trim();
    if (!nextDraft) {
      return;
    }

    const existing = settings.taskHintsMarkdown?.trim() || '';
    const merged =
      mode === 'append' && existing
        ? `${existing}\n\n---\n\n${nextDraft}`
        : nextDraft;

    await updateSetting({ taskHintsMarkdown: merged });
    setHintDraft('');
    toast.success(
      mode === 'append' ? 'Reusable hints appended' : 'Reusable hints replaced',
    );
  };

  const checkVLM = async () => {
    const hasVLM = await checkVLMSettings();

    if (hasVLM) {
      return true;
    } else {
      setLocalOpen(true);
      return false;
    }
  };

  const renderChatList = () => {
    return (
      <ScrollArea className="h-full px-5">
        <div ref={containerRef}>
          {!chatMessages?.length && suggestions?.length > 0 && (
            <Prompts suggestions={suggestions} onSelect={handleSelect} />
          )}

          {chatMessages?.map((message, idx) => {
            if (message?.from === 'human') {
              if (message?.value === IMAGE_PLACEHOLDER) {
                // screen shot
                return (
                  <ScreenshotMessage
                    key={`message-${idx}`}
                    onClick={() => handleImageSelect(idx)}
                  />
                );
              }

              return (
                <HumanTextMessage
                  key={`message-${idx}`}
                  text={message?.value}
                />
              );
            }

            const { predictionParsed, screenshotBase64WithElementMarker } =
              message;

            // Find the finished step (VL 1.5 Model)
            const finishedStep = getFinishedContent(predictionParsed);

            return (
              <div key={idx}>
                {predictionParsed?.length ? (
                  <ThoughtChain
                    steps={predictionParsed}
                    hasSomImage={!!screenshotBase64WithElementMarker}
                    onClick={() => handleImageSelect(idx)}
                  />
                ) : null}

                {!!finishedStep && <AssistantTextMessage text={finishedStep} />}
              </div>
            );
          })}

          {thinking && <LoadingText text={'Thinking...'} />}
          {errorMsg && <ErrorMessage text={errorMsg} />}
          {(status === StatusEnum.END ||
            status === StatusEnum.ERROR ||
            status === StatusEnum.MAX_LOOP) &&
          !thinking &&
          chatMessages.length > 0 ? (
            <FeedbackButtons
              sessionId={currentSessionId || state.sessionId}
              instruction={instructions || ''}
              messages={chatMessages}
              status={status}
              backendMeta={restUserData?.backendMeta}
            />
          ) : null}
        </div>
      </ScrollArea>
    );
  };

  return (
    <div className="flex h-full w-full flex-col">
      <NavHeader title={operatorMeta.title} onBack={handleBack}>
        <Button
          variant="ghost"
          size="sm"
          className="px-3 text-muted-foreground hover:bg-white/70 hover:text-foreground"
          style={{ '-webkit-app-region': 'no-drag' }}
          onClick={openSettings}
        >
          <Settings2 />
          Settings
        </Button>
      </NavHeader>
      <div className="px-6 pb-6">
        <div className="flex h-[calc(100vh-112px)] min-h-0 flex-col overflow-hidden rounded-[20px] border border-border/80 bg-white/75 lg:grid lg:grid-cols-[420px_minmax(0,1fr)]">
          <section className="flex min-h-0 flex-col border-b border-border/80 lg:border-b-0 lg:border-r">
            <div className="flex items-start justify-between gap-4 px-5 py-5">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                  Agent log
                </p>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                  {operatorMeta.description}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <SidebarTrigger
                  variant="ghost"
                  className="bg-white/70"
                  style={{ '-webkit-app-region': 'no-drag' }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white/70"
                  onClick={handleNewChat}
                >
                  <MessageCirclePlus />
                  New Chat
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 border-t border-border/70">
              {renderChatList()}
            </div>
            {hintDraft ? (
              <div className="border-t border-border/70 bg-stone-50/80 px-4 py-4">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                      Reusable Hints Draft
                    </p>
                    <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                      Generated from the latest completed run. Edit it, then
                      append or replace the reusable hints sent with future
                      tasks.
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setHintDraft('')}
                  >
                    Dismiss
                  </Button>
                </div>
                <Textarea
                  className="min-h-[220px] bg-white"
                  value={hintDraft}
                  onChange={(event) => setHintDraft(event.target.value)}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => saveHintDraft('append')}>
                    Append To Hints
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => saveHintDraft('replace')}
                  >
                    Replace Hints
                  </Button>
                  <Button size="sm" variant="ghost" onClick={openSettings}>
                    Open Settings
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="border-t border-border/70 px-2 py-2">
              <ChatInput
                disabled={false}
                operator={state.operator}
                sessionId={state.sessionId}
                checkBeforeRun={checkVLM}
              />
            </div>
          </section>

          <section className="flex min-h-0 flex-col bg-neutral-50/60">
            <div className="flex items-end justify-between gap-4 px-6 py-5">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                  Screen view
                </p>
                <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                  Live screenshots and agent reasoning
                </p>
              </div>
            </div>
            <div className="min-h-0 flex-1 border-t border-border/70 p-4 lg:p-6">
              <div className="h-full overflow-hidden rounded-[16px] border border-border/70 bg-white/72">
                <ImageGallery
                  messages={chatMessages}
                  selectImgIndex={selectImg}
                />
              </div>
            </div>
          </section>
        </div>
      </div>
      <NavDialog
        open={isNavDialogOpen}
        onOpenChange={onCancel}
        onConfirm={onConfirm}
      />
      <LocalSettingsDialog
        isOpen={localOpen}
        onSubmit={handleLocalSettingsSubmit}
        onClose={handleLocalSettingsClose}
      />
    </div>
  );
};

export default LocalOperator;
