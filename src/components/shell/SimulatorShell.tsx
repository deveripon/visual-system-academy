'use client';

import { useEffect, useRef } from 'react';
import { ControlBar } from '@/components/controls/ControlBar';
import { CanvasViewport } from '@/components/canvas/CanvasViewport';
import { AnimationDirector } from '@/components/canvas/AnimationDirector';
import { FlowCanvas } from '@/components/flow/FlowCanvas';
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
import { useSimStore } from '@/state/store';

/**
 * The original shell — control bar, canvas, right rail, chapter dock — with the canvas
 * area switchable between two ways of seeing the same journey:
 *
 *   map    the architecture canvas, packet flying between components
 *   story  the storyboard: every step so far as a node with its explanation beneath it
 *
 * Both read the same timeline and the same store, so switching never loses your place.
 */
export function SimulatorShell() {
  const cameraRef = useRef<Camera | null>(null);
  const step = useCurrentStep();
  const view = useSimStore((s) => s.view);

  useEffect(() => installKeyboard(), []);

  // Picking a layer view frames those zones; 'free' hands control back to step-following.
  useEffect(() => {
    let last = useSimStore.getState().layerView;
    return useSimStore.subscribe((s) => {
      if (s.layerView === last) return;
      last = s.layerView;
      if (s.layerView !== 'free') cameraRef.current?.applyLayerView(s.layerView);
    });
  }, []);

  const isMap = view === 'map';

  return (
    <div className="relative z-10 flex h-full flex-col">
      <ControlBar />

      <main className="relative flex min-h-0 flex-1 lg:flex-row">
        <section className="relative min-h-0 min-w-0 flex-1">
          {isMap ? (
            <>
              <CanvasViewport cameraRef={cameraRef} />
              <ModeIndicator />
              <LayerViewSwitcher />
            </>
          ) : (
            <FlowCanvas />
          )}
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

      {/* The GSAP director only drives the map; it is inert while story mode is up. */}
      {isMap && <AnimationDirector cameraRef={cameraRef} />}
    </div>
  );
}
