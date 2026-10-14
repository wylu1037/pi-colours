import { afterEach, describe, expect, it } from "vitest";
import {
  clearLatestCopyTarget,
  copyDescription,
  getLatestCopyTarget,
  setLatestCopyTarget,
} from "../src/copy.ts";

afterEach(() => {
  clearLatestCopyTarget();
});

describe("latest copy target registry", () => {
  it("returns undefined before any block renders", () => {
    expect(getLatestCopyTarget()).toBeUndefined();
  });

  it("stores the most recent target and clears it", () => {
    setLatestCopyTarget({ code: "echo hi", label: "bash" });
    expect(getLatestCopyTarget()).toEqual({ code: "echo hi", label: "bash" });

    setLatestCopyTarget({ code: "print(1)", label: "python" });
    expect(getLatestCopyTarget()?.label).toBe("python");

    clearLatestCopyTarget();
    expect(getLatestCopyTarget()).toBeUndefined();
  });
});

describe("copyDescription", () => {
  it("describes single-line and multi-line blocks", () => {
    expect(copyDescription("bash", "echo hi")).toBe("bash code block (1 line)");
    expect(copyDescription("python", "a\nb\nc")).toBe(
      "python code block (3 lines)",
    );
  });

  it("falls back to a generic name for unlabeled blocks", () => {
    expect(copyDescription("code", "x")).toBe("code block (1 line)");
  });
});
