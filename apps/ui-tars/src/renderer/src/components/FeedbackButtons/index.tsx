import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, ThumbsDown, ThumbsUp } from 'lucide-react';

import type {
  BackendWorkflowMeta,
  Conversation,
  StatusEnum,
} from '@ui-tars/shared/types';
import { Button } from '@renderer/components/ui/button';
import { Badge } from '@renderer/components/ui/badge';
import { toast } from 'sonner';
import { api } from '@renderer/api';

type Feedback = 'positive' | 'negative';

interface FeedbackButtonsProps {
  sessionId: string;
  instruction: string;
  messages: Conversation[];
  status: StatusEnum;
  backendMeta?: BackendWorkflowMeta;
}

type FeedbackActionTraceItem = {
  step: number;
  action_type: string;
  thought: string;
  action_inputs: Record<string, unknown>;
  reflection: string | null;
};

const buildActionTrace = (
  messages: Conversation[],
): FeedbackActionTraceItem[] => {
  const actionTrace: FeedbackActionTraceItem[] = [];
  let step = 1;

  for (const message of messages) {
    if (message.from !== 'gpt' || !message.predictionParsed?.length) {
      continue;
    }

    for (const parsedPrediction of message.predictionParsed) {
      actionTrace.push({
        step,
        action_type: parsedPrediction.action_type,
        thought: parsedPrediction.thought,
        action_inputs: parsedPrediction.action_inputs || {},
        reflection: parsedPrediction.reflection,
      });
      step += 1;
    }
  }

  return actionTrace;
};

const getInstructionFromMessages = (messages: Conversation[]) => {
  const humanMessage = messages.find(
    (message) => message.from === 'human' && message.value.trim() !== '<image>',
  );

  return humanMessage?.value?.trim() || '';
};

const getWorkflowLabel = (backendMeta?: BackendWorkflowMeta) => {
  switch (backendMeta?.workflowStatus) {
    case 'new_workflow':
      return {
        badge: 'New',
        description: 'First time seeing this task. Was the run correct?',
      };
    case 'seen_but_low_confidence':
      return {
        badge: 'Low Confidence',
        description:
          'Similar task found but confidence is low. Your feedback helps.',
      };
    case 'seen_workflow':
      return {
        badge: 'Known',
        description: 'This task has been seen before. Feedback still helps.',
      };
    default:
      return {
        badge: null,
        description: 'Was this run correct?',
      };
  }
};

export function FeedbackButtons({
  sessionId,
  instruction,
  messages,
  status,
  backendMeta,
}: FeedbackButtonsProps) {
  const [submitted, setSubmitted] = useState<Feedback | null>(null);
  const [submitting, setSubmitting] = useState<Feedback | null>(null);

  useEffect(() => {
    setSubmitted(null);
    setSubmitting(null);
  }, [sessionId]);

  const submitFeedback = async (feedback: Feedback) => {
    const effectiveInstruction =
      instruction.trim() || getInstructionFromMessages(messages);
    const effectiveSessionId =
      sessionId.trim() || backendMeta?.runId || `local-session-${Date.now()}`;

    if (!effectiveInstruction) {
      toast.error('Missing instruction for feedback submission');
      return;
    }

    const actionTrace = buildActionTrace(messages);
    setSubmitting(feedback);

    try {
      await api.submitWorkflowFeedback({
        sessionId: effectiveSessionId,
        instruction: effectiveInstruction,
        feedback,
        status,
        actionTrace,
        totalSteps: actionTrace.length,
        backendMeta,
      });
      setSubmitted(feedback);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown feedback error';
      toast.error('Failed to send feedback', {
        description: message,
      });
    } finally {
      setSubmitting(null);
    }
  };

  const workflowLabel = getWorkflowLabel(backendMeta);
  const highlightPrompt =
    backendMeta?.needsFeedback ||
    backendMeta?.workflowStatus === 'new_workflow' ||
    backendMeta?.workflowStatus === 'seen_but_low_confidence';

  if (submitted) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <span>Feedback sent.</span>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/20 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {workflowLabel.badge ? (
          <Badge variant={highlightPrompt ? 'default' : 'secondary'}>
            {workflowLabel.badge}
          </Badge>
        ) : null}
        {backendMeta?.needsFeedback ? (
          <Badge variant="outline">Feedback Requested</Badge>
        ) : null}
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        {workflowLabel.description}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => submitFeedback('positive')}
          disabled={submitting !== null}
        >
          {submitting === 'positive' ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <ThumbsUp className="mr-1 h-4 w-4" />
          )}
          Correct
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => submitFeedback('negative')}
          disabled={submitting !== null}
        >
          {submitting === 'negative' ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <ThumbsDown className="mr-1 h-4 w-4" />
          )}
          Incorrect
        </Button>
      </div>
    </div>
  );
}
