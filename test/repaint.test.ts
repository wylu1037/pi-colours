import { TuiAltScreen, TuiMainScreen } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it } from "vitest";
import { installTuiCapture, requestRepaint } from "../src/repaint.ts";

describe("TUI capture", () => {
  let restore: (() => void) | undefined;

  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it("does nothing before a TUI has been seen", () => {
    expect(() => requestRepaint()).not.toThrow();
  });

  it("patches both TUI classes and restores them", () => {
    const altBefore = TuiAltScreen.prototype.requestRender;
    const mainBefore = TuiMainScreen.prototype.requestRender;
    restore = installTuiCapture();

    expect(TuiAltScreen.prototype.requestRender).not.toBe(altBefore);
    expect(TuiMainScreen.prototype.requestRender).not.toBe(mainBefore);

    restore();
    restore = undefined;
    expect(TuiAltScreen.prototype.requestRender).toBe(altBefore);
    expect(TuiMainScreen.prototype.requestRender).toBe(mainBefore);
  });

  it("remembers the TUI that requested a render", () => {
    restore = installTuiCapture();
    let renders = 0;
    // `renderRequested` keeps the real requestRender body from scheduling work.
    const fake = {
      renderRequested: true,
      requestRender() {
        renders += 1;
      },
    };

    TuiAltScreen.prototype.requestRender.call(fake);
    requestRepaint();

    expect(renders).toBe(1);
  });
});
