export type LanguageSource = "explicit" | "hint" | "inferred" | "none";

export interface ResolvedLanguage {
	language: string | undefined;
	label: string;
	source: LanguageSource;
}

const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
	bash: "bash",
	c: "c",
	"c#": "csharp",
	"c++": "cpp",
	clj: "clojure",
	coffee: "coffeescript",
	console: "shell",
	cs: "csharp",
	csharp: "csharp",
	css: "css",
	diff: "diff",
	docker: "dockerfile",
	dockerfile: "dockerfile",
	ex: "elixir",
	exs: "elixir",
	go: "go",
	golang: "go",
	graphql: "graphql",
	h: "c",
	hpp: "cpp",
	html: "html",
	html5: "html",
	java: "java",
	javascript: "javascript",
	js: "javascript",
	jsx: "javascript",
	json: "json",
	json5: "json5",
	jsonc: "json",
	kt: "kotlin",
	kts: "kotlin",
	md: "markdown",
	mdx: "markdown",
	objc: "objectivec",
	objectivec: "objectivec",
	php: "php",
	pl: "perl",
	postgres: "pgsql",
	postgresql: "pgsql",
	proto: "protobuf",
	py: "python",
	python: "python",
	rb: "ruby",
	rs: "rust",
	ruby: "ruby",
	rust: "rust",
	scala: "scala",
	sh: "bash",
	shell: "bash",
	"shell-session": "shell",
	sql: "sql",
	svelte: "xml",
	swift: "swift",
	tf: "hcl",
	toml: "toml",
	ts: "typescript",
	tsx: "typescript",
	typescript: "typescript",
	typescriptreact: "typescript",
	vue: "xml",
	xhtml: "html",
	xml: "xml",
	yaml: "yaml",
	yml: "yaml",
	zsh: "bash",
};

const PLAIN_TEXT_LABELS = new Set([
	"ansi",
	"none",
	"plain",
	"plaintext",
	"text",
	"txt",
]);
const GENERIC_CODE_LABELS = new Set(["code", "source"]);

const EXTENSION_LANGUAGES: Readonly<Record<string, string>> = {
	bash: "bash",
	c: "c",
	cc: "cpp",
	cjs: "javascript",
	cpp: "cpp",
	cs: "csharp",
	css: "css",
	diff: "diff",
	ex: "elixir",
	exs: "elixir",
	go: "go",
	h: "c",
	hcl: "hcl",
	hpp: "cpp",
	htm: "html",
	html: "html",
	java: "java",
	js: "javascript",
	jsx: "javascript",
	json: "json",
	json5: "json5",
	jsonc: "json",
	kt: "kotlin",
	kts: "kotlin",
	md: "markdown",
	mdx: "markdown",
	mjs: "javascript",
	php: "php",
	proto: "protobuf",
	py: "python",
	rb: "ruby",
	rs: "rust",
	scss: "scss",
	sh: "bash",
	sql: "sql",
	svelte: "xml",
	swift: "swift",
	tf: "hcl",
	toml: "toml",
	ts: "typescript",
	tsx: "typescript",
	vue: "xml",
	xml: "xml",
	yaml: "yaml",
	yml: "yaml",
	zsh: "bash",
};

function cleanLanguageLabel(value: string): string | undefined {
	const firstWord = value.trim().split(/\s+/, 1)[0];
	if (!firstWord) return undefined;

	const cleaned = firstWord
		.replace(/^\{?\.?/, "")
		.replace(/\}?$/, "")
		.toLowerCase();
	return cleaned || undefined;
}

export function normaliseLanguage(
	value: string | undefined,
): string | undefined {
	if (!value) return undefined;
	const cleaned = cleanLanguageLabel(value);
	if (!cleaned) return undefined;
	return LANGUAGE_ALIASES[cleaned] ?? cleaned;
}

export function languageFromPath(
	filePath: string | undefined,
): string | undefined {
	if (!filePath) return undefined;
	const baseName = filePath.split(/[\\/]/).pop()?.toLowerCase();
	if (!baseName) return undefined;
	if (baseName === "dockerfile") return "dockerfile";
	if (baseName === "makefile" || baseName === "gnumakefile") return "makefile";

	const extension = baseName.includes(".")
		? baseName.split(".").pop()
		: undefined;
	return extension ? EXTENSION_LANGUAGES[extension] : undefined;
}

