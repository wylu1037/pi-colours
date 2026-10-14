import { describe, expect, it } from "vitest";
import {
  inferLanguage,
  inferLanguageFromCommand,
  languageFromPath,
  normaliseLanguage,
  resolveLanguage,
} from "../src/languages.ts";

describe("language labels", () => {
  it("normalises common fence aliases and attributes", () => {
    expect(normaliseLanguage("tsx title=app.tsx")).toBe("typescript");
    expect(normaliseLanguage("{.py}")).toBe("python");
    expect(normaliseLanguage("c++")).toBe("cpp");
  });

  it("gets languages from paths and special file names", () => {
    expect(languageFromPath("src/view.tsx")).toBe("typescript");
    expect(languageFromPath("Dockerfile")).toBe("dockerfile");
    expect(languageFromPath("README")).toBeUndefined();
  });
});

describe("language inference", () => {
  it("detects structured and source-code output", () => {
    expect(inferLanguage('{"name":"pi","enabled":true}')).toBe("json");
    expect(
      inferLanguage(
        "def greet(name: str) -> str:\n    return f'Hello, {name}'\n\nprint(greet('Pi'))",
      ),
    ).toBe("python");
    expect(
      inferLanguage(
        "interface User { name: string }\ntype UserId = string;\nconst id = 'pi' as const;",
      ),
    ).toBe("typescript");
  });

  it("does not color normal prose", () => {
    expect(
      inferLanguage(
        "This is a normal sentence. It has no source-code structure.",
      ),
    ).toBeUndefined();
  });

  it("uses conservative command hints", () => {
    expect(inferLanguageFromCommand("cat src/server.rs")).toBe("rust");
    expect(inferLanguageFromCommand("kubectl get pod -o yaml")).toBe("yaml");
    expect(inferLanguageFromCommand("printf 'hello'")).toBeUndefined();
  });
});

describe("language resolution", () => {
  it("gives an explicit fence priority", () => {
    expect(resolveLanguage("const value = 1;", "js", "python")).toEqual({
      language: "javascript",
      label: "javascript",
      source: "explicit",
    });
  });

  it("keeps explicitly plain blocks plain", () => {
    expect(resolveLanguage('{"valid":"json"}', "text")).toEqual({
      language: undefined,
      label: "text",
      source: "explicit",
    });
  });

  it("infers a language for an unlabeled fence", () => {
    expect(resolveLanguage('#!/usr/bin/env bash\necho "$HOME"')).toEqual({
      language: "bash",
      label: "bash",
      source: "inferred",
    });
  });
});
