import { Markdown, type MarkdownTheme } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it } from "vitest";
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

let patch: MarkdownPatch | undefined;

afterEach(() => {
	patch?.restore();
	patch = undefined;
});

function render(markdown: string): string {
	return new Markdown(markdown, 0, 0, theme)
		.render(100)
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

	it("uses clean code frames and explicit syntax labels", () => {
		patch = installMarkdownPatch();
		const output = render("```ts\nconst answer: number = 42;\n```");

		expect(output).toContain("┌─ typescript");
		expect(output).toContain(
			"<typescript>const answer: number = 42;</typescript>",
		);
		expect(output).toContain("└─");
		expect(output).not.toContain("```");
	});

	it("detects the language of an unlabeled block", () => {
		patch = installMarkdownPatch();
		const output = render(
			"```\ndef greet(name: str) -> str:\n    return f'Hello, {name}'\n```",
		);

		expect(output).toContain("┌─ python");
		expect(output).toContain("<python>def greet(name: str) -> str:</python>");
	});

	it("restores the original renderer", () => {
		patch = installMarkdownPatch();
		patch.restore();

		const output = render("```ts\nconst answer = 42;\n```");
		expect(output).toContain("```ts");
	});
});
