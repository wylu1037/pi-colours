import {
	createBashToolDefinition,
	highlightCode,
	keyHint,
	type BashToolDetails,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import type {
	Component,
	TuiMouseEvent,
	TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import { buildCodeFrame } from "./code-frame.ts";
import { setLatestCopyTarget } from "./copy.ts";
import { inferLanguageFromCommand, resolveLanguage } from "./languages.ts";

const PREVIEW_LINES = 5;

export interface BashToolOptions {
	/** Called when the user activates the "[Copy]" label on a Bash code frame. */
	onCopy?: (code: string, label: string) => void;
}

interface BashFrameContent {
	/** Language label; when undefined the output renders as plain lines. */
	label: string | undefined;
	/** Highlighted lines currently displayed (preview or full). */
	codeLines: string[];
	/** Full (untruncated) output copied by the "[Copy]" label. */
	fullOutput: string;
	/** Muted "earlier lines" hint shown above the frame. */
	hint: string | undefined;
	/** Warning, elapsed, and status lines shown below the frame. */
	notes: string[];
	/** Styles the frame border with the active theme. */
	border: (text: string) => string;
}

class FramedBashOutput implements Component {
	private content: BashFrameContent = {
		label: undefined,
		codeLines: [],
		fullOutput: "",
		hint: undefined,
		notes: [],
		border: (text) => text,
	};
	private cache: { width: number; lines: string[] } | undefined;
	private copyHit:
		| { row: number; startX: number; endX: number; code: string; label: string }
		| undefined;

	constructor(
		private readonly onCopy?: (code: string, label: string) => void,
	) {}

	setContent(content: BashFrameContent): void {
		this.content = content;
		this.cache = undefined;
	}

	invalidate(): void {
		this.cache = undefined;
	}

	render(width: number): string[] {
		if (this.cache && this.cache.width === width) return this.cache.lines;
		const lines: string[] = [];
		this.copyHit = undefined;
		const content = this.content;
		if (
			content.hint ||
			content.codeLines.length > 0 ||
			content.notes.length > 0
		)
			lines.push("");
		if (content.hint) lines.push(content.hint);
		const frame =
			content.label && content.codeLines.length > 0
				? buildCodeFrame(
						content.label,
						content.codeLines,
						width,
						content.border,
					)
				: undefined;
		if (frame) {
			const frameStart = lines.length;
			lines.push(...frame.lines);
			if (frame.copy) {
				this.copyHit = {
					row: frameStart + frame.copy.row,
					startX: frame.copy.startX,
					endX: frame.copy.endX,
					code: content.fullOutput,
					label: content.label ?? "code",
				};
			}
		} else {
			lines.push(...content.codeLines);
		}
		lines.push(...content.notes);
		this.cache = { width, lines };
		return lines;
	}

	handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
		if (event.button !== "left") return undefined;
		if (event.type !== "press" && event.type !== "click") return undefined;
		if (this.cache && this.cache.width !== event.width)
			this.render(event.width);
		const hit = this.copyHit;
		if (!hit) return undefined;
		if (event.y !== hit.row || event.x < hit.startX || event.x > hit.endX)
			return undefined;
		if (event.type === "click") this.onCopy?.(hit.code, hit.label);
		return { handled: true };
	}
}

function stripTerminalControls(text: string): string {
	return text
		.replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, "")
		.replace(/\x1B(?:[@-_]|\[[0-?]*[ -/]*[@-~])/g, "")
		.replace(/\r/g, "")
		.replace(
			/[\u0000-\u0008\u000B\u000C\u000E-\u001A\u001C-\u001F\u007F]/g,
			"",
		);
}

function textContent(
	content: ReadonlyArray<{ type: string; text?: string }>,
): string {
	return content
		.filter((block) => block.type === "text")
		.map((block) => block.text ?? "")
		.join("\n");
}

function removeGeneratedFooter(
	output: string,
	details: BashToolDetails | undefined,
): string {
	if (
		!details?.truncation?.truncated ||
		!details.fullOutputPath ||
		!output.endsWith("]")
	)
		return output;
	const footerStart = output.lastIndexOf("\n\n[");
	if (
		footerStart < 0 ||
		!output.slice(footerStart).includes(details.fullOutputPath)
	)
		return output;
	return output.slice(0, footerStart).trimEnd();
}

function duration(
	startedAt: number | undefined,
	endedAt: number | undefined,
): string | undefined {
	if (startedAt === undefined) return undefined;
	return `${((endedAt ?? Date.now()) - startedAt) / 1000}`;
}

export function registerHighlightedBashTool(
	pi: ExtensionAPI,
	options: BashToolOptions = {},
): void {
	const definition = createBashToolDefinition(process.cwd());

	pi.registerTool({
		...definition,
		renderResult(result, renderOptions, theme, context) {
			const state = context.state as typeof context.state & {
				lastRegisteredOutput?: string | undefined;
			};
			if (
				renderOptions.isPartial &&
				state.startedAt !== undefined &&
				!state.interval
			) {
				state.interval = setInterval(() => context.invalidate(), 1000);
			}
			if (!renderOptions.isPartial || context.isError) {
				state.endedAt ??= Date.now();
				if (state.interval) {
					clearInterval(state.interval);
					state.interval = undefined;
				}
			}

			const details = result.details as BashToolDetails | undefined;
			let output = stripTerminalControls(textContent(result.content)).trim();
			output = removeGeneratedFooter(output, details);

			const commandHint = inferLanguageFromCommand(context.args.command);
			const resolved = context.isError
				? { language: undefined, label: "output", source: "none" as const }
				: resolveLanguage(output, undefined, commandHint);
			const allLines = resolved.language
				? highlightCode(output, resolved.language)
				: output
						.split("\n")
						.map((line) =>
							theme.fg(context.isError ? "error" : "toolOutput", line),
						);
			const displayLines = renderOptions.expanded
				? allLines
				: allLines.slice(-PREVIEW_LINES);
			const skipped = allLines.length - displayLines.length;

			if (output && output !== state.lastRegisteredOutput) {
				state.lastRegisteredOutput = output;
				setLatestCopyTarget({ code: output, label: resolved.label });
			}

			const hint =
				output && skipped > 0
					? theme.fg("muted", `... (${skipped} earlier lines,`) +
						` ${keyHint("app.tools.expand", "to expand")})`
					: undefined;

			const warnings: string[] = [];
			if (details?.fullOutputPath)
				warnings.push(`Full output: ${details.fullOutputPath}`);
			if (details?.truncation?.truncated) {
				const truncation = details.truncation;
				warnings.push(
					truncation.truncatedBy === "lines"
						? `Truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`
						: `Truncated: ${truncation.outputLines} lines shown`,
				);
			}
			const notes: string[] = [];
			if (warnings.length > 0)
				notes.push(theme.fg("warning", `[${warnings.join(". ")}]`));
			const elapsed = duration(state.startedAt, state.endedAt);
			if (elapsed) {
				const label = renderOptions.isPartial ? "Elapsed" : "Took";
				notes.push(
					theme.fg("muted", `${label} ${Number(elapsed).toFixed(1)}s`),
				);
			}
			if (!output && notes.length === 0 && renderOptions.isPartial)
				notes.push(theme.fg("muted", "Running..."));

			const component =
				context.lastComponent instanceof FramedBashOutput
					? context.lastComponent
					: new FramedBashOutput(options.onCopy);
			component.setContent({
				label: output && resolved.language ? resolved.label : undefined,
				codeLines: output ? displayLines : [],
				fullOutput: output,
				hint,
				notes,
				border: (text) => theme.fg("mdCodeBlockBorder", text),
			});
			return component;
		},
	});
}
