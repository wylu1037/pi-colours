import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = join(root, "docs", "assets");
mkdirSync(outputDirectory, { recursive: true });

// A Pi session sets this path to its own binary package. Tests and generators
// must let the npm development dependency resolve its own theme files.
Reflect.deleteProperty(process.env, "PI_PACKAGE_DIR");

const [
	{ getMarkdownTheme, initTheme },
	{ Markdown },
	{ installMarkdownPatch },
] = await Promise.all([
	import("@earendil-works/pi-coding-agent"),
	import("@earendil-works/pi-tui"),
	import("../src/markdown-patch.ts"),
]);

const SCREENSHOT_MARKDOWN = `# Compact rich Markdown

Pi Colours uses **weight**, *emphasis*, [links](https://pi.dev), and \`inline code\` without large headings.

## Go syntax colors

\`\`\`go
package main

import "fmt"

func main() {
    // Theme tokens color keywords, strings, and comments.
    message := "Hello from Pi"
    fmt.Println(message)
}
\`\`\`

> Every color comes from the active Pi theme.

### Readable at a glance

- Copyable code frames
- Automatic language detection
- Safe plain-text fallback`;

const patch = installMarkdownPatch();
if (!patch.installed)
	throw new Error(patch.reason ?? "Could not install the Markdown patch");

interface AnsiStyle {
	foreground?: string;
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	strike?: boolean;
}

const BASIC_COLORS = [
	"#000000",
	"#aa0000",
	"#00aa00",
	"#aa5500",
	"#0000aa",
	"#aa00aa",
	"#00aaaa",
	"#aaaaaa",
	"#555555",
	"#ff5555",
	"#55ff55",
	"#ffff55",
	"#5555ff",
	"#ff55ff",
	"#55ffff",
	"#ffffff",
] as const;

