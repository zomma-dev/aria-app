/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState } from 'react';
import {
  MoreHorizontal,
  Trash2,
  History,
  ChevronRight,
  Laptop,
  Compass,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@renderer/components/ui/sidebar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@renderer/components/ui/collapsible';
import { SessionItem } from '@renderer/db/session';
import { ShareOptions } from './share';

import { Operator } from '@main/store/types';
import { DeleteSessionDialog } from '@renderer/components/AlertDialog/delSessionDialog';

const getIcon = (operator: Operator, isActive: boolean) => {
  const isRemote =
    operator === Operator.RemoteComputer || operator === Operator.RemoteBrowser;
  const isComputer =
    operator === Operator.LocalComputer || operator === Operator.RemoteComputer;

  const MainIcon = isComputer ? Laptop : Compass;

  return (
    <div className="relative flex items-center gap-1">
      <MainIcon className="w-4 h-4" />
      <div
        className={`absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full border bg-white text-[6px] font-bold leading-none ${isActive ? 'border-neutral-700 text-neutral-700' : 'border-neutral-400 text-neutral-400'}`}
      >
        {isRemote ? 'R' : 'L'}
      </div>
    </div>
  );
};

export function NavHistory({
  currentSessionId,
  history,
  onSessionClick,
  onSessionDelete,
}: {
  currentSessionId: string;
  history: SessionItem[];
  onSessionClick: (id: string) => void;
  onSessionDelete: (id: string) => void;
}) {
  const [isShareConfirmOpen, setIsShareConfirmOpen] = useState(false);
  const [id, setId] = useState('');
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);
  const { setOpen, state } = useSidebar();

  const handleDelete = (id: string) => {
    setIsShareConfirmOpen(true);
    setId(id);
  };

  const handleHistory = () => {
    if (state === 'collapsed') {
      setOpen(true);
      setTimeout(() => {
        setIsHistoryOpen(true);
      }, 10);
    }
  };

  return (
    <>
      <SidebarGroup className="px-4 pt-2">
        <SidebarMenu className="items-stretch">
          <Collapsible
            key={'History'}
            asChild
            open={isHistoryOpen}
            onOpenChange={setIsHistoryOpen}
            className="group/collapsible"
          >
            <SidebarMenuItem className="flex w-full flex-col items-stretch">
              <CollapsibleTrigger asChild>
                <SidebarMenuButton
                  className="h-10 rounded-full border border-transparent px-4 font-medium text-foreground hover:border-border/70 hover:bg-white/70"
                  onClick={handleHistory}
                >
                  <History strokeWidth={2} />
                  <span>History</span>
                  <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent className="w-full">
                <SidebarMenuSub className="mt-2 space-y-1 !mr-0 !border-l-0 !pr-0">
                  {history.map((item) => (
                    <SidebarMenuSubItem key={item.id} className="group/item">
                      <SidebarMenuSubButton
                        className={`cursor-pointer rounded-[20px] border px-3 py-4 transition-colors ${item.id === currentSessionId ? 'border-border/80 bg-white text-foreground hover:bg-white' : 'border-transparent bg-transparent text-muted-foreground hover:border-border/60 hover:bg-white/55 hover:text-foreground'}`}
                        onClick={() => onSessionClick(item.id)}
                      >
                        {getIcon(
                          item.meta.operator,
                          item.id === currentSessionId,
                        )}
                        <span className="max-w-38">{item.name}</span>
                      </SidebarMenuSubButton>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <SidebarMenuAction className="invisible mt-1 rounded-full bg-white/90 text-muted-foreground shadow-sm group-hover/item:visible [&[data-state=open]]:visible">
                            <MoreHorizontal />
                            <span className="sr-only">More</span>
                          </SidebarMenuAction>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          className="rounded-lg"
                          side={'right'}
                          align={'start'}
                        >
                          <ShareOptions sessionId={item.id} />
                          <DropdownMenuItem
                            className="text-red-400 focus:bg-red-50 focus:text-red-500"
                            onClick={() => handleDelete(item.id)}
                          >
                            <Trash2 className="text-red-400" />
                            <span>Delete</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuSubItem>
                  ))}
                  {!history.length && (
                    <div className="rounded-2xl border border-dashed border-border/80 px-4 py-5 text-sm text-muted-foreground">
                      No runs yet.
                    </div>
                  )}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        </SidebarMenu>
      </SidebarGroup>
      <DeleteSessionDialog
        open={isShareConfirmOpen}
        onOpenChange={setIsShareConfirmOpen}
        onConfirm={() => onSessionDelete(id)}
      />
    </>
  );
}
