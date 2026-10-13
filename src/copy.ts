export interface CopyTarget {
	code: string;
	label: string;
}

let latest: CopyTarget | undefined;

/** Remember the most recently rendered code block for the copy shortcut. */
export function setLatestCopyTarget(target: CopyTarget): void {
	latest = target;
}

export function getLatestCopyTarget(): CopyTarget | undefined {
	return latest;
}

export function clearLatestCopyTarget(): void {
	latest = undefined;
}

/** Human-readable summary used in copy notifications, e.g. "go code block (12 lines)". */
export function copyDescription(label: string, code: string): string {
	const lines = code.split("\n").length;
	const name = label && label !== "code" ? `${label} code block` : "code block";
	return `${name} (${lines} ${lines === 1 ? "line" : "lines"})`;
}
