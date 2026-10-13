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
	borderText: string;
	copy?: { startX: number; endX: number } | undefined;
	code: string;
	label: string;
}

interface CopyTarget {
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
}

const COPY_STATE: unique symbol = Symbol("pi-colours:copy-state");

interface MarkdownInternals {
	theme: MarkdownTheme;
	text: string;
	getStylePrefix?: (style: (text: string) => string) => string;
	renderInlineTokens: (
		tokens: unknown[],
		styleContext?: InlineStyleContext,
	) => string;
	render: (width: number) => string[];
	renderToken: RenderToken;
	handleMouse?:
		| ((event: TuiMouseEvent) => TuiMouseEventResult | undefined)
		| undefined;
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
	onCopy?: (code: string, label: string) => void;
}

const PATCH_KEY = Symbol.for("pi-colours:markdown-patch");

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

function renderCodeBlock(
	component: MarkdownInternals,
	token: MarkdownToken,
	width: number,
	nextTokenType: string | undefined,
): string[] {
	const code = token.text ?? "";
	const resolution = resolveLanguage(code, token.lang);
	const styledLines = highlightedCodeLines(component, code, resolution.language);
	setLatestCopyTarget({ code, label: resolution.label });

	const frame = buildCodeFrame(
		resolution.label,
		styledLines,
		width,
		component.theme.codeBlockBorder,
	);
	if (frame) {
		component[COPY_STATE]?.recording.push({
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
			const startX =
				visibleWidth(stripped.slice(0, index)) + block.copy.startX;
			targets.push({
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
		if (token.type === "code")
			return renderCodeBlock(this, token, width, nextTokenType);
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
			});
		state.recording = [];
		const lines = originalRender.call(this, width);
		if (state.lastText !== this.text || state.lastWidth !== width) {
			state.targets = locateCopyTargets(state.recording, lines);
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
		if (event.type === "click") onCopy(hit.code, hit.label);
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
		if (prototype.render === patchedRender)
			prototype.render = originalRender;
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
