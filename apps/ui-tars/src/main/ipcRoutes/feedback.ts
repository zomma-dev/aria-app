/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { initIpc } from '@ui-tars/electron-ipc/main';
import { SettingStore } from '@main/store/setting';
import { ForceWorkflowMode } from '@main/store/types';
import type { BackendWorkflowMeta } from '@ui-tars/shared/types';

const t = initIpc.create();

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const getFeedbackEndpoint = (baseUrl: string) => {
  const trimmedBaseUrl = trimTrailingSlash(baseUrl);
  if (!trimmedBaseUrl) {
    throw new Error('VLM base URL is not configured');
  }

  return `${trimmedBaseUrl}/feedback`;
};

type FeedbackActionTraceItem = {
  step: number;
  action_type: string;
  thought: string;
  action_inputs: Record<string, unknown>;
  reflection: string | null;
};

export const feedbackRoute = t.router({
  submitWorkflowFeedback: t.procedure
    .input<{
      sessionId: string;
      instruction: string;
      feedback: 'positive' | 'negative';
      status: string;
      actionTrace: FeedbackActionTraceItem[];
      totalSteps: number;
      backendMeta?: BackendWorkflowMeta;
    }>()
    .handle(async ({ input }) => {
      const settings = SettingStore.getStore();
      const endpoint = getFeedbackEndpoint(settings.vlmBaseUrl);
      const forceWorkflowMode =
        settings.forceWorkflowMode ?? ForceWorkflowMode.auto;

      const payload = {
        session_id: input.sessionId,
        run_id: input.backendMeta?.runId ?? null,
        instruction: input.instruction,
        feedback: input.feedback,
        timestamp: new Date().toISOString(),
        action_trace: input.actionTrace,
        total_steps: input.totalSteps,
        status: input.status,
        mode:
          forceWorkflowMode === ForceWorkflowMode.auto
            ? (input.backendMeta?.effectiveMode ?? 'auto')
            : forceWorkflowMode,
        workflow_status: input.backendMeta?.workflowStatus ?? null,
        retrieval_confidence: input.backendMeta?.retrievalConfidence ?? null,
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(settings.vlmApiKey
            ? { Authorization: `Bearer ${settings.vlmApiKey}` }
            : {}),
          ...(forceWorkflowMode !== ForceWorkflowMode.auto
            ? { 'X-Force-Workflow-Mode': forceWorkflowMode }
            : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(
          `Feedback request failed (${response.status}): ${responseText || response.statusText}`,
        );
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return response.json();
      }

      return {
        ok: true,
        text: await response.text(),
      };
    }),
});
