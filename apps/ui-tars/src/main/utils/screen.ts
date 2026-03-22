/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { screen } from 'electron';

export const getScreenSize = () => {
  const primaryDisplay = screen.getPrimaryDisplay();

  const logicalSize = primaryDisplay.size; // Logical = Physical / scaleX
  const scaleFactor = primaryDisplay.scaleFactor || 1;

  const physicalSize = {
    width: Math.round(logicalSize.width * scaleFactor),
    height: Math.round(logicalSize.height * scaleFactor),
  };

  return {
    id: primaryDisplay.id,
    physicalSize,
    logicalSize,
    scaleFactor,
  };
};
