import {
	copyToClipboard,
	getMarkdownTheme,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	Container,
	Key,
	Markdown,
	matchesKey,
	Text,
} from "@earendil-works/pi-tui";
import { registerHighlightedBashTool } from "../src/bash-tool.ts";
import {
	clearLatestCopyTarget,
	copyDescription,
	getLatestCopyTarget,
} from "../src/copy.ts";
import { installMarkdownPatch } from "../src/markdown-patch.ts";
import { installTuiCapture } from "../src/repaint.ts";

export const PREVIEW_MARKDOWN = `# Compact rich Markdown

This display uses **weight**, *emphasis*, [links](https://pi.dev), and \`inline code\` without large headings.

## Syntax colors

\`\`\`typescript
interface Greeting {
  message: string;
}

const greeting: Greeting = { message: "Hello from Pi" };
console.log(greeting.message);
\`\`\`

### Automatic language detection

\`\`\`
def greet(name: str) -> str:
    return f"Hello, {name}!"
\`\`\`

## Go example

\`\`\`go
package main

import "fmt"

func main() {
    // Theme tokens color keywords, strings, and comments.
    message := "Hello from Pi"
    fmt.Println(message)
}
\`\`\`

> The active Pi theme supplies every color.

- Compact headings
- Copyable code frames
- Safe plain-text fallback`;

export default function piColours(pi: ExtensionAPI): void {
	let notify:
		| ((message: string, type?: "info" | "warning" | "error") => void)
		| undefined;

	// Resolves once the text is on the clipboard, so code frames can confirm
	// the copy; rejects after reporting the failure.
	const copyCode = async (code: string, label: string): Promise<void> => {
		try {
			await copyToClipboard(code);
			notify?.(
				`Copied ${copyDescription(label, code)} to the clipboard`,
				"info",
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			notify?.(`Copy failed: ${message}`, "error");
			throw error;
		}
	};

	const copyLatest = async (ctx: ExtensionContext): Promise<void> => {
		const target = getLatestCopyTarget();
		if (!target) {
			ctx.ui.notify("No code block to copy yet.", "warning");
			return;
		}
		try {
			await copyToClipboard(target.code);
			ctx.ui.notify(
				`Copied ${copyDescription(target.label, target.code)} to the clipboard`,
				"info",
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			ctx.ui.notify(`Copy failed: ${message}`, "error");
		}
	};

	const restoreTuiCapture = installTuiCapture();
	const markdownPatch = installMarkdownPatch({ onCopy: copyCode });
	registerHighlightedBashTool(pi, { onCopy: copyCode });

	pi.on("session_start", (_event, ctx) => {
		notify = (message, type) => ctx.ui.notify(message, type);
		clearLatestCopyTarget();
		if (ctx.mode === "tui" && !markdownPatch.installed) {
			ctx.ui.notify(
				markdownPatch.reason ??
					"Pi Colours could not patch Markdown rendering.",
				"warning",
			);
		}
	});

	pi.on("session_shutdown", () => {
		markdownPatch.restore();
		restoreTuiCapture();
		clearLatestCopyTarget();
		notify = undefined;
	});

	pi.registerShortcut("ctrl+shift+c", {
		description: "Copy the latest code block",
		handler: (ctx) => copyLatest(ctx),
	});

	pi.registerCommand("colours-copy", {
		description: "Copy the latest code block to the clipboard",
		handler: (_args, ctx) => copyLatest(ctx),
	});

	pi.registerCommand("colours-preview", {
		description: "Preview compact Markdown and syntax colors",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify(
					"The Pi Colours preview is available in TUI mode only.",
					"info",
				);
				return;
			}

			await ctx.ui.custom<void>((_tui, theme, _keybindings, done) => {
				const container = new Container();
				container.addChild(
					new Markdown(PREVIEW_MARKDOWN, 1, 0, getMarkdownTheme()),
				);
				container.addChild(
					new Text(theme.fg("dim", "Press Enter or Esc to close"), 1, 1),
				);
				return {
					render: (width) => container.render(width),
					invalidate: () => container.invalidate(),
					handleMouse: (event) => container.handleMouse(event),
					handleInput: (data) => {
						if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape))
							done();
					},
				};
			});
		},
	});
}
