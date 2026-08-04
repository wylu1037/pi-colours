import { Markdown, type MarkdownTheme } from "@earendil-works/pi-tui";
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

interface MarkdownInternals {
	theme: MarkdownTheme;
	getStylePrefix?: (style: (text: string) => string) => string;
	renderInlineTokens: (
		tokens: unknown[],
		styleContext?: InlineStyleContext,
	) => string;
	renderToken: RenderToken;
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
	restore: () => void;
}

export interface MarkdownPatch {
	installed: boolean;
	reason?: string;
	restore: () => void;
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

function renderCodeBlock(
	component: MarkdownInternals,
	token: MarkdownToken,
	nextTokenType: string | undefined,
): string[] {
	const code = token.text ?? "";
	const resolution = resolveLanguage(code, token.lang);
	const indent = component.theme.codeBlockIndent ?? "  ";
	const lines = [component.theme.codeBlockBorder(`┌─ ${resolution.label}`)];

	let highlightedLines: string[] | undefined;
	if (component.theme.highlightCode) {
		try {
			highlightedLines = component.theme.highlightCode(
				code,
				resolution.language,
			);
		} catch {
			highlightedLines = undefined;
		}
	}

	for (const line of highlightedLines ??
		code.split("\n").map(component.theme.codeBlock)) {
		lines.push(`${indent}${line}`);
	}
	lines.push(component.theme.codeBlockBorder("└─"));
	lines.push(...spacingAfter(nextTokenType));
	return lines;
}

export function installMarkdownPatch(): MarkdownPatch {
	globalPatchState()?.restore();

	const prototype = Markdown.prototype as unknown as MarkdownInternals;
	const originalRenderToken = prototype.renderToken;
	if (
		typeof originalRenderToken !== "function" ||
		typeof prototype.renderInlineTokens !== "function"
	) {
		return {
			installed: false,
			reason:
				"This Pi TUI version does not expose the expected Markdown renderer.",
			restore: () => {},
		};
	}

	const patchedRenderToken: RenderToken = function (
		token,
		width,
		nextTokenType,
		inlineStyleContext,
	): string[] {
		if (token.type === "heading")
			return renderCompactHeading(this, token, nextTokenType);
		if (token.type === "code")
			return renderCodeBlock(this, token, nextTokenType);
		return originalRenderToken.call(
			this,
			token,
			width,
			nextTokenType,
			inlineStyleContext,
		);
	};

	prototype.renderToken = patchedRenderToken;
	let state: PatchState;
	const restore = (): void => {
		if (prototype.renderToken === patchedRenderToken)
			prototype.renderToken = originalRenderToken;
		if (globalPatchState() === state) setGlobalPatchState(undefined);
	};
	state = { prototype, patchedRenderToken, originalRenderToken, restore };
	setGlobalPatchState(state);

	return { installed: true, restore };
}
