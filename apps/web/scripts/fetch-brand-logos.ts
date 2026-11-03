#!/usr/bin/env bun
/**
 * fetch-brand-logos.ts — fetch each project's official brand
 * asset (favicon / logo SVG) and copy it to the web app's
 * `apps/web/public/logos/` directory.
 *
 * Why this exists (follow-up to x00010):
 *   x00010 used the local `simple-icons` package, but most
 *   simple-icons marks are wordmarks (the literal project name
 *   spelled out in text), not icon-style marks. The user
 *   feedback after x00010: "los logos no son los logos reales
 *   de nada... son simplemente svgs con colores, no con los
 *   logotipos de cada framework. Descargalos de donde
 *   corresponda".
 *
 *   So this follow-up goes to the source. We hit each project's
 *   official site for `<link rel="icon">` and download the
 *   first match. SVG when the project ships one (npm, pnpm,
 *   yarn, bun, deno, vscode, cursor), PNG/ICO when it doesn't
 *   (github, node, typescript, zed, claude, antigravity,
 *   windsurf).
 *
 *   Sources tried, in order, until one returns a real image:
 *     1. the project's official marketing site
 *     2. the project's GitHub repo (raw URLs)
 *     3. simple-icons as a last resort
 *
 *   We validate every download by sniffing the magic bytes
 *   (PNG, ICO, or SVG). Anything else (HTML redirect pages,
 *   gzip bodies) is rejected. The output filename uses the
 *   format that came back (`<base>.svg`, `<base>.png`, or
 *   `<base>.ico`). The Install page renders them as
 *   `<img src>` and the browser picks the right format.
 *
 *   Idempotent: tracks which files were written this run and
 *   removes any `<base>.<other-ext>` left over from a previous
 *   source change (e.g. a leftover `.svg` when the source now
 *   serves a `.png`).
 *
 * Usage: `bun run fetch:logos` from `apps/web/`.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { refreshLogos } from './lib/brand-logo-refresh';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT = join(SCRIPT_DIR, '..', 'public/logos');

const BRANDS: ReadonlyArray<{
	readonly outName: string;
	readonly sources: ReadonlyArray<string>;
}> = [
	{
		outName: 'npm',
		// npmjs.com is behind Cloudflare; the npm/logos GitHub repo is
		// the official mirror. The square "n" is the icon-style mark.
		sources: [
			'https://raw.githubusercontent.com/npm/logos/master/npm%20square/n.svg',
			'https://raw.githubusercontent.com/npm/logos/master/npm%20square/n-large.png',
		],
	},
	{
		outName: 'pnpm',
		sources: [
			'https://pnpm.io/img/pnpm-no-name-with-frame.svg',
			'https://pnpm.io/img/pnpm-symbol.svg',
		],
	},
	{
		outName: 'yarn',
		sources: ['https://yarnpkg.com/img/yarn-favicon.svg'],
	},
	{
		outName: 'bun',
		sources: ['https://bun.sh/logo.svg'],
	},
	{
		outName: 'deno',
		sources: ['https://deno.com/logo.svg'],
	},
	{
		outName: 'node',
		sources: ['https://nodejs.org/static/images/favicons/favicon.png'],
	},
	{
		outName: 'typescript',
		sources: ['https://www.typescriptlang.org/favicon-32x32.png'],
	},
	{
		outName: 'git',
		sources: [
			'https://git-scm.com/images/logos/downloads/Git-Icon-1788C.svg',
		],
	},
	{
		outName: 'github',
		sources: ['https://github.com/fluidicon.png'],
	},
	{
		outName: 'modelcontextprotocol',
		sources: [
			'https://modelcontextprotocol.io/mintlify-assets/_mintlify/favicons/mcp/ebiVJzri-bsiCfVZ/_generated/favicon/android-chrome-192x192.png',
		],
	},
	{
		outName: 'ide-cursor',
		sources: ['https://cursor.sh/marketing-static/favicon.svg'],
	},
	{
		outName: 'ide-claude',
		sources: ['https://claude.ai/favicon.ico'],
	},
	{
		outName: 'ide-claude-code',
		// Claude Code's product-specific icon lives behind the
		// Mintlify CDN and a Cloudflare JS challenge — both reject
		// plain `fetch` calls (returns an HTML SPA shell, magic
		// bytes `<` not `<svg`, so our sniff correctly rejects it).
		// We fall back to the Claude brand mark from claude.ai,
		// which is the real Anthropic logo rendered as an ICO.
		sources: [
			'https://claude.ai/favicon.ico',
			'https://www.anthropic.com/favicon.ico',
		],
	},
	{
		outName: 'ide-claude-desktop',
		// Same situation as `ide-claude-code` — the Claude Desktop
		// product icon is gated behind Cloudflare. Fall back to the
		// Claude brand mark.
		sources: [
			'https://claude.com/favicon.ico',
			'https://www.anthropic.com/favicon.ico',
		],
	},
	{
		outName: 'ide-vscode',
		sources: [
			'https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/workbench/browser/media/code-icon.svg',
		],
	},
	{
		outName: 'ide-windsurf',
		// codeium.com/windsurf/* is behind Cloudflare and serves an
		// HTML redirect page (Content-Type: text/html) for every
		// URL — our magic-byte sniff correctly rejects those.
		// The windsurf.com subdomain's /favicon.ico serves the
		// real WindSurf brand mark without the Cloudflare gate.
		sources: [
			'https://www.windsurf.com/favicon.ico',
			'https://codeium.com/favicon.ico',
		],
	},
	{
		outName: 'ide-zed',
		sources: ['https://zed.dev/favicon_black_32.png'],
	},
	{
		outName: 'ide-antigravity',
		// Antigravity ships only an ICO. The server returns
		// Content-Encoding: gzip with Content-Type: image/x-icon;
		// Bun's fetch transparently decompresses, so we land on
		// the raw ICO bytes (magic 00 00 01 00).
		sources: ['https://antigravity.google/favicon.ico'],
	},
];

await refreshLogos(BRANDS, OUT);
