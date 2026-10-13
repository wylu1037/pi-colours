import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { buildCodeFrame, stripAnsi } from "../src/code-frame.ts";

describe("buildCodeFrame", () => {
	it("builds a rounded frame with a language label and copy chip", () => {
		const frame = buildCodeFrame("bash", ["echo hi"], 40);
		expect(frame).toBeDefined();
		const lines = frame!.lines.map(stripAnsi);

		expect(lines[0]).toBe(`╭─ bash ${"─".repeat(22)} [Copy] ─╮`);
		expect(lines[1]).toBe(`│ echo hi${" ".repeat(29)} │`);
		expect(lines[2]).toBe(`╰${"─".repeat(38)}╯`);
		expect(frame!.copy).toEqual({ row: 0, startX: 31, endX: 36 });
		expect(frame!.borderText).toBe(lines[0]);
	});

	it("keeps every line exactly at the requested width", () => {
		for (const width of [19, 20, 41, 80, 120]) {
			const frame = buildCodeFrame("typescript", ["const x = 1;"], width);
			expect(frame).toBeDefined();
			for (const line of frame!.lines) expect(visibleWidth(line)).toBe(width);
		}
	});

	it("wraps long content lines inside the frame", () => {
		const frame = buildCodeFrame("bash", ["x".repeat(60)], 40);
		expect(frame!.lines).toHaveLength(4);
		for (const line of frame!.lines) expect(visibleWidth(line)).toBe(40);
	});

	it("measures CJK content by display width", () => {
		const frame = buildCodeFrame("bash", ["中文测试"], 40);
		const content = stripAnsi(frame!.lines[1]!);
		expect(visibleWidth(content)).toBe(40);
		expect(content).toBe(`│ 中文测试${" ".repeat(28)} │`);
	});

	it("drops the copy chip when the frame is too narrow", () => {
		const frame = buildCodeFrame("bash", ["echo"], 12);
		expect(frame).toBeDefined();
		expect(frame!.copy).toBeUndefined();
		expect(stripAnsi(frame!.lines[0]!)).toBe("╭─ bash ───╮");
		expect(visibleWidth(frame!.lines[0]!)).toBe(12);
	});

	it("returns undefined when there is no room for a frame", () => {
		expect(buildCodeFrame("bash", ["echo"], 10)).toBeUndefined();
	});

	it("styles the border without affecting geometry", () => {
		const style = (text: string) => `\x1b[2m${text}\x1b[0m`;
		const frame = buildCodeFrame("bash", ["echo hi"], 40, style);
		expect(frame!.lines[0]).toBe(
			`\x1b[2m╭─ bash ${"─".repeat(22)} [Copy] ─╮\x1b[0m`,
		);
		expect(stripAnsi(frame!.lines[0]!)).toBe(frame!.borderText);
		expect(visibleWidth(frame!.lines[0]!)).toBe(40);
	});

	it("removes ANSI sequences", () => {
		expect(stripAnsi("\x1b[31mred\x1b[0m")).toBe("red");
	});
});
