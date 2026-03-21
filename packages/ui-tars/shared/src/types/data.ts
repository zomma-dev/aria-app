/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { VlmModeEnum } from '../constants';
import { Message, PredictionParsed, GUIAgentError, StatusEnum } from './index';
import { ShareVersion } from './share';

export type WorkflowStatus =
  | 'new_workflow'
  | 'seen_workflow'
  | 'seen_but_low_confidence';

export interface BackendWorkflowMeta {
  workflowStatus?: WorkflowStatus;
  needsFeedback?: boolean;
  retrievalConfidence?: number;
  runId?: string;
  effectiveMode?: 'auto' | 'baseline' | 'grounded';
}

export interface Conversation extends Message {
  timing?: {
    start: number;
    end: number;
    cost: number;
  };
  /** exists when <image> exists */
  screenshotBase64?: string;
  screenshotContext?: {
    size: {
      /** physical device width */
      width: number;
      /** physical device height */
      height: number;
    };
    mime?: string;
    /** screenshot scale factor(DPR) */
    scaleFactor?: number;
  };
  predictionParsed?: PredictionParsed[];
}

/**
 * @deprecated use {@link GUIAgentData} instead
 * Computer Use data structure, can be used for recording and sharing
 */
export interface ComputerUseUserData extends GUIAgentData {
  modelDetail: {
    name: string;
    provider: string;
    baseUrl: string;
    maxLoop: number;
  };
}

export interface GUIAgentData {
  version: ShareVersion;
  /** Share operation instructions */
  instruction: string;
  systemPrompt: string;
  modelName: string;
  mode?: VlmModeEnum;
  backendMeta?: BackendWorkflowMeta;
  logTime: number;
  status: StatusEnum;
  errMsg?: string;
  error?: GUIAgentError;
  conversations: Conversation[];
}
