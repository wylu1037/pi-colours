import {
  Markdown,
  visibleWidth,
  type MarkdownTheme,
  type TuiMouseEvent,
  type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearLatestCopyTarget, getLatestCopyTarget } from "../src/copy.ts";
import {
  installMarkdownPatch,
  type MarkdownPatch,
} from "../src/markdown-patch.ts";

const theme: MarkdownTheme = {
  heading: (text) => text,
  link: (text) => text,
  linkUrl: (text) => text,
  code: (text) => text,
  codeBlock: (text) => text,
  codeBlockBorder: (text) => text,
  quote: (text) => text,
  quoteBorder: (text) => text,
  hr: (text) => text,
  listBullet: (text) => text,
  bold: (text) => text,
  italic: (text) => text,
  strikethrough: (text) => text,
  underline: (text) => text,
  highlightCode: (code, language) =>
    code
      .split("\n")
      .map(
        (line) => `<${language ?? "plain"}>${line}</${language ?? "plain"}>`,
      ),
};

interface MouseAware {
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined;
}

let patch: MarkdownPatch | undefined;

afterEach(() => {
  patch?.restore();
  patch = undefined;
  clearLatestCopyTarget();
});

function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function mouseEvent(init: {
  x: number;
  y: number;
  type?: TuiMouseEvent["type"];
  button?: TuiMouseEvent["button"];
  width?: number;
}): TuiMouseEvent {
  return {
    type: init.type ?? "click",
    button: init.button ?? "left",
    x: init.x,
    y: init.y,
    screenX: init.x,
    screenY: init.y,
    width: init.width ?? 100,
    height: 40,
    shift: false,
    alt: false,
    ctrl: false,
  };
}

function createMarkdown(markdown: string): Markdown & MouseAware {
  return new Markdown(markdown, 0, 0, theme) as Markdown & MouseAware;
}

function copyColumns(
  line: string,
): { startX: number; endX: number } | undefined {
  const stripped = stripAnsi(line);
  const index = stripped.indexOf("[Copy]");
  if (index < 0) return undefined;
  const startX = visibleWidth(stripped.slice(0, index));
  return { startX, endX: startX + "[Copy]".length - 1 };
}

function copyRows(lines: string[]): number[] {
  const rows: number[] = [];
  lines.forEach((line, row) => {
    if (copyColumns(line)) rows.push(row);
  });
  return rows;
}

function render(markdown: string, width = 100): string {
  return createMarkdown(markdown)
    .render(width)
    .map((line) => line.trimEnd())
    .join("\n");
}

