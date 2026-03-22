/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Key, keyboard } from '@computer-use/nut-js';
import {
  type ScreenshotOutput,
  type ExecuteParams,
  type ExecuteOutput,
} from '@ui-tars/sdk/core';
import { NutJSOperator } from '@ui-tars/operator-nut-js';
import { clipboard } from 'electron';
import { desktopCapturer, nativeImage } from 'electron';

import * as env from '@main/env';
import { logger } from '@main/logger';
import { sleep } from '@ui-tars/shared/utils';
import { getScreenSize } from '@main/utils/screen';

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const execFileAsync = promisify(execFile);

export class NutJSElectronOperator extends NutJSOperator {
  private macCaptureBackend: 'electron' | 'native' = 'electron';

  static MANUAL = {
    ACTION_SPACES: [
      `click(start_box='[x1, y1, x2, y2]')`,
      `left_double(start_box='[x1, y1, x2, y2]')`,
      `right_single(start_box='[x1, y1, x2, y2]')`,
      `drag(start_box='[x1, y1, x2, y2]', end_box='[x3, y3, x4, y4]')`,
      `hotkey(key='')`,
      `type(content='') #If you want to submit your input, use "\\n" at the end of \`content\`.`,
      `scroll(start_box='[x1, y1, x2, y2]', direction='down or up or right or left')`,
      `wait() #Sleep for 5s and take a screenshot to check for any changes.`,
      `finished()`,
      `call_user() # Submit the task and call the user when the task is unsolvable, or when you need the user's help.`,
    ],
  };

  public async screenshot(): Promise<ScreenshotOutput> {
    try {
      const {
        logicalSize,
        scaleFactor,
        id: primaryDisplayId,
      } = getScreenSize(); // Logical = Physical / scaleX

      logger.info(
        '[screenshot] [primaryDisplay]',
        'logicalSize:',
        logicalSize,
        'scaleFactor:',
        scaleFactor,
      );

      if (env.isMacOS && this.macCaptureBackend === 'native') {
        return await this.captureWithMacScreenshot(logicalSize, scaleFactor);
      }

      const electronCapture = await this.captureWithElectronScreenshot(
        logicalSize,
        scaleFactor,
        primaryDisplayId,
      );
      if (electronCapture) {
        return electronCapture;
      }

      if (env.isMacOS) {
        this.macCaptureBackend = 'native';
        logger.warn(
          '[screenshot] Switching macOS capture backend to native for the rest of this app session',
        );
        return await this.captureWithMacScreenshot(logicalSize, scaleFactor);
      }

      throw new Error('Invalid Electron screenshot buffer');
    } catch (error) {
      logger.error('[screenshot] Electron screenshot failed', error);
      if (env.isMacOS) {
        const { logicalSize, scaleFactor } = getScreenSize();
        return await this.captureWithMacScreenshot(logicalSize, scaleFactor);
      }
      throw error;
    }
  }

  private async captureWithElectronScreenshot(
    logicalSize: { width: number; height: number },
    scaleFactor: number,
    primaryDisplayId: number,
  ): Promise<ScreenshotOutput | null> {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(logicalSize.width),
        height: Math.round(logicalSize.height),
      },
    });
    const primarySource =
      sources.find(
        (source) => source.display_id === primaryDisplayId.toString(),
      ) || sources[0];

    if (!primarySource) {
      logger.error('[screenshot] Primary display source not found', {
        primaryDisplayId,
        availableSources: sources.map((s) => s.display_id),
      });
      return null;
    }

    const pngBuffer = primarySource.thumbnail.toPNG();
    const isValidPng =
      pngBuffer.length &&
      pngBuffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);

    if (!isValidPng) {
      logger.error('[screenshot] Invalid Electron screenshot buffer', {
        byteLength: pngBuffer.length,
        primaryDisplayId,
      });
      return null;
    }

    return {
      base64: pngBuffer.toString('base64'),
      scaleFactor,
    };
  }

  private async captureWithMacScreenshot(
    logicalSize: { width: number; height: number },
    scaleFactor: number,
  ): Promise<ScreenshotOutput> {
    const tempPath = path.join(
      os.tmpdir(),
      `aria-screenshot-${Date.now()}-${Math.random().toString(36).slice(2)}.png`,
    );

    try {
      const captureStartedAt = Date.now();
      await execFileAsync('screencapture', ['-x', '-D', '1', '-r', tempPath]);
      const pngBuffer = await fs.readFile(tempPath);

      if (!pngBuffer.length) {
        throw new Error('Native macOS screencapture returned empty data');
      }

      const image = nativeImage.createFromBuffer(pngBuffer);
      const resized = image.resize({
        width: Math.round(logicalSize.width),
        height: Math.round(logicalSize.height),
      });
      const normalizedPngBuffer = resized.toPNG();

      if (
        !normalizedPngBuffer.length ||
        !normalizedPngBuffer
          .subarray(0, PNG_SIGNATURE.length)
          .equals(PNG_SIGNATURE)
      ) {
        throw new Error('Normalized macOS screenshot buffer was invalid');
      }

      logger.info('[screenshot] macOS native screencapture succeeded', {
        width: logicalSize.width,
        height: logicalSize.height,
        elapsedMs: Date.now() - captureStartedAt,
      });

      return {
        base64: normalizedPngBuffer.toString('base64'),
        scaleFactor,
      };
    } catch (error) {
      logger.error('[screenshot] macOS native screencapture failed', error);
      throw new Error(
        'Screen capture failed. Check Screen Recording permission for the app or terminal process and restart the app.',
      );
    } finally {
      await fs.unlink(tempPath).catch(() => {});
    }
  }

  async execute(params: ExecuteParams): Promise<ExecuteOutput> {
    const { action_type, action_inputs } = params.parsedPrediction;

    if (action_type === 'type' && env.isWindows && action_inputs?.content) {
      const content = action_inputs.content?.trim();

      logger.info('[device] type', content);
      const stripContent = content.replace(/\\n$/, '').replace(/\n$/, '');
      const originalClipboard = clipboard.readText();
      clipboard.writeText(stripContent);
      await keyboard.pressKey(Key.LeftControl, Key.V);
      await sleep(50);
      await keyboard.releaseKey(Key.LeftControl, Key.V);
      await sleep(50);
      clipboard.writeText(originalClipboard);
    } else {
      return await super.execute(params);
    }
  }
}
