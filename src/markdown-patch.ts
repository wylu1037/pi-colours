import {
	Markdown,
	visibleWidth,
	type MarkdownTheme,
	type TuiMouseEvent,
	type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import { buildCodeFrame, stripAnsi } from "./code-frame.ts";
import { setLatestCopyTarget } from "./copy.ts";
import { resolveLanguage } from "./languages.ts";
import { requestRepaint } from "./repaint.ts";

interface InlineStyleContext {
	applyText: (text: string) => string;
	stylePrefix: string;
}

interface MarkdownToken {
	type: string;
	depth?: number;
	lang?: string;
	text?: string;
	tokens?: unknown[];
}

interface RenderedCodeBlock {
	/** Position of the block inside its Markdown document. */
	index: number;
	borderText: string;
	copy?: { startX: number; endX: number } | undefined;
	code: string;
	label: string;
}

interface CopyTarget {
	index: number;
	row: number;
	startX: number;
	endX: number;
	code: string;
	label: string;
}

interface CopyState {
	recording: RenderedCodeBlock[];
	targets: CopyTarget[];
	lastText: string | undefined;
	lastWidth: number | undefined;
	/** Signature of the render pass the current targets were located in. */
	signature: string | undefined;
	/** Block that was copied most recently, and until when it shows "[Copied]". */
	copiedIndex: number | undefined;
	copiedUntil: number | undefined;
	copyTimer: ReturnType<typeof setTimeout> | undefined;
	/** Code block counter for the render pass in progress. */
	blockIndex: number;
}

const COPY_STATE: unique symbol = Symbol("pi-colours:copy-state");

interface MarkdownInternals {
	theme: MarkdownTheme;
	text: string;
	getStylePrefix?: (style: (text: string) => string) => string;
	invalidate?: () => void;
	renderInlineTokens: (
		tokens: unknown[],
		styleContext?: InlineStyleContext,
	) => string;
	render: (width: number) => string[];
	renderToken: RenderToken;
	handleMouse?:
		((event: TuiMouseEvent) => TuiMouseEventResult | undefined) | undefined;
	[COPY_STATE]?: CopyState;
}

type RenderToken = (
	this: MarkdownInternals,
	token: MarkdownToken,
	width: number,
	nextTokenType?: string,
	styleContext?: InlineStyleContext,
) => string[];

interface PatchState {
	prototype: MarkdownInternals;
	patchedRenderToken: RenderToken;
	originalRenderToken: RenderToken;
	patchedRender: (width: number) => string[];
	originalRender: (width: number) => string[];
	patchedHandleMouse: (event: TuiMouseEvent) => TuiMouseEventResult | undefined;
	originalHandleMouse: MarkdownInternals["handleMouse"];
	hadHandleMouse: boolean;
	restore: () => void;
}

export interface MarkdownPatch {
	installed: boolean;
	reason?: string;
	restore: () => void;
}

export interface MarkdownPatchOptions {
	/** Called when the user activates the "[Copy]" label on a code frame. */
	onCopy?: (code: string, label: string) => void | Promise<void>;
}

const PATCH_KEY = Symbol.for("pi-colours:markdown-patch");

/** How long the chip shows "[Copied]" after a successful copy. */
const COPY_FEEDBACK_MS = 3000;

function globalPatchState(): PatchState | undefined {
	return (globalThis as typeof globalThis & { [PATCH_KEY]?: PatchState })[
		PATCH_KEY
	];
}

function setGlobalPatchState(state: PatchState | undefined): void {
	const target = globalThis as typeof globalThis & { [PATCH_KEY]?: PatchState };
	if (state) target[PATCH_KEY] = state;
	else delete target[PATCH_KEY];
}

function stylePrefix(style: (text: string) => string): string {
	const sentinel = "\0";
	const styled = style(sentinel);
	const index = styled.indexOf(sentinel);
	return index >= 0 ? styled.slice(0, index) : "";
}

function spacingAfter(nextTokenType: string | undefined): string[] {
	return nextTokenType && nextTokenType !== "space" ? [""] : [];
}

function renderCompactHeading(
	component: MarkdownInternals,
	token: MarkdownToken,
	nextTokenType: string | undefined,
): string[] {
	const depth = Math.max(1, token.depth ?? 1);
	const marker =
		depth === 1 ? "▌ " : depth === 2 ? "▸ " : depth === 3 ? "• " : "· ";
	const headingStyle = (text: string) =>
		component.theme.heading(component.theme.bold(text));
	const headingStyleContext: InlineStyleContext = {
		applyText: headingStyle,
		stylePrefix:
			component.getStylePrefix?.(headingStyle) ?? stylePrefix(headingStyle),
	};
	const headingText = component.renderInlineTokens(
		token.tokens ?? [],
		headingStyleContext,
	);
	return [headingStyle(marker) + headingText, ...spacingAfter(nextTokenType)];
}

function highlightedCodeLines(
	component: MarkdownInternals,
	code: string,
	language: string | undefined,
): string[] {
	if (component.theme.highlightCode) {
		try {
			return component.theme.highlightCode(code, language);
		} catch {
			// Fall through to plain code lines.
		}
	}
	return code.split("\n").map(component.theme.codeBlock);
}

function isCopiedBlock(state: CopyState, index: number): boolean {
	return (
		state.copiedIndex === index &&
		state.copiedUntil !== undefined &&
		Date.now() < state.copiedUntil
	);
}

function repaintMarkdown(component: MarkdownInternals): void {
	component.invalidate?.();
	requestRepaint();
}

function markCopied(
	component: MarkdownInternals,
	state: CopyState,
	index: number,
): void {
	state.copiedIndex = index;
	state.copiedUntil = Date.now() + COPY_FEEDBACK_MS;
	repaintMarkdown(component);
	if (state.copyTimer !== undefined) clearTimeout(state.copyTimer);
	state.copyTimer = setTimeout(() => {
		state.copyTimer = undefined;
		state.copiedIndex = undefined;
		state.copiedUntil = undefined;
		repaintMarkdown(component);
	}, COPY_FEEDBACK_MS);
}

function renderCodeBlock(
	component: MarkdownInternals,
	token: MarkdownToken,
	width: number,
	nextTokenType: string | undefined,
	index: number,
	copied: boolean,
): string[] {
	const code = token.text ?? "";
	const resolution = resolveLanguage(code, token.lang);
	const styledLines = highlightedCodeLines(
		component,
		code,
		resolution.language,
	);
	setLatestCopyTarget({ code, label: resolution.label });

	const frame = buildCodeFrame(
		resolution.label,
		styledLines,
		width,
		component.theme.codeBlockBorder,
		{ copied },
	);
	if (frame) {
		component[COPY_STATE]?.recording.push({
			index,
			borderText: frame.borderText,
			copy: frame.copy && { startX: frame.copy.startX, endX: frame.copy.endX },
			code,
			label: resolution.label,
		});
		return [...frame.lines, ...spacingAfter(nextTokenType)];
	}

	// Too narrow for a frame: keep the original plain rendering.
	const indent = component.theme.codeBlockIndent ?? "  ";
	const lines = [component.theme.codeBlockBorder(`┌─ ${resolution.label}`)];
	for (const line of styledLines) lines.push(`${indent}${line}`);
	lines.push(component.theme.codeBlockBorder("└─"));
	return [...lines, ...spacingAfter(nextTokenType)];
}

function locateCopyTargets(
	recording: RenderedCodeBlock[],
	lines: string[],
): CopyTarget[] {
	const targets: CopyTarget[] = [];
	let cursor = 0;
	for (const block of recording) {
		if (!block.copy) continue;
		for (let row = cursor; row < lines.length; row++) {
			const stripped = stripAnsi(lines[row] ?? "");
			const index = stripped.indexOf(block.borderText);
			if (index < 0) continue;
			const startX = visibleWidth(stripped.slice(0, index)) + block.copy.startX;
			targets.push({
				index: block.index,
				row,
				startX,
				endX: startX + (block.copy.endX - block.copy.startX),
				code: block.code,
				label: block.label,
			});
			cursor = row + 1;
			break;
		}
	}
	return targets;
}

export function installMarkdownPatch(
	options: MarkdownPatchOptions = {},
): MarkdownPatch {
	globalPatchState()?.restore();

	const prototype = Markdown.prototype as unknown as MarkdownInternals;
	const originalRenderToken = prototype.renderToken;
	const originalRender = prototype.render;
	if (
		typeof originalRenderToken !== "function" ||
		typeof prototype.renderInlineTokens !== "function" ||
		typeof originalRender !== "function"
	) {
		return {
			installed: false,
			reason:
				"This Pi TUI version does not expose the expected Markdown renderer.",
			restore: () => {},
		};
	}

	const onCopy = options.onCopy ?? ((): void => {});

	const patchedRenderToken: RenderToken = function (
		token,
		width,
		nextTokenType,
		inlineStyleContext,
	): string[] {
		if (token.type === "heading")
			return renderCompactHeading(this, token, nextTokenType);
		if (token.type === "code") {
			const state = this[COPY_STATE];
			const index = state ? state.blockIndex++ : 0;
			return renderCodeBlock(
				this,
				token,
				width,
				nextTokenType,
				index,
				state ? isCopiedBlock(state, index) : false,
			);
		}
		return originalRenderToken.call(
			this,
			token,
			width,
			nextTokenType,
			inlineStyleContext,
		);
	};

	const patchedRender = function (
		this: MarkdownInternals,
		width: number,
	): string[] {
		const state =
			this[COPY_STATE] ??
			(this[COPY_STATE] = {
				recording: [],
				targets: [],
				lastText: undefined,
				lastWidth: undefined,
				signature: undefined,
				copiedIndex: undefined,
				copiedUntil: undefined,
				copyTimer: undefined,
				blockIndex: 0,
			});
		state.recording = [];
		state.blockIndex = 0;
		const lines = originalRender.call(this, width);
		const changed = state.lastText !== this.text || state.lastWidth !== width;
		const signature = `${this.text}\u0000${width}\u0000${state.copiedIndex ?? -1}`;
		if (
			state.signature !== signature &&
			(changed || state.recording.length > 0)
		) {
			state.targets = locateCopyTargets(state.recording, lines);
			state.signature = signature;
			state.lastText = this.text;
			state.lastWidth = width;
		}
		return lines;
	};

	const patchedHandleMouse = function (
		this: MarkdownInternals,
		event: TuiMouseEvent,
	): TuiMouseEventResult | undefined {
		if (event.button !== "left") return undefined;
		if (event.type !== "press" && event.type !== "click") return undefined;
		const state = this[COPY_STATE];
		if (!state) return undefined;
		if (state.lastWidth !== event.width) {
			try {
				this.render(event.width);
			} catch {
				return undefined;
			}
		}
		const hit = state.targets.find(
			(target) =>
				event.y === target.row &&
				event.x >= target.startX &&
				event.x <= target.endX,
		);
		if (!hit) return undefined;
		if (event.type === "click") {
			void Promise.resolve(onCopy(hit.code, hit.label)).then(
				() => markCopied(this, state, hit.index),
				() => {},
			);
		}
		return { handled: true };
	};

	const hadHandleMouse = Object.hasOwn(prototype, "handleMouse");
	const originalHandleMouse = prototype.handleMouse;

	prototype.renderToken = patchedRenderToken;
	prototype.render = patchedRender;
	prototype.handleMouse = patchedHandleMouse;

	let state: PatchState;
	const restore = (): void => {
		if (prototype.renderToken === patchedRenderToken)
			prototype.renderToken = originalRenderToken;
		if (prototype.render === patchedRender) prototype.render = originalRender;
		if (prototype.handleMouse === patchedHandleMouse) {
			if (hadHandleMouse) prototype.handleMouse = originalHandleMouse;
			else delete prototype.handleMouse;
		}
		if (globalPatchState() === state) setGlobalPatchState(undefined);
	};
	state = {
		prototype,
		patchedRenderToken,
		originalRenderToken,
		patchedRender,
		originalRender,
		patchedHandleMouse,
		originalHandleMouse,
		hadHandleMouse,
		restore,
	};
	setGlobalPatchState(state);

	return { installed: true, restore };
}
