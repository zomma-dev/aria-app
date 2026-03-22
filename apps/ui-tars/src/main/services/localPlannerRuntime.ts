import assert from 'assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { logger } from '@main/logger';
import { AppState } from '@main/store/types';
import { LocalStore } from '@main/store/validate';
import {
  Conversation,
  PredictionParsed,
  StatusEnum,
} from '@ui-tars/shared/types';

const execFileAsync = promisify(execFile);

type PlannerHistoryItem = {
  thought: string;
  step: PlannerStep;
  observation: string;
  success: boolean;
};

type StructuredState = {
  frontmostApp: string | null;
  desktopPath: string;
  downloadsPath: string;
  desktopEntries: Array<{
    name: string;
    path: string;
    kind: 'file' | 'folder';
  }>;
  finderFrontPath: string | null;
  lastHistoryItem: PlannerHistoryItem | null;
};

type VerificationCondition =
  | { kind: 'path_exists'; path: string }
  | { kind: 'frontmost_app'; app: string }
  | { kind: 'finder_front_path'; path: string };

type PlannerStep =
  | { kind: 'focus_app'; app: string }
  | { kind: 'open_path'; path: string; app?: 'Finder' | 'default' }
  | { kind: 'run_terminal_command'; command: string }
  | {
      kind: 'search_path';
      basePath: string;
      query: string;
      targetType?: 'file' | 'folder';
    }
  | { kind: 'wait_for'; condition: VerificationCondition; timeoutMs?: number }
  | { kind: 'ask_user'; question: string }
  | { kind: 'finish'; summary: string };

type PlannerResponse = {
  step: PlannerStep;
  reason: string;
  done?: boolean;
};

