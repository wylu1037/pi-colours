import {
	createBashToolDefinition,
	highlightCode,
	keyHint,
	type BashToolDetails,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { inferLanguageFromCommand, resolveLanguage } from "./languages.ts";

const PREVIEW_LINES = 5;

class HighlightedBashOutput extends Text {
	constructor() {
		super("", 0, 0);
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

export function registerHighlightedBashTool(pi: ExtensionAPI): void {
	const definition = createBashToolDefinition(process.cwd());

	pi.registerTool({
		...definition,
		renderResult(result, options, theme, context) {
			const state = context.state;
			if (
				options.isPartial &&
				state.startedAt !== undefined &&
				!state.interval
			) {
				state.interval = setInterval(() => context.invalidate(), 1000);
			}
			if (!options.isPartial || context.isError) {
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
			const displayLines = options.expanded
				? allLines
				: allLines.slice(-PREVIEW_LINES);
			const skipped = allLines.length - displayLines.length;
			const sections: string[] = [];

			if (output) {
				if (skipped > 0) {
					sections.push(
						theme.fg("muted", `... (${skipped} earlier lines,`) +
							` ${keyHint("app.tools.expand", "to expand")})`,
					);
				}
				if (resolved.language) {
					sections.push(theme.fg("mdCodeBlockBorder", `┌─ ${resolved.label}`));
					sections.push(...displayLines.map((line) => `  ${line}`));
					sections.push(theme.fg("mdCodeBlockBorder", "└─"));
				} else {
					sections.push(...displayLines);
				}
			}

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
			if (warnings.length > 0)
				sections.push(theme.fg("warning", `[${warnings.join(". ")}]`));

			const elapsed = duration(state.startedAt, state.endedAt);
			if (elapsed) {
				const label = options.isPartial ? "Elapsed" : "Took";
				sections.push(
					theme.fg("muted", `${label} ${Number(elapsed).toFixed(1)}s`),
				);
			}
			if (sections.length === 0 && options.isPartial)
				sections.push(theme.fg("muted", "Running..."));

			const component =
				context.lastComponent instanceof HighlightedBashOutput
					? context.lastComponent
					: new HighlightedBashOutput();
			component.setText(sections.length > 0 ? `\n${sections.join("\n")}` : "");
			return component;
		},
	});
}