function parsedJsonLanguage(code: string): string | undefined {
	const first = code.trimStart()[0];
	if (first !== "{" && first !== "[") return undefined;
	try {
		JSON.parse(code);
		return "json";
	} catch {
		return undefined;
	}
}

function shebangLanguage(code: string): string | undefined {
	const shebang = code.split("\n", 1)[0]?.toLowerCase() ?? "";
	if (!shebang.startsWith("#!")) return undefined;
	if (/\b(?:ba|z|k)?sh\b/.test(shebang)) return "bash";
	if (/\bpython\d*\b/.test(shebang)) return "python";
	if (/\b(?:node|deno|bun)\b/.test(shebang)) return "javascript";
	if (/\bruby\b/.test(shebang)) return "ruby";
	if (/\bperl\b/.test(shebang)) return "perl";
	return undefined;
}

function countMatches(code: string, expressions: readonly RegExp[]): number {
	return expressions.reduce(
		(score, expression) => score + (expression.test(code) ? 1 : 0),
		0,
	);
}

export function inferLanguage(code: string): string | undefined {
	const text = code.trim();
	if (!text) return undefined;

	const shebang = shebangLanguage(text);
	if (shebang) return shebang;

	const json = parsedJsonLanguage(text);
	if (json) return json;

	if (
		/^(?:diff --git |Index: |---\s+\S+\n\+\+\+\s+\S+)/m.test(text) &&
		/^@@\s/m.test(text)
	)
		return "diff";
	if (
		/^<!doctype html>|^<html(?:\s|>)/i.test(text) ||
		/<\/?(?:div|main|section|script|style|body|head)(?:\s|>)/i.test(text)
	) {
		return "html";
	}
	if (/^<\?xml\s/i.test(text)) return "xml";

	const scores: Array<[string, number]> = [
		[
			"typescript",
			countMatches(text, [
				/\b(?:interface|namespace|enum)\s+[A-Za-z_$]/,
				/\btype\s+[A-Za-z_$][\w$]*\s*=/,
				/\b(?:string|number|boolean|unknown|never)\[?\]?\s*[;,)=]/,
				/\bas\s+const\b/,
				/\b(?:implements|keyof|typeof)\b/,
			]),
		],
		[
			"javascript",
			countMatches(text, [
				/\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=/,
				/\b(?:async\s+)?function\s+[A-Za-z_$]/,
				/=>/,
				/\b(?:import|export)\s+(?:default\s+|\{?|\*)/,
				/\bconsole\.(?:log|error|warn)\s*\(/,
			]),
		],
		[
			"python",
			countMatches(text, [
				/^\s*(?:async\s+)?def\s+\w+\s*\([^)]*\)\s*(?:->\s*[^:]+)?:/m,
				/^\s*class\s+\w+(?:\([^)]*\))?:/m,
				/^\s*(?:from\s+\S+\s+import|import\s+\S+)/m,
				/^\s+return\s+f?["']/m,
				/\b(?:None|True|False)\b/,
			]),
		],
		[
			"rust",
			countMatches(text, [
				/\bfn\s+\w+\s*\([^)]*\)\s*(?:->\s*[^{]+)?\{/,
				/\blet\s+mut\s+\w+/,
				/\b(?:impl|trait|pub\s+(?:struct|enum|fn)|use\s+\w+::)/,
				/\b(?:Some|None|Ok|Err)\s*\(/,
			]),
		],
		[
			"go",
			countMatches(text, [
				/^package\s+\w+/m,
				/\bfunc\s+(?:\([^)]*\)\s*)?\w+\s*\(/,
				/\b(?:chan|defer|goroutine|go\s+func)\b/,
				/:=/,
			]),
		],
		[
			"java",
			countMatches(text, [
				/\bpublic\s+(?:final\s+)?class\s+\w+/,
				/\bpublic\s+static\s+void\s+main\s*\(/,
				/^\s*package\s+[\w.]+;/m,
				/^\s*import\s+java\./m,
			]),
		],
		[
			"sql",
			countMatches(text, [
				/\bSELECT\b[\s\S]+\bFROM\b/i,
				/\b(?:INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i,
				/\b(?:CREATE|ALTER)\s+(?:TABLE|VIEW|INDEX)\b/i,
				/\b(?:JOIN|GROUP\s+BY|ORDER\s+BY)\b/i,
			]),
		],
		[
			"bash",
			countMatches(text, [
				/^\s*(?:export\s+)?[A-Z_][A-Z0-9_]*=/m,
				/^\s*(?:if|for|while)\s+.*;?\s*(?:then|do)\b/m,
				/\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/,
				/^\s*(?:case\s+.+\s+in|function\s+\w+|\w+\s*\(\)\s*\{)/m,
			]),
		],
	];

	scores.sort((left, right) => right[1] - left[1]);
	const [bestLanguage, bestScore] = scores[0] ?? [undefined, 0];
	const secondScore = scores[1]?.[1] ?? 0;
	if (
		bestLanguage &&
		bestScore >= 2 &&
		(bestScore >= 3 || bestScore > secondScore)
	)
		return bestLanguage;

	const yamlLines = text
		.split("\n")
		.filter((line) => /^\s*[A-Za-z_][\w.-]*:\s*(?:\S.*)?$/.test(line));
	if (!/[{};]/.test(text) && yamlLines.length >= 2) return "yaml";

	const tomlAssignments = text
		.split("\n")
		.filter((line) => /^\s*[A-Za-z_][\w.-]*\s*=\s*.+$/.test(line));
	if (/^\s*\[[\w.-]+\]\s*$/m.test(text) && tomlAssignments.length >= 1)
		return "toml";

	if (
		/^[.#]?[A-Za-z][\w\s.#:[\]="'-]*\{[\s\S]*\b[-\w]+\s*:\s*[^;{}]+;/m.test(
			text,
		)
	)
		return "css";
	return undefined;
}

export function inferLanguageFromCommand(
	command: string | undefined,
): string | undefined {
	if (!command) return undefined;
	const lower = command.toLowerCase();

	if (/\bgit\s+(?:diff|show\b[^\n]*--patch)/.test(lower)) return "diff";
	if (/\b(?:jq|json_pp)\b|\bpython\S*\s+-m\s+json\.tool\b/.test(lower))
		return "json";
	if (/(?:--output|-o)(?:=|\s+)json\b/.test(lower)) return "json";
	if (/(?:--output|-o)(?:=|\s+)ya?ml\b/.test(lower)) return "yaml";

	const pathPattern =
		/(?:^|[\s'"=])([^\s'"|;&<>]+\.(?:bash|c|cc|cjs|cpp|cs|css|diff|exs?|go|h|hcl|hpp|html?|java|jsx?|json5?|jsonc|kts?|mdx?|mjs|php|proto|py|rb|rs|scss|sh|sql|svelte|swift|tf|toml|tsx?|vue|xml|ya?ml|zsh))(?=$|[\s'"|;&<>])/gi;
	let language: string | undefined;
	for (const match of command.matchAll(pathPattern)) {
		language = languageFromPath(match[1]);
	}
	return language;
}

export function resolveLanguage(
	code: string,
	fenceInfo?: string,
	hint?: string,
): ResolvedLanguage {
	const explicitLabel = cleanLanguageLabel(fenceInfo ?? "");
	if (explicitLabel && PLAIN_TEXT_LABELS.has(explicitLabel)) {
		return {
			language: undefined,
			label: explicitLabel === "txt" ? "text" : explicitLabel,
			source: "explicit",
		};
	}
	if (explicitLabel && !GENERIC_CODE_LABELS.has(explicitLabel)) {
		const language = normaliseLanguage(explicitLabel);
		return { language, label: language ?? explicitLabel, source: "explicit" };
	}

	const hintedLanguage = normaliseLanguage(hint);
	if (hintedLanguage)
		return { language: hintedLanguage, label: hintedLanguage, source: "hint" };

	const inferredLanguage = inferLanguage(code);
	if (inferredLanguage)
		return {
			language: inferredLanguage,
			label: inferredLanguage,
			source: "inferred",
		};

	return {
		language: undefined,
		label: explicitLabel ?? "code",
		source: "none",
	};
}