type StepExecutionResult = {
  success: boolean;
  observation: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const plannerBaseUrl = (baseUrl: string) =>
  `${baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '')}/v1/plan-step`;

const quoteAppleScript = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const asPrediction = (thought: string, step: PlannerStep): PredictionParsed => {
  switch (step.kind) {
    case 'focus_app':
      return {
        reflection: null,
        thought,
        action_type: 'hotkey',
        action_inputs: { key: `focus ${step.app}` },
      };
    case 'open_path':
      return {
        reflection: null,
        thought,
        action_type: 'type',
        action_inputs: { content: `open ${step.path}` },
      };
    case 'run_terminal_command':
      return {
        reflection: null,
        thought,
        action_type: 'type',
        action_inputs: { content: step.command },
      };
    case 'search_path':
      return {
        reflection: null,
        thought,
        action_type: 'type',
        action_inputs: {
          content: `search ${step.query} in ${step.basePath}`,
        },
      };
    case 'wait_for':
      return {
        reflection: null,
        thought,
        action_type: 'wait',
        action_inputs: {},
      };
    case 'ask_user':
      return {
        reflection: null,
        thought: step.question,
        action_type: 'call_user',
        action_inputs: {},
      };
    case 'finish':
      return {
        reflection: null,
        thought,
        action_type: 'finished',
        action_inputs: { content: step.summary },
      };
  }
};

const asConversationValue = (thought: string, step: PlannerStep) => {
  switch (step.kind) {
    case 'focus_app':
      return `Thought: ${thought}\nAction: focus_app(app='${step.app}')`;
    case 'open_path':
      return `Thought: ${thought}\nAction: open_path(path='${step.path}')`;
    case 'run_terminal_command':
      return `Thought: ${thought}\nAction: run_terminal_command(command='${step.command.replace(/'/g, "\\'")}')`;
    case 'search_path':
      return `Thought: ${thought}\nAction: search_path(basePath='${step.basePath}', query='${step.query.replace(/'/g, "\\'")}')`;
    case 'wait_for':
      return `Thought: ${thought}\nAction: wait_for()`;
    case 'ask_user':
      return `Thought: ${step.question}\nAction: ask_user()`;
    case 'finish':
      return `Thought: ${thought}\nAction: finished(content='${step.summary.replace(/'/g, "\\'")}')`;
  }
};

async function getFrontmostApp(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('osascript', [
      '-e',
      'tell application "System Events" to get name of first application process whose frontmost is true',
    ]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function getFinderFrontPath(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('osascript', [
      '-e',
      'tell application "Finder" to if (count of Finder windows) > 0 then POSIX path of (target of front window as alias)',
    ]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function collectDesktopEntries(basePath: string) {
  const entries = await fs.readdir(basePath, { withFileTypes: true });
  return entries.map((entry) => ({
    name: entry.name,
    path: path.join(basePath, entry.name),
    kind: (entry.isDirectory() ? 'folder' : 'file') as 'folder' | 'file',
  }));
}

async function collectStructuredState(
  history: PlannerHistoryItem[],
): Promise<StructuredState> {
  const desktopPath = path.join(os.homedir(), 'Desktop');
  const downloadsPath = path.join(os.homedir(), 'Downloads');

  return {
    frontmostApp: await getFrontmostApp(),
    desktopPath,
    downloadsPath,
    desktopEntries: await collectDesktopEntries(desktopPath).catch(() => []),
    finderFrontPath: await getFinderFrontPath(),
    lastHistoryItem: history.at(-1) ?? null,
  };
}

function extractTargetName(task: string): string | null {
  const normalized = task.toLowerCase();
  const folderMatch =
    normalized.match(/open (?:the )?(.+?) folder (?:on|in) (?:the )?desktop/) ||
    normalized.match(/open (?:the )?(.+?) on (?:the )?desktop/);
  if (folderMatch?.[1]) {
    return folderMatch[1].trim();
  }

  const fileMatch = normalized.match(
    /open (?:the )?(.+\.(?:png|jpg|jpeg|gif|webp))/,
  );
  if (fileMatch?.[1]) {
    return fileMatch[1].trim();
  }

  return null;
}

function findDesktopEntry(
  entries: StructuredState['desktopEntries'],
  targetName: string,
) {
  const normalizedTarget = targetName.toLowerCase();
  return (
    entries.find((entry) => entry.name.toLowerCase() === normalizedTarget) ||
    entries.find((entry) => entry.name.toLowerCase().includes(normalizedTarget))
  );
}

function buildDeterministicPlannerResponse(
  task: string,
  state: StructuredState,
  history: PlannerHistoryItem[],
): PlannerResponse | null {
  const targetName = extractTargetName(task);
  if (!targetName) {
    return null;
  }

  const matchedEntry = findDesktopEntry(state.desktopEntries, targetName);
  if (!matchedEntry) {
    return null;
  }

  if (history.length === 0) {
    return {
      reason:
        matchedEntry.kind === 'folder'
          ? `The requested Desktop folder already exists, so I can open it directly without screenshots or Terminal.`
          : `The requested Desktop file already exists, so I can open it directly without screenshots or Terminal.`,
      step: {
        kind: 'open_path',
        path: matchedEntry.path,
        app: matchedEntry.kind === 'folder' ? 'Finder' : 'default',
      },
    };
  }

  const last = history.at(-1);
  if (last?.step.kind === 'open_path' && last.success) {
    return {
      reason: `The target path has been opened successfully. I can finish now.`,
      step: {
        kind: 'finish',
        summary:
          matchedEntry.kind === 'folder'
            ? `Opened ${matchedEntry.name} on the Desktop.`
            : `Opened ${matchedEntry.name}.`,
      },
      done: true,
    };
  }

  return null;
}

async function callPlanner(
  settings: LocalStore,
  task: string,
  state: StructuredState,
  history: PlannerHistoryItem[],
  signal?: AbortSignal,
): Promise<PlannerResponse> {
  const response = await fetch(plannerBaseUrl(settings.vlmBaseUrl), {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.vlmApiKey}`,
    },
    body: JSON.stringify({
      task,
      session_id: `planner_${Date.now()}`,
      state: {
        frontmost_app: state.frontmostApp,
        desktop_path: state.desktopPath,
        downloads_path: state.downloadsPath,
        desktop_entries: state.desktopEntries,
        finder_front_path: state.finderFrontPath,
        last_step_result: state.lastHistoryItem,
      },
      history: history.map((item) => ({
        thought: item.thought,
        step_kind: item.step.kind,
        observation: item.observation,
        success: item.success,
      })),
      hints_markdown: settings.taskHintsMarkdown || '',
    }),
  });

  if (!response.ok) {
    throw new Error(`Planner request failed: ${response.status}`);
  }

  return (await response.json()) as PlannerResponse;
}

function plannerErrorToResponse(message: string): PlannerResponse {
  return {
    step: {
      kind: 'ask_user',
      question: message,
    },
    reason: message,
    done: false,
  };
}

async function verifyCondition(
  condition: VerificationCondition,
  timeoutMs = 1500,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    switch (condition.kind) {
      case 'path_exists':
        if (
          await fs
            .stat(condition.path)
            .then(() => true)
            .catch(() => false)
        ) {
          return true;
        }
        break;
      case 'frontmost_app':
        if ((await getFrontmostApp()) === condition.app) {
          return true;
        }
        break;
      case 'finder_front_path': {
        const current = await getFinderFrontPath();
        if (current && path.resolve(current) === path.resolve(condition.path)) {
          return true;
        }
        break;
      }
    }
    await sleep(150);
  }
  return false;
}

async function executePlannerStep(
  step: PlannerStep,
): Promise<StepExecutionResult> {
  switch (step.kind) {
    case 'focus_app': {
      await execFileAsync('open', ['-a', step.app]);
      const success = await verifyCondition(
        { kind: 'frontmost_app', app: step.app },
        1500,
      );
      return {
        success,
        observation: success
          ? `${step.app} is frontmost.`
          : `${step.app} did not become frontmost.`,
      };
    }
    case 'open_path': {
      await execFileAsync('open', [step.path]);
      const targetExists = await verifyCondition(
        { kind: 'path_exists', path: step.path },
        300,
      );
      const finderVerified =
        step.app === 'Finder'
          ? await verifyCondition(
              { kind: 'finder_front_path', path: step.path },
              2000,
            )
          : true;
      return {
        success: targetExists && finderVerified,
        observation:
          step.app === 'Finder'
            ? finderVerified
              ? `Opened ${step.path} in Finder.`
              : `The path exists, but Finder did not confirm the target window.`
            : targetExists
              ? `Opened ${step.path}.`
              : `The target path does not exist.`,
      };
    }
    case 'run_terminal_command': {
      await execFileAsync('osascript', [
        '-e',
        `tell application "Terminal" to activate`,
        '-e',
        `tell application "Terminal" to do script "${quoteAppleScript(
          step.command,
        )}" in front window`,
      ]).catch(async () => {
        await execFileAsync('osascript', [
          '-e',
          `tell application "Terminal" to activate`,
          '-e',
          `tell application "Terminal" to do script "${quoteAppleScript(
            step.command,
          )}"`,
        ]);
      });

      const success = await verifyCondition(
        { kind: 'frontmost_app', app: 'Terminal' },
        1500,
      );
      return {
        success,
        observation: success
          ? `Ran terminal command: ${step.command}`
          : `Terminal did not become frontmost after running: ${step.command}`,
      };
    }
    case 'search_path': {
      const entries = await fs
        .readdir(step.basePath, {
          withFileTypes: true,
        })
        .catch(() => []);
      const matches = entries.filter((entry) => {
        const name = entry.name.toLowerCase();
        const query = step.query.toLowerCase();
        if (step.targetType === 'folder' && !entry.isDirectory()) {
          return false;
        }
        if (step.targetType === 'file' && entry.isDirectory()) {
          return false;
        }
        return name.includes(query);
      });

      return {
        success: matches.length > 0,
        observation:
          matches.length > 0
            ? `Found matches in ${step.basePath}: ${matches
                .map((entry) => entry.name)
                .join(', ')}`
            : `No matches found in ${step.basePath} for ${step.query}.`,
      };
    }
    case 'wait_for': {
      const success = await verifyCondition(
        step.condition,
        step.timeoutMs ?? 2000,
      );
      return {
        success,
        observation: success
          ? `Condition satisfied: ${step.condition.kind}`
          : `Condition not satisfied: ${step.condition.kind}`,
      };
    }
    case 'ask_user':
      return { success: false, observation: step.question };
    case 'finish':
      return { success: true, observation: step.summary };
  }
}