function escapeHtml(text: string): string {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function color256(index: number): string {
	if (index < 16) return BASIC_COLORS[index] ?? "inherit";
	if (index < 232) {
		const value = index - 16;
		const channels = [
			Math.floor(value / 36),
			Math.floor((value % 36) / 6),
			value % 6,
		];
		const toChannel = (channel: number) =>
			channel === 0 ? 0 : 55 + channel * 40;
		return `rgb(${channels.map(toChannel).join(", ")})`;
	}
	const gray = 8 + (index - 232) * 10;
	return `rgb(${gray}, ${gray}, ${gray})`;
}

function resetStyle(style: AnsiStyle): void {
	for (const key of Object.keys(style) as Array<keyof AnsiStyle>)
		Reflect.deleteProperty(style, key);
}

function applyBasicStyle(style: AnsiStyle, code: number): boolean {
	switch (code) {
		case 0:
			resetStyle(style);
			return true;
		case 1:
			style.bold = true;
			return true;
		case 3:
			style.italic = true;
			return true;
		case 4:
			style.underline = true;
			return true;
		case 9:
			style.strike = true;
			return true;
		case 22:
			style.bold = false;
			return true;
		case 23:
			style.italic = false;
			return true;
		case 24:
			style.underline = false;
			return true;
		case 29:
			style.strike = false;
			return true;
		case 39:
			Reflect.deleteProperty(style, "foreground");
			return true;
		default:
			return false;
	}
}

function paletteForeground(code: number): string | undefined {
	if (code >= 30 && code <= 37) return BASIC_COLORS[code - 30] ?? "inherit";
	if (code >= 90 && code <= 97) return BASIC_COLORS[code - 82] ?? "inherit";
	return undefined;
}

function extendedForeground(
	parameters: number[],
	index: number,
): { color: string; consumed: number } | undefined {
	if (parameters[index] !== 38) return undefined;
	if (parameters[index + 1] === 2) {
		const red = parameters[index + 2] ?? 0;
		const green = parameters[index + 3] ?? 0;
		const blue = parameters[index + 4] ?? 0;
		return { color: `rgb(${red}, ${green}, ${blue})`, consumed: 4 };
	}
	if (parameters[index + 1] === 5)
		return { color: color256(parameters[index + 2] ?? 0), consumed: 2 };
	return undefined;
}

function applyForeground(
	style: AnsiStyle,
	parameters: number[],
	index: number,
): number {
	const palette = paletteForeground(parameters[index] ?? 0);
	if (palette) {
		style.foreground = palette;
		return 0;
	}
	const extended = extendedForeground(parameters, index);
	if (!extended) return 0;
	style.foreground = extended.color;
	return extended.consumed;
}

function updateStyle(style: AnsiStyle, parameters: number[]): void {
	for (let index = 0; index < parameters.length; index++) {
		const code = parameters[index] ?? 0;
		if (!applyBasicStyle(style, code))
			index += applyForeground(style, parameters, index);
	}
}

function styleAttribute(style: AnsiStyle): string {
	const rules: string[] = [];
	if (style.foreground) rules.push(`color:${style.foreground}`);
	if (style.bold) rules.push("font-weight:700");
	if (style.italic) rules.push("font-style:italic");
	const decorations = [
		style.underline ? "underline" : "",
		style.strike ? "line-through" : "",
	].filter(Boolean);
	if (decorations.length > 0)
		rules.push(`text-decoration:${decorations.join(" ")}`);
	return rules.join(";");
}

function ansiToHtml(input: string): string {
	const cleanInput = input.replace(/\x1B\]8;;.*?(?:\x07|\x1B\\)/g, "");
	const expression = /\x1B\[([0-9;]*)m/g;
	const style: AnsiStyle = {};
	let cursor = 0;
	let output = "";
	for (const match of cleanInput.matchAll(expression)) {
		const index = match.index ?? cursor;
		const text = cleanInput.slice(cursor, index);
		if (text) {
			const attribute = styleAttribute(style);
			output += attribute
				? `<span style="${attribute}">${escapeHtml(text)}</span>`
				: escapeHtml(text);
		}
		const parameters = (match[1] || "0").split(";").map(Number);
		updateStyle(style, parameters);
		cursor = index + match[0].length;
	}
	const tail = cleanInput.slice(cursor);
	if (tail) {
		const attribute = styleAttribute(style);
		output += attribute
			? `<span style="${attribute}">${escapeHtml(tail)}</span>`
			: escapeHtml(tail);
	}
	return output;
}

interface CaptureTheme {
	name: "dark" | "light";
	page: string;
	terminal: string;
	header: string;
	border: string;
	text: string;
	muted: string;
}

const CAPTURE_THEMES: CaptureTheme[] = [
	{
		name: "dark",
		page: "#0e1016",
		terminal: "#18181e",
		header: "#22232c",
		border: "#353743",
		text: "#d4d4d4",
		muted: "#808080",
	},
	{
		name: "light",
		page: "#dde1e8",
		terminal: "#f8f8f8",
		header: "#eceef2",
		border: "#c6cad2",
		text: "#1f2328",
		muted: "#6c6c6c",
	},
];

function screenshotHtml(captureTheme: CaptureTheme, lines: string[]): string {
	const renderedLines = lines
		.map((line) => `<div class="line">${ansiToHtml(line) || "&nbsp;"}</div>`)
		.join("\n");
	return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 1280px; height: 900px; overflow: hidden; }
  body {
    background: ${captureTheme.page};
    padding: 42px;
    color: ${captureTheme.text};
    font-family: "JetBrainsMono Nerd Font", "JetBrains Mono", monospace;
  }
  .terminal {
    width: 1196px;
    height: 816px;
    overflow: hidden;
    border: 1px solid ${captureTheme.border};
    border-radius: 16px;
    background: ${captureTheme.terminal};
    box-shadow: 0 20px 55px rgb(0 0 0 / 24%);
  }
  .titlebar {
    height: 50px;
    display: flex;
    align-items: center;
    border-bottom: 1px solid ${captureTheme.border};
    background: ${captureTheme.header};
    padding: 0 18px;
  }
  .lights { display: flex; gap: 9px; }
  .light { width: 12px; height: 12px; border-radius: 50%; }
  .red { background: #ff5f57; }
  .yellow { background: #febc2e; }
  .green { background: #28c840; }
  .title {
    flex: 1;
    text-align: center;
    color: ${captureTheme.muted};
    font-size: 14px;
    transform: translateX(-30px);
  }
  .content {
    padding: 22px 30px;
    font-size: 16px;
    line-height: 1.36;
    white-space: pre;
    font-variant-ligatures: none;
  }
  .line { min-height: 1.36em; }
</style>
</head>
<body>
  <div class="terminal">
    <div class="titlebar">
      <div class="lights"><span class="light red"></span><span class="light yellow"></span><span class="light green"></span></div>
      <div class="title">pi · pi-colours · ${captureTheme.name} theme</div>
    </div>
    <div class="content">${renderedLines}</div>
  </div>
</body>
</html>`;
}

const temporaryDirectory = mkdtempSync(
	join(tmpdir(), "pi-colours-screenshots-"),
);
try {
	for (const captureTheme of CAPTURE_THEMES) {
		initTheme(captureTheme.name);
		const lines = new Markdown(SCREENSHOT_MARKDOWN, 0, 0, getMarkdownTheme())
			.render(96)
			.map((line) => line.trimEnd());
		while (lines.at(-1) === "") lines.pop();

		const htmlPath = join(temporaryDirectory, `${captureTheme.name}.html`);
		const screenshotPath = join(
			outputDirectory,
			`pi-colours-${captureTheme.name}.png`,
		);
		writeFileSync(htmlPath, screenshotHtml(captureTheme, lines));
		execFileSync(
			"chromium",
			[
				"--headless=new",
				"--no-sandbox",
				"--disable-gpu",
				"--hide-scrollbars",
				"--window-size=1280,900",
				`--screenshot=${screenshotPath}`,
				pathToFileURL(htmlPath).href,
			],
			{ stdio: "pipe" },
		);
		process.stdout.write(`Wrote ${screenshotPath}\n`);
	}
} finally {
	patch.restore();
	rmSync(temporaryDirectory, { recursive: true, force: true });
}
