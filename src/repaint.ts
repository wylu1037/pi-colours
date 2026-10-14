import { TuiAltScreen, TuiMainScreen } from "@earendil-works/pi-tui";

interface RenderRequestable {
  requestRender(force?: boolean): void;
}

type TuiGlobal = typeof globalThis & {
  [CAPTURE_KEY]?: CapturePatch;
  [ACTIVE_KEY]?: RenderRequestable;
};

interface CapturePatch {
  restore: () => void;
}

interface PatchEntry {
  prototype: Record<string, unknown>;
  wrapper: (force?: boolean) => void;
  original: (force?: boolean) => void;
}

const CAPTURE_KEY = Symbol.for("pi-colours:tui-capture");
const ACTIVE_KEY = Symbol.for("pi-colours:active-tui");

function captureSlot(): TuiGlobal {
  return globalThis as TuiGlobal;
}

/**
 * Remember the live TUI so later callbacks can ask for a repaint. Extensions get
 * no render handle of their own, so this wraps `requestRender` on both TUI
 * classes and keeps the instance that called it. Safe to call twice: a second
 * call replaces the previous patch.
 */
export function installTuiCapture(): () => void {
  const global = captureSlot();
  global[CAPTURE_KEY]?.restore();

  const entries: PatchEntry[] = [];
  for (const ctor of [TuiAltScreen, TuiMainScreen]) {
    const prototype = ctor.prototype as unknown as Record<string, unknown>;
    const original = prototype.requestRender as
      ((force?: boolean) => void) | undefined;
    if (typeof original !== "function") continue;
    const wrapper = function (this: RenderRequestable, force?: boolean): void {
      captureSlot()[ACTIVE_KEY] = this;
      original.call(this, force);
    };
    prototype.requestRender = wrapper;
    entries.push({ prototype, wrapper, original });
  }

  let patch: CapturePatch;
  const restore = (): void => {
    for (const entry of entries) {
      if (entry.prototype.requestRender === entry.wrapper)
        entry.prototype.requestRender = entry.original;
    }
    if (captureSlot()[CAPTURE_KEY] === patch) delete captureSlot()[CAPTURE_KEY];
  };
  patch = { restore };
  global[CAPTURE_KEY] = patch;
  return restore;
}

/** Ask the live TUI to repaint, if one has been seen yet. */
export function requestRepaint(): void {
  const tui = captureSlot()[ACTIVE_KEY];
  if (!tui) return;
  try {
    tui.requestRender();
  } catch {
    // A repaint is best effort; never let it break a copy.
  }
}
