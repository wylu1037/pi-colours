import { visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

/** Inclusive column range of the clickable "[Copy]" label on a frame's top border. */
export interface CodeFrameCopyLabel {
  /** Row of the top border inside the frame lines. */
  row: number;
  /** Inclusive first column of the "[Copy]" label. */
  startX: number;
  /** Inclusive last column of the "[Copy]" label. */
  endX: number;
}

export interface CodeFrame {
  /** Styled frame lines. Every line is exactly `width` visible columns wide. */
  lines: string[];
  /** ANSI-free top border text, used to locate the frame in rendered output. */
  borderText: string;
  /** Click target for the "[Copy]" label when the frame is wide enough to show it. */
  copy?: CodeFrameCopyLabel | undefined;
}

export interface CodeFrameOptions {
  /** Render the chip as "[Copied]" to confirm a successful copy. */
  copied?: boolean;
}

const COPY_LABEL = "[Copy]";
const COPIED_LABEL = "[Copied]";
const TOP_PREFIX = "╭─ ";
const TOP_SUFFIX = "─╮";
const BOTTOM_SUFFIX = "╯";
const SIDE = "│";

const ANSI_PATTERN = /\x1B(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

/**
 * Build a rounded code frame with the language label on the left and a clickable
 * "[Copy]" label on the right of the top border:
 *
 *   ╭─ bash ────────────────────────────── [Copy] ─╮
 *   │ openssl version -a                           │
 *   ╰──────────────────────────────────────────────╯
 *
 * `contentLines` may already carry ANSI styles; long lines are wrapped to the
 * inner width so every returned line stays exactly `width` visible columns wide.
 * Returns undefined when the width cannot fit a frame, so callers can fall back
 * to plain rendering.
 */
export function buildCodeFrame(
  label: string,
  contentLines: readonly string[],
  width: number,
  border: (text: string) => string = (text) => text,
  options: CodeFrameOptions = {},
): CodeFrame | undefined {
  const chip = options.copied ? COPIED_LABEL : COPY_LABEL;
  const prefix = `${TOP_PREFIX}${label} `;
  const prefixWidth = visibleWidth(prefix);
  const chipWidth = chip.length + 2; // " [Copy] "
  const withLabel = width - prefixWidth - chipWidth - 2 >= 1;
  const withoutLabel = width - prefixWidth - 2 >= 1;
  if (!withLabel && !withoutLabel) return undefined;

  const fillWidth = withLabel
    ? width - prefixWidth - chipWidth - 2
    : width - prefixWidth - 2;
  const top = withLabel
    ? `${prefix}${"─".repeat(fillWidth)} ${chip} ${TOP_SUFFIX}`
    : `${prefix}${"─".repeat(fillWidth)}${TOP_SUFFIX}`;

  let copy: CodeFrameCopyLabel | undefined;
  if (withLabel) {
    const index = top.indexOf(chip);
    const startX = visibleWidth(top.slice(0, index));
    copy = { row: 0, startX, endX: startX + chip.length - 1 };
  }

  const innerWidth = width - 4;
  const lines = [border(top)];
  for (const contentLine of contentLines) {
    for (const chunk of wrapTextWithAnsi(
      contentLine,
      Math.max(1, innerWidth),
    )) {
      const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(chunk)));
      lines.push(
        `${border(`${SIDE} `)}${chunk}${padding}${border(` ${SIDE}`)}`,
      );
    }
  }
  lines.push(border(`╰${"─".repeat(width - 2)}${BOTTOM_SUFFIX}`));
  return { lines, borderText: top, copy };
}
