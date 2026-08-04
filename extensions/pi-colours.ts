import {
	getMarkdownTheme,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import {
	Container,
	Key,
	Markdown,
	matchesKey,
	Text,
} from "@earendil-works/pi-tui";
import { registerHighlightedBashTool } from "../src/bash-tool.ts";
import { installMarkdownPatch } from "../src/markdown-patch.ts";

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
- Clean code frames
- Safe plain-text fallback`;

export default function piColours(pi: ExtensionAPI): void {
	const markdownPatch = installMarkdownPatch();
	registerHighlightedBashTool(pi);

	pi.on("session_start", (_event, ctx) => {
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
					handleInput: (data) => {
						if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape))
							done();
					},
				};
			});
		},
	});
}
