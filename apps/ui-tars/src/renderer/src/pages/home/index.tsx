/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Settings2 } from 'lucide-react';

import { Button } from '@renderer/components/ui/button';
import { SidebarTrigger } from '@renderer/components/ui/sidebar';

import { Operator } from '@main/store/types';
import { useSession } from '../../hooks/useSession';
import {
  checkVLMSettings,
  LocalSettingsDialog,
} from '@renderer/components/Settings/local';
import { sleep } from '@ui-tars/shared/utils';
import { DragArea } from '../../components/Common/drag';
import { useGlobalSettings } from '@renderer/components/Settings/global';

import computerUseImg from '@resources/home_img/computer_use.png?url';

const notes = [
  'Watches your screen and acts step-by-step.',
  'Learns from feedback to improve over time.',
  'Grounded by knowledge graphs when available.',
];

const Home = () => {
  const navigate = useNavigate();
  const { createSession } = useSession();
  const { openSettings } = useGlobalSettings();
  const [localConfig, setLocalConfig] = useState({
    open: false,
    operator: Operator.LocalComputer,
  });

  const toLocal = async (operator: Operator) => {
    const session = await createSession('New Session', {
      operator,
    });

    navigate('/local', {
      state: {
        operator,
        sessionId: session?.id,
        from: 'home',
      },
    });
  };

  const handleLocalPress = async (operator: Operator) => {
    const hasVLM = await checkVLMSettings();

    if (hasVLM) {
      toLocal(operator);
      return;
    }

    setLocalConfig({ open: true, operator });
  };

  const handleLocalSettingsSubmit = async () => {
    setLocalConfig({ open: false, operator: localConfig.operator });
    await sleep(200);
    await toLocal(localConfig.operator);
  };

  const handleLocalSettingsClose = () => {
    setLocalConfig({ open: false, operator: localConfig.operator });
  };

  return (
    <div className="flex min-h-screen w-full flex-col">
      <DragArea />
      <div className="flex flex-1 flex-col px-6 pb-8 md:px-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
              Aria
            </p>
            <p className="text-sm text-muted-foreground">Desktop operator</p>
          </div>
          <div className="flex items-center gap-2">
            <SidebarTrigger
              variant="outline"
              className="size-10 rounded-full bg-white/70"
              style={{ '-webkit-app-region': 'no-drag' }}
            />
            <Button
              variant="outline"
              size="icon"
              className="size-10 rounded-full bg-white/70"
              style={{ '-webkit-app-region': 'no-drag' }}
              onClick={openSettings}
            >
              <Settings2 />
            </Button>
          </div>
        </div>

        <section className="zomma-fade-up relative flex flex-1 flex-col justify-between overflow-hidden rounded-[28px] border border-border/70 bg-white/80 px-6 py-6 md:px-8 md:py-8 lg:min-h-[600px] lg:px-10 lg:py-10">
          <div className="zomma-hero-glow absolute inset-0" />
          <div className="relative grid flex-1 gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(360px,0.88fr)] lg:items-end">
            <div className="flex flex-col justify-between gap-10">
              <div className="max-w-xl">
                <p className="font-display text-[3.2rem] leading-[0.88] tracking-[-0.04em] text-foreground md:text-[4rem] lg:text-[5rem]">
                  Aria
                </p>
                <h1 className="mt-4 max-w-lg text-[1.4rem] font-semibold tracking-[-0.03em] text-foreground md:text-[1.7rem] lg:text-[2rem]">
                  A computer use agent that learns.
                </h1>
                <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground md:text-[0.95rem]">
                  Give it a task, watch it work, and send feedback. The agent
                  gets better each time.
                </p>
              </div>

              <div className="space-y-8">
                <div className="flex flex-wrap gap-3">
                  <Button
                    size="lg"
                    className="px-6 text-sm"
                    onClick={() => handleLocalPress(Operator.LocalComputer)}
                    style={{ '-webkit-app-region': 'no-drag' }}
                  >
                    Start local computer
                    <ArrowRight />
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="border-border/80 bg-white/60 px-6 text-sm"
                    onClick={() => handleLocalPress(Operator.LocalBrowser)}
                    style={{ '-webkit-app-region': 'no-drag' }}
                  >
                    Browser mode
                  </Button>
                </div>

                <div className="grid gap-4 border-t border-border/70 pt-6 md:grid-cols-3">
                  {notes.map((item, index) => (
                    <div key={item} className="pr-4">
                      <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                        0{index + 1}
                      </p>
                      <p className="mt-3 text-sm leading-6 text-foreground/82">
                        {item}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[20px] border border-border/70 bg-neutral-50 p-2">
              <img
                src={computerUseImg}
                alt="Aria operator preview"
                className="relative h-full min-h-[360px] w-full rounded-[16px] object-cover object-left-top"
              />
            </div>
          </div>
        </section>
      </div>

      <LocalSettingsDialog
        isOpen={localConfig.open}
        onSubmit={handleLocalSettingsSubmit}
        onClose={handleLocalSettingsClose}
      />
    </div>
  );
};

export default Home;
