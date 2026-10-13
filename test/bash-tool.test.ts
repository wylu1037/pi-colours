import {
	initTheme,
	type ExtensionAPI,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import {
	visibleWidth,
	type Component,
	type TuiMouseEvent,
	type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { registerHighlightedBashTool } from "../src/bash-tool.ts";
import { clearLatestCopyTarget, getLatestCopyTarget } from "../src/copy.ts";

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

type MouseAwareComponent = Component & {
	handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined;
};

const plainTheme = {
	fg: (_color: string, text: string) => text,
} as Theme;

let onCopy: ReturnType<typeof vi.fn> | undefined;

afterEach(() => {
	onCopy = undefined;
	clearLatestCopyTarget();
});

beforeAll(() => {
	const packageDir = process.env.PI_PACKAGE_DIR;
	delete process.env.PI_PACKAGE_DIR;
	try {
		initTheme("dark");
	} finally {
		if (packageDir) process.env.PI_PACKAGE_DIR = packageDir;
	}
});

function stripAnsi(text: string): string {
	return text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function mouseEvent(init: {
	x: number;
	y: number;
	type?: TuiMouseEvent["type"];
	button?: TuiMouseEvent["button"];
	width?: number;
}): TuiMouseEvent {
	return {
		type: init.type ?? "click",
		button: init.button ?? "left",
		x: init.x,
		y: init.y,
		screenX: init.x,
		screenY: init.y,
		width: init.width ?? 100,
		height: 40,
		shift: false,
		alt: false,
		ctrl: false,
	};
}

function getRenderer(): RenderResult {
	let renderResult: RenderResult | undefined;
	const pi = {
		registerTool(tool: { renderResult?: RenderResult }) {
			renderResult = tool.renderResult;
		},
	} as unknown as ExtensionAPI;
	registerHighlightedBashTool(pi, onCopy ? { onCopy } : {});
	if (!renderResult) throw new Error("Bash renderer was not registered");
	return renderResult;
}

function renderComponent(
	command: string,
	output: string,
	options: { expanded?: boolean; isPartial?: boolean } = {},
): MouseAwareComponent {
	const component = getRenderer()(
		{ content: [{ type: "text", text: output }], details: undefined },
		{
			expanded: options.expanded ?? true,
			isPartial: options.isPartial ?? false,
		},
		plainTheme,
		{
			args: { command },
			state: {},
			invalidate: vi.fn(),
			isError: false,
		},
	);
	return component as MouseAwareComponent;
}

function renderOutput(command: string, output: string): string {
	return stripAnsi(renderComponent(command, output).render(100).join("\n"));
}

function clickCopy(component: MouseAwareComponent, lines: string[]): void {
	const row = lines.findIndex((line) => line.includes("[Copy]"));
	expect(row).toBeGreaterThanOrEqual(0);
	const line = lines[row]!;
	const startX = visibleWidth(line.slice(0, line.indexOf("[Copy]")));
	const x = startX + 2;

	expect(
		component.handleMouse(mouseEvent({ type: "press", x, y: row })),
	).toEqual({ handled: true });
	expect(
		component.handleMouse(mouseEvent({ type: "click", x, y: row })),
	).toEqual({ handled: true });
}

describe("highlighted Bash renderer", () => {
	it("uses a file path in the command as a language hint", () => {
		const output = renderOutput(
			"cat src/example.ts",
			"\x1b[31mconst answer: number = 42;\x1b[0m",
		);
		expect(output).toContain("╭─ typescript");
		expect(output).toContain("[Copy]");
		expect(output).toContain("const answer: number = 42;");
		expect(output).toContain("╰");
	});

	it("keeps normal command output plain", () => {
		const output = renderOutput("printf 'build complete'", "build complete");
		expect(output).toContain("build complete");
		expect(output).not.toContain("╭─");
	});

	it("copies the full output when the [Copy] chip is clicked", () => {
		onCopy = vi.fn();
		const component = renderComponent(
			"cat src/example.ts",
			"line one\nline two",
		);
		const lines = component.render(100).map(stripAnsi);

		clickCopy(component, lines);

		expect(onCopy).toHaveBeenCalledTimes(1);
		expect(onCopy).toHaveBeenCalledWith("line one\nline two", "typescript");
	});

	it("copies the untruncated output from the collapsed preview", () => {
		onCopy = vi.fn();
		const fullOutput = Array.from(
			{ length: 8 },
			(_, index) => `line ${index + 1}`,
		).join("\n");
		const component = renderComponent("cat src/example.ts", fullOutput, {
			expanded: false,
		});
		const lines = component.render(100).map(stripAnsi);

		expect(lines.some((line) => line.includes("3 earlier lines"))).toBe(true);
		clickCopy(component, lines);

		expect(onCopy).toHaveBeenCalledWith(fullOutput, "typescript");
	});

	it("registers the latest output for the copy shortcut", () => {
		renderComponent("cat src/example.ts", "const answer = 42;");

		expect(getLatestCopyTarget()).toEqual({
			code: "const answer = 42;",
			label: "typescript",
		});
	});
});
