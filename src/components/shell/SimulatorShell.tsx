'use client';

import { useEffect, useRef } from 'react';
import { ControlBar } from '@/components/controls/ControlBar';
import { AnimationDirector } from '@/components/canvas/AnimationDirector';
import { CanvasViewport } from '@/components/canvas/CanvasViewport';
import { RightRail } from '@/components/panels/RightRail';
import { ChapterTimeline } from '@/components/timeline/ChapterTimeline';
import { BranchCard } from '@/components/overlays/BranchCard';
import { QuizCard } from '@/components/overlays/QuizCard';
import { ChaosMenu } from '@/components/overlays/ChaosMenu';
import { DossierModal } from '@/components/overlays/DossierModal';
import { LayerViewSwitcher } from '@/components/overlays/LayerViewSwitcher';
import { ShortcutsHelp } from '@/components/overlays/ShortcutsHelp';
import { ModeIndicator } from '@/components/overlays/ModeIndicator';
import { SearchPalette } from '@/components/controls/SearchPalette';
import type { Camera } from '@/engine/cameraEngine';
import { installKeyboard } from '@/lib/keyboard';
import { useCurrentStep } from '@/state/selectors';

export function SimulatorShell() {
  const cameraRef = useRef<Camera | null>(null);
  const step = useCurrentStep();

  useEffect(() => installKeyboard(), []);

  return (
    <div className="relative z-10 flex h-full flex-col">
      <ControlBar />

      <main className="relative flex min-h-0 flex-1 lg:flex-row">
        <section className="relative min-h-0 min-w-0 flex-1">
          <CanvasViewport cameraRef={cameraRef} />
          <ModeIndicator />
          <LayerViewSwitcher />
          <BranchCard />
          <QuizCard />
        </section>

        <RightRail />
      </main>

      <ChapterTimeline />

      {/* Overlays */}
      <SearchPalette />
      <ChaosMenu />
      <DossierModal />
      <ShortcutsHelp />

      {/* Screen-reader narration of the current step. */}
      <p aria-live="polite" className="sr-only">
        {step ? `Step ${step.title}. ${step.explain.what}` : ''}
      </p>

      <AnimationDirector cameraRef={cameraRef} />
    </div>
  );
}
