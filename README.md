<div align="center">

# Pi Colours

**Compact Markdown and active-theme syntax colors for [Pi](https://pi.dev).**

[![npm version](https://img.shields.io/npm/v/pi-colours?color=cb3837)](https://www.npmjs.com/package/pi-colours)
[![Pi package](https://img.shields.io/badge/pi-package-8abeb7)](https://pi.dev/packages/pi-colours)
[![CI](https://github.com/kevinpita/pi-colours/actions/workflows/ci.yml/badge.svg)](https://github.com/kevinpita/pi-colours/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-5f87ff)](LICENSE)

</div>

Pi Colours makes assistant messages, user Markdown, code blocks, and source-like Bash results easier to scan. It uses the active Pi theme. It does not force a dark or light palette.

## Preview

### Dark Pi theme

![Pi Colours with the dark Pi theme](docs/assets/pi-colours-dark.png)

### Light Pi theme

![Pi Colours with the light Pi theme](docs/assets/pi-colours-light.png)

The screenshots use the real Pi Markdown component and syntax highlighter. The preview includes compact Markdown and Go syntax colors for keywords, strings, and comments.

## Install

Install from npm:

```bash
pi install npm:pi-colours
```

Or test the GitHub release without installation:

```bash
pi -e git:github.com/kevinpita/pi-colours@v0.1.0
```

Restart Pi after installation. Use `/reload` after you change a local copy.

## Try the built-in preview

Run this command in Pi:

```text
/colours-preview
```

The preview shows:

- compact Markdown headings;
- links, emphasis, lists, quotes, and inline code;
- labeled TypeScript and Go code;
- automatic Python language detection;
- dark or light colors from the active Pi theme.

Press Enter or Esc to close it.

## What changes

| Output | Pi Colours behavior |
| --- | --- |
| Markdown headings | Uses compact `▌`, `▸`, `•`, and `·` markers. |
| Fenced code | Uses a clean language frame instead of raw backticks. |
| Labeled code | Supports aliases such as `ts`, `tsx`, `py`, `sh`, `yml`, `c++`, and `c#`. |
| Unlabeled code | Detects a language only when the code has a clear structure. |
| Bash results | Adds syntax colors when the command or output gives a safe language hint. |
| Normal text | Keeps prose and normal command output plain. |

Pi already gives syntax colors to `read` and `write` previews and semantic colors to diffs. Pi Colours keeps that behavior.

## Theme support

Pi Colours calls the syntax color functions from the active Pi theme. Select a theme with `/settings`.

For the best result, a custom theme must give different values to these Pi tokens:

- `syntaxComment`
- `syntaxKeyword`
- `syntaxFunction`
- `syntaxVariable`
- `syntaxString`
- `syntaxNumber`
- `syntaxType`
- `syntaxOperator`
- `syntaxPunctuation`

If these tokens use the same color, code will look monochrome.

## Highlighter choice

Pi 0.83 uses `highlight.js` in its Markdown renderer. Pi Colours uses this engine because it:

- runs synchronously in the TUI;
- supports many languages;
- uses the active Pi theme;
- does not need grammar downloads or native modules.

Tree-sitter needs many grammar files and a separate token-to-theme layer. TextMate and Shiki add a large fixed-theme system. They do not give a clear benefit for this terminal extension.

## Coverage and limits

Pi Colours changes the shared Pi `Markdown` component. It applies to:

- assistant Markdown;
- user Markdown;
- Pi components and extension results that use `Markdown`.

It also replaces the built-in Bash display renderer. It does not change Bash execution.

The public Pi API has no global renderer hook for plain results from every third-party tool. A third-party tool that uses its own `Text` component keeps its own display. That tool can use Pi's exported `highlightCode()` function.

Pi Colours patches one private method in the Pi TUI `Markdown` class because Pi has no public hook for standard assistant and user renderers. The extension checks that the method exists. If a later Pi version changes it, Pi Colours shows a warning and does not change message data.

## Security

Pi extensions run with full user permissions. Review extension code before installation.

Pi Colours does not use the network, read project files, write project files, or start a background process. Its Bash override delegates execution to Pi's original Bash tool.

## Development

Requirements:

- Pi 0.83 or later
- Node.js 22.19 or later
- Chromium only when you regenerate screenshots

Run all checks:

```bash
npm install
npm run check
npm test
npm pack --dry-run
```

Regenerate the dark and light screenshots:

```bash
npm run screenshots
```

## License

[MIT](LICENSE)
