/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Settings } from 'lucide-react';

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
} from '@renderer/components/ui/sidebar';

interface NavSettingsProps {
  onClick: () => void;
}

export function NavSettings({ onClick }: NavSettingsProps) {
  return (
    <SidebarGroup className="px-0">
      <SidebarMenu className="items-stretch">
        <SidebarMenuButton
          className="h-10 rounded-full border border-transparent px-4 font-medium text-foreground hover:border-border/70 hover:bg-white/70"
          onClick={onClick}
        >
          <Settings />
          <span>Settings</span>
        </SidebarMenuButton>
      </SidebarMenu>
    </SidebarGroup>
  );
}