describe("Markdown patch", () => {
  it("renders compact heading markers", () => {
    patch = installMarkdownPatch();
    expect(patch.installed).toBe(true);

    const output = render("# Main heading\n\n## Subheading");
    expect(output).toContain("▌ Main heading");
    expect(output).toContain("▸ Subheading");
    expect(output).not.toContain("# Main heading");
  });

  it("wraps code blocks in a frame with a language label and copy chip", () => {
    patch = installMarkdownPatch();
    const output = render("```ts\nconst answer: number = 42;\n```");

    expect(output).toContain("╭─ typescript");
    expect(output).toContain("[Copy]");
    expect(output).toContain(
      "│ <typescript>const answer: number = 42;</typescript>",
    );
    expect(output).toContain("╰");
    expect(output).not.toContain("```");
  });

  it("detects the language of an unlabeled block", () => {
    patch = installMarkdownPatch();
    const output = render(
      "```\ndef greet(name: str) -> str:\n    return f'Hello, {name}'\n```",
    );

    expect(output).toContain("╭─ python");
    expect(output).toContain("<python>def greet(name: str) -> str:</python>");
  });

  it("drops the copy chip on narrow frames", () => {
    patch = installMarkdownPatch();
    const output = render("```bash\necho hi\n```", 18);

    expect(output).toContain("╭─ bash");
    expect(output).not.toContain("[Copy]");
  });

  it("falls back to the plain frame when there is no room", () => {
    patch = installMarkdownPatch();
    const output = render("```bash\necho hi\n```", 10);

    expect(output).toContain("┌─ bash");
    expect(output).toContain("└─");
  });

  it("copies the clicked block through the [Copy] chip", () => {
    const onCopy = vi.fn();
    patch = installMarkdownPatch({ onCopy });
    const md = createMarkdown(
      "```ts\nconst first = 1;\n```\n\n```python\nprint('second')\n```",
    );
    const lines = md.render(100);
    const rows = copyRows(lines);
    expect(rows).toHaveLength(2);

    const secondRow = rows[1]!;
    const columns = copyColumns(lines[secondRow]!)!;
    const x = columns.startX + 2;

    expect(
      md.handleMouse(mouseEvent({ type: "press", x, y: secondRow })),
    ).toEqual({ handled: true });
    expect(onCopy).not.toHaveBeenCalled();

    expect(
      md.handleMouse(mouseEvent({ type: "click", x, y: secondRow })),
    ).toEqual({ handled: true });
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onCopy).toHaveBeenCalledWith("print('second')", "python");
  });

  it("keeps [Copy] targets alive across cached renders", () => {
    const onCopy = vi.fn();
    patch = installMarkdownPatch({ onCopy });
    const md = createMarkdown("```ts\nconst answer = 42;\n```");
    const lines = md.render(100);
    md.render(100);

    const row = copyRows(lines)[0]!;
    const columns = copyColumns(lines[row]!)!;
    md.handleMouse(mouseEvent({ x: columns.startX + 1, y: row }));

    expect(onCopy).toHaveBeenCalledWith("const answer = 42;", "typescript");
  });

  it("ignores clicks outside the [Copy] chip", () => {
    const onCopy = vi.fn();
    patch = installMarkdownPatch({ onCopy });
    const md = createMarkdown("```ts\nconst answer = 42;\n```");
    const lines = md.render(100);
    const row = copyRows(lines)[0]!;
    const columns = copyColumns(lines[row]!)!;

    expect(
      md.handleMouse(mouseEvent({ x: columns.startX - 3, y: row })),
    ).toBeUndefined();
    expect(
      md.handleMouse(mouseEvent({ x: columns.startX, y: row + 1 })),
    ).toBeUndefined();
    expect(
      md.handleMouse(
        mouseEvent({ button: "right", x: columns.startX + 2, y: row }),
      ),
    ).toBeUndefined();
    expect(
      md.handleMouse(
        mouseEvent({ type: "release", x: columns.startX + 2, y: row }),
      ),
    ).toBeUndefined();
    expect(onCopy).not.toHaveBeenCalled();
  });

  it("confirms the copy on the clicked frame and restores [Copy] later", async () => {
    vi.useFakeTimers();
    try {
      const onCopy = vi.fn().mockResolvedValue(undefined);
      patch = installMarkdownPatch({ onCopy });
      const md = createMarkdown("```ts\nconst answer = 42;\n```");
      const lines = md.render(100);
      const row = copyRows(lines)[0]!;
      const columns = copyColumns(lines[row]!)!;
      const x = columns.startX + 2;

      md.handleMouse(mouseEvent({ type: "press", x, y: row }));
      md.handleMouse(mouseEvent({ x, y: row }));
      await Promise.resolve();
      await Promise.resolve();

      const copied = md.render(100).map(stripAnsi);
      expect(copied.some((line) => line.includes("[Copied]"))).toBe(true);

      vi.advanceTimersByTime(2000);
      const stillCopied = md.render(100).map(stripAnsi);
      expect(stillCopied.some((line) => line.includes("[Copied]"))).toBe(true);

      vi.advanceTimersByTime(1500);
      const restored = md.render(100).map(stripAnsi);
      expect(restored.some((line) => line.includes("[Copied]"))).toBe(false);
      expect(copyRows(restored)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("tracks the latest block in the copy registry", () => {
    patch = installMarkdownPatch();
    const md = createMarkdown(
      "```bash\necho one\n```\n\n```python\nprint(2)\n```",
    );
    md.render(100);

    expect(getLatestCopyTarget()).toEqual({
      code: "print(2)",
      label: "python",
    });
  });

  it("restores the original renderer", () => {
    patch = installMarkdownPatch();
    patch.restore();

    const output = render("```ts\nconst answer = 42;\n```");
    expect(output).toContain("```ts");
    expect(
      (Markdown.prototype as { handleMouse?: unknown }).handleMouse,
    ).toBeUndefined();
  });
});
