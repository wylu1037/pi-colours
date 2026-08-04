import {
	initTheme,
	type ExtensionAPI,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { registerHighlightedBashTool } from "../src/bash-tool.ts";

interface BashResult {
	content: Array<{ type: "text"; text: string }>;
	details?: unknown;
}

type RenderResult = (
	result: BashResult,
	options: { expanded: boolean; isPartial: boolean },
	theme: Theme,
	context: {
		args: { command: string; timeout?: number };
		state: { startedAt?: number; endedAt?: number; interval?: NodeJS.Timeout };
		lastComponent?: Component;
		invalidate: () => void;
		isError: boolean;
	},
) => Component;

const plainTheme = {
	fg: (_color: string, text: string) => text,
} as Theme;

function stripAnsi(text: string): string {
	return text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function getRenderer(): RenderResult {
	let renderResult: RenderResult | undefined;
	const pi = {
		registerTool(tool: { renderResult?: RenderResult }) {
			renderResult = tool.renderResult;
		},
	} as unknown as ExtensionAPI;
	registerHighlightedBashTool(pi);
	if (!renderResult) throw new Error("Bash renderer was not registered");
	return renderResult;
}

function renderOutput(command: string, output: string): string {
	const renderResult = getRenderer();
	const component = renderResult(
		{ content: [{ type: "text", text: output }], details: undefined },
		{ expanded: true, isPartial: false },
		plainTheme,
		{
			args: { command },
			state: {},
			invalidate: vi.fn(),
			isError: false,
		},
	);
	return stripAnsi(component.render(100).join("\n"));
}

beforeAll(() => {
	const packageDir = process.env.PI_PACKAGE_DIR;
	delete process.env.PI_PACKAGE_DIR;
	try {
		initTheme("dark");
	} finally {
		if (packageDir) process.env.PI_PACKAGE_DIR = packageDir;
	}
});

describe("highlighted Bash renderer", () => {
	it("uses a file path in the command as a language hint", () => {
		const output = renderOutput(
			"cat src/example.ts",
			"\x1b[31mconst answer: number = 42;\x1b[0m",
		);
		expect(output).toContain("┌─ typescript");
		expect(output).toContain("const answer: number = 42;");
		expect(output).toContain("└─");
	});

	it("keeps normal command output plain", () => {
		const output = renderOutput("printf 'build complete'", "build complete");
		expect(output).toContain("build complete");
		expect(output).not.toContain("┌─");
	});
});
