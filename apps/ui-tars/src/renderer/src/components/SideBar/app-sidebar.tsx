/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useCallback, useState, type ComponentProps } from 'react';
import { useNavigate } from 'react-router';
import { Compass, Home } from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarTrigger,
} from '@renderer/components/ui/sidebar';
import { DragArea } from '@renderer/components/Common/drag';
import { useSession } from '@renderer//hooks/useSession';

import { NavHistory } from './nav-history';
import { NavSettings } from './nav-footer';

import { Operator } from '@main/store/types';
import { useGlobalSettings, GlobalSettings } from '../Settings/global';
import { useStore } from '../../hooks/useStore';
import { StatusEnum } from '@ui-tars/sdk';
import { NavDialog } from '../AlertDialog/navDialog';
import { api } from '../../api';

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  const {
    currentSessionId,
    sessions,
    getSession,
    deleteSession,
    setActiveSession,
  } = useSession();
  const navigate = useNavigate();
  const { openSettings } = useGlobalSettings();
  const { status } = useStore();
  const [isNavDialogOpen, setNavDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    'home' | { type: 'session'; id: string } | null
  >(null);

  const needsConfirm =
    status === StatusEnum.RUNNING ||
    status === StatusEnum.CALL_USER ||
    status === StatusEnum.PAUSE;

  const goHome = useCallback(async () => {
    await navigate('/');
    await setActiveSession('');
  }, [navigate, setActiveSession]);

  const onSessionClick = useCallback(
    async (sessionId: string) => {
      const session = await getSession(sessionId);
      if (!session) return;

      const operator = session.meta.operator || Operator.LocalComputer;
      const isFree = session.meta.isFree ?? true;

      const getRouter = () => {
        if (
          operator === Operator.RemoteBrowser ||
          operator === Operator.RemoteComputer
        ) {
          if (isFree) {
            return '/free-remote';
          }
          return '/paid-remote';
        }

        return '/local';
      };

      navigate(getRouter(), {
        state: {
          operator,
          sessionId,
          isFree,
          from: 'history',
        },
      });
    },
    [getSession, navigate],
  );

  const handleHomeClick = useCallback(() => {
    if (needsConfirm) {
      setPendingAction('home');
      setNavDialogOpen(true);
    } else {
      goHome();
    }
  }, [needsConfirm]);

  const handleSessionClick = useCallback(
    (sessionId: string) => {
      if (needsConfirm) {
        setPendingAction({ type: 'session', id: sessionId });
        setNavDialogOpen(true);
      } else {
        onSessionClick(sessionId);
      }
    },
    [needsConfirm],
  );

  const onConfirm = useCallback(async () => {
    await api.stopRun();
    await api.clearHistory();

    if (pendingAction === 'home') {
      await goHome();
    } else if (pendingAction?.type === 'session') {
      await onSessionClick(pendingAction.id);
    }
    setPendingAction(null);
    setNavDialogOpen(false);
  }, [pendingAction, goHome, onSessionClick]);

  const onCancel = useCallback(() => {
    setPendingAction(null);
    setNavDialogOpen(false);
  }, []);

  const onSessionDelete = useCallback(
    async (sessionId: string) => {
      await deleteSession(sessionId);
      if (currentSessionId === sessionId) {
        goHome();
      }
    },
    [currentSessionId, deleteSession, goHome],
  );

  return (
    <>
      <Sidebar
        variant="floating"
        collapsible="offcanvas"
        className="select-none border-none"
        {...props}
      >
        <DragArea></DragArea>
        <SidebarHeader className="gap-4 px-5 pb-2 pt-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-display text-[1.8rem] leading-none tracking-[-0.04em]">
                Aria
              </p>
              <p className="mt-2 max-w-[15rem] text-sm leading-6 text-muted-foreground">
                History and settings.
              </p>
            </div>
            <SidebarTrigger
              variant="ghost"
              className="bg-white/70 text-muted-foreground hover:bg-white"
              style={{ '-webkit-app-region': 'no-drag' }}
            />
          </div>
          <SidebarMenu className="items-stretch">
            <SidebarMenuButton
              className="h-10 rounded-full border border-transparent px-4 font-medium text-foreground hover:border-border/70 hover:bg-white/70"
              onClick={handleHomeClick}
            >
              <Home />
              Workspace
            </SidebarMenuButton>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <NavHistory
            currentSessionId={currentSessionId}
            history={sessions}
            onSessionClick={handleSessionClick}
            onSessionDelete={onSessionDelete}
          />
        </SidebarContent>
        <SidebarFooter className="px-4 pb-4 pt-0">
          <NavSettings onClick={openSettings} />
          <div className="px-1 pt-1 text-xs uppercase tracking-[0.24em] text-muted-foreground/80">
            <div className="flex items-center gap-2">
              <Compass className="size-3.5" />
              Aria
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <GlobalSettings />
      <NavDialog
        open={isNavDialogOpen}
        onOpenChange={onCancel}
        onConfirm={onConfirm}
      />
    </>
  );
}
