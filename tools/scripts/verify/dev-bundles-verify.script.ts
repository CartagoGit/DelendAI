#!/usr/bin/env bun
/**
 * dev-bundles-verify.script.ts — a00058 (delivery_verifier gate).
 *
 * `bun run dev:ide` / `dev:vscode` render the dashboard/webviews with
 * mock data in a real browser via `Bun.build({ target: 'browser' })` —
 * the only way anyone (agent or user) can visually check a UI change
 * before calling it done. That build was silently broken: a transitive
 * dependency (`cross-spawn`, reached through `@mcp-vertex/client`'s
 * `McpStdioClient` export) does an old-style bare `require('child_process')`
 * that slips past the `external: ['node:*', ...]` glob, so both preview
 * commands crashed with "Browser build cannot require() Node.js
 * builtin" and nobody could actually look at the rendered output —
 * which is exactly how proposal `Files:` drift (a00057) and visual
 * regressions go unnoticed for a long time.
 *
 * This demonstrates, end-to-end, that both dev-preview entrypoints
 * still bundle clean for the browser target using the real repo tree
 * (Bun's actual workspace resolver — not a fixture), the same way
 * `cache-eviction-verify` demonstrates a real eviction pass.
 *
 * Architecture: pure engine (`verifyDevBundles`) + formatter
 * (`formatReport`) + CLI shell (`main`), same split as
 * `cache-eviction-verify.script.ts`.
 */
import { join } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';
import { scssPlugin } from '../compile/scss-plugin';
import { BROWSER_BUILD_EXTERNALS } from '../dev/browser-externals';

export interface IDevBundleEntry {
	readonly name: string;
	readonly entryAbs: string;
}

export interface IDevBundleFailure {
	readonly name: string;
	readonly messages: readonly string[];
}

export interface IDevBundlesVerifyResult {
	readonly ok: boolean;
	readonly entries: readonly IDevBundleEntry[];
	readonly failures: readonly IDevBundleFailure[];
}

const DEV_ENTRIES = (root: string): readonly IDevBundleEntry[] => [
	{
		name: 'ide',
		entryAbs: join(root, 'packages/ui-extension/src/dev/entry.ts'),
	},
	{
		name: 'vscode',
		entryAbs: join(root, 'extensions/vscode/src/dev/entry.ts'),
	},
];

/** Bun.build every dev-preview entry for the browser target; report failures. */
export const verifyDevBundles = async (
	root: string,
): Promise<IDevBundlesVerifyResult> => {
	const entries = DEV_ENTRIES(root);
	const failures: IDevBundleFailure[] = [];
	for (const entry of entries) {
		const result = await Bun.build({
			entrypoints: [entry.entryAbs],
			target: 'browser',
			format: 'esm',
			minify: false,
			plugins: [scssPlugin],
			external: [...BROWSER_BUILD_EXTERNALS],
			splitting: true,
		});
		if (!result.success) {
			failures.push({
				name: entry.name,
				messages: result.logs.map((l) => l.message),
			});
		}
	}
	return { ok: failures.length === 0, entries, failures };
};

const formatReport = (result: IDevBundlesVerifyResult): string => {
	if (result.ok) {
		return `✓ dev-bundles-verify: ${result.entries.length} dev-preview entr${result.entries.length === 1 ? 'y' : 'ies'} bundle clean for the browser target.\n`;
	}
	const lines = result.failures.map(
		(f) => `  ${f.name}:\n${f.messages.map((m) => `    ${m}`).join('\n')}`,
	);
	return (
		`✖ dev-bundles-verify: ${result.failures.length} dev-preview entr${result.failures.length === 1 ? 'y' : 'ies'} failed to bundle:\n${lines.join('\n')}\n\n` +
		`  If a new transitive dependency uses a bare (non "node:"-prefixed) Node builtin require, add it to BARE_NODE_BUILTINS in tools/scripts/dev/browser-externals.ts.\n`
	);
};

const main = async (): Promise<number> => {
	const result = await verifyDevBundles(repoRoot());
	process.stderr.write(formatReport(result));
	return result.ok ? 0 : 1;
};

if (import.meta.main) process.exit(await main());
