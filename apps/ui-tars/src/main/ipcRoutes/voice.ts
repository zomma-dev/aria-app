import { initIpc } from '@ui-tars/electron-ipc/main';

import { transcribePromptAudio } from '@main/services/voice';

const t = initIpc.create();

export const voiceRoute = t.router({
  transcribePrompt: t.procedure
    .input<{
      audioBase64: string;
      mimeType: string;
      fileName?: string;
    }>()
    .handle(async ({ input }) => {
      return await transcribePromptAudio(input);
    }),
});