function appendConversation(
  setState: (state: AppState) => void,
  getState: () => AppState,
  conversation: Conversation,
  status?: StatusEnum,
) {
  setState({
    ...getState(),
    status: status ?? getState().status,
    messages: [...(getState().messages || []), conversation],
  });
}

export async function runLocalPlannerRuntime(
  setState: (state: AppState) => void,
  getState: () => AppState,
  settings: LocalStore,
) {
  const { instructions, abortController } = getState();
  assert(instructions, 'instructions is required');

  const task = instructions.trim();
  const history: PlannerHistoryItem[] = [];
  const maxSteps = Math.min(settings.maxLoopCount || 12, 12);
  let repeatedFailureCount = 0;

  for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
    if (abortController?.signal?.aborted) {
      setState({ ...getState(), status: StatusEnum.USER_STOPPED });
      return;
    }

    const state = await collectStructuredState(history);
    const plannerResponse =
      buildDeterministicPlannerResponse(task, state, history) ||
      (await callPlanner(
        settings,
        task,
        state,
        history,
        abortController?.signal,
      ).catch((error) => {
        logger.error('[localPlannerRuntime] Planner request failed', error);
        return plannerErrorToResponse(
          error instanceof Error
            ? `Planner request failed: ${error.message}. Please narrow the task or try again.`
            : 'Planner request failed. Please narrow the task or try again.',
        );
      }));
    const prediction = asPrediction(
      plannerResponse.reason,
      plannerResponse.step,
    );
    const start = Date.now();

    appendConversation(
      setState,
      getState,
      {
        from: 'gpt',
        value: asConversationValue(
          plannerResponse.reason,
          plannerResponse.step,
        ),
        predictionParsed: [prediction],
        timing: { start, end: Date.now(), cost: Date.now() - start },
      },
      plannerResponse.step.kind === 'ask_user'
        ? StatusEnum.CALL_USER
        : plannerResponse.step.kind === 'finish'
          ? StatusEnum.END
          : StatusEnum.RUNNING,
    );

    if (plannerResponse.step.kind === 'ask_user') {
      return;
    }

    if (plannerResponse.step.kind === 'finish') {
      setState({ ...getState(), status: StatusEnum.END });
      return;
    }

    const result = await executePlannerStep(plannerResponse.step);
    history.push({
      thought: plannerResponse.reason,
      step: plannerResponse.step,
      observation: result.observation,
      success: result.success,
    });

    if (!result.success) {
      repeatedFailureCount += 1;
      logger.warn(
        '[localPlannerRuntime] Step failed',
        plannerResponse.step,
        result,
      );
      if (repeatedFailureCount >= 2) {
        const question = `I could not complete the task safely. ${result.observation}`;
        appendConversation(
          setState,
          getState,
          {
            from: 'gpt',
            value: `Thought: ${question}\nAction: ask_user()`,
            predictionParsed: [
              {
                reflection: null,
                thought: question,
                action_type: 'call_user',
                action_inputs: {},
              },
            ],
            timing: { start: Date.now(), end: Date.now(), cost: 0 },
          },
          StatusEnum.CALL_USER,
        );
        return;
      }
    } else {
      repeatedFailureCount = 0;
    }
  }

  setState({
    ...getState(),
    status: StatusEnum.ERROR,
    errorMsg: 'Planner runtime reached the local step limit.',
  });
}
