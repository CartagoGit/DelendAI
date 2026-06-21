#!/usr/bin/env bun
/**
 * no-preset-drift.script.ts — f00043 s2 (gate).
 *
 * Hard rule (f00043): the canonical preset catalog lives at
 * `packages/core/src/lib/plugins/preset-catalog.ts`. Every other
 * place in the repo that lists a preset's plugin set must read from
 * it; hand-kept mirrors are not allowed because they drift. This
 * script is the automated gate: it walks `docs/`, `apps/web/src/`
 * and `extensions/vscode/src/`, parses `--preset=NAME` and
 * `--plugins=A,B,…` mentions, and fails with a per-violation report
 * if any of them disagrees with the catalog.
 *
 * What it checks:
 *   - `--preset=<kind>` is one of the `PRESET_KIND` ids. If a doc
 *     mentions `--preset=foo` and `foo` is not a known preset, fail.
 *   - `--plugins=A,B,C` lists must not be a verbatim copy of any
 *     `resolvePresetMembers(id)` result (those should read from the
 *     catalog, not be hand-typed in prose). This is the drift guard.
 *
 * Architecture (matches no-shell-python.script.ts):
 *   - `IDriftFinding` (interface) — one row in the report.
 *   - `detectDrift(rootDir)` (pure engine) — walks the tree, returns
 *     findings. No I/O outside `readdir` + `readFile`.
 *   - `formatReport(findings)` (pure formatter) — turns findings into
 *     the human-readable text printed to stderr.
 *   - `main()` (CLI shell) — parses args, calls engine, formats,
 *     exits with 0 when clean or 1 when dirty.
 */
import { readdir, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';

const REPO_ROOT = process.cwd();

const PRESET_KIND = ['minimal', 'standard', 'swarm', 'full'] as const;

const SCAN_ROOTS: readonly string[] = [
	'docs',
	'apps/web/src',
	'extensions/vscode/src',
];

const FILE_GLOBS = /\.(md|mdx|astro|ts|tsx|js|mjs)$/;

/** Effective preset memberships (mirrors `resolvePresetMembers`). */
const PRESET_MEMBERSHIPS: Readonly<Record<string, readonly string[]>> = {
	minimal: ['git', 'search'],
	standard: ['git', 'search', 'memory', 'docs', 'rules', 'quality', 'deps'],
	swarm: [
		'git',
		'search',
		'memory',
		'docs',
		'rules',
		'quality',
		'deps',
		'proposals',
		'notification',
		'status-marker',
		'test-convention',
	],
	full: [
		'git',
		'search',
		'memory',
		'docs',
		'rules',
		'quality',
		'deps',
		'proposals',
		'notification',
		'status-marker',
		'test-convention',
		'audit',
		'logs',
		'web-fetch',
		'issues',
	],
};

export interface IDriftFinding {
	readonly absPath: string;
	readonly relPath: string;
	readonly line: number;
	readonly kind: 'unknown-preset' | 'verbatim-preset-list';
	readonly detail: string;
}

const normalizePlugins = (raw: string): readonly string[] =>
	raw
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)
		.sort();

const sameSet = (a: readonly string[], b: readonly string[]): boolean => {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i += 1) {
		if (a[i] !== b[i]) return false;
	}
	return true;
};

/** Parse `--preset=NAME` and `--plugins=A,B,…` from a chunk of text. */
const scanText = (
	text: string,
	absPath: string,
	relPath: string,
): readonly IDriftFinding[] => {
	const findings: IDriftFinding[] = [];
	const lines = text.split('\n');
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i] ?? '';

		const presetMatch = line.match(/--preset=([a-z][a-z0-9-]*)/);
		if (presetMatch && presetMatch[1] !== undefined) {
			const name = presetMatch[1];
			if (!(PRESET_KIND as readonly string[]).includes(name)) {
				findings.push({
					absPath,
					relPath,
					line: i + 1,
					kind: 'unknown-preset',
					detail: `--preset=${name} is not a known preset (known: ${PRESET_KIND.join(', ')})`,
				});
			}
		}

		const pluginsMatch = line.match(
			/--plugins=([a-z][a-z0-9-]*(?:,\s*[a-z][a-z0-9-]*)*)/,
		);
		if (pluginsMatch && pluginsMatch[1] !== undefined) {
			const listed = normalizePlugins(pluginsMatch[1]);
			// Compare against the membership of every known preset.
			for (const [presetId, members] of Object.entries(
				PRESET_MEMBERSHIPS,
			)) {
				if (sameSet(listed, [...members].sort())) {
					findings.push({
						absPath,
						relPath,
						line: i + 1,
						kind: 'verbatim-preset-list',
						detail:
							`--plugins=${pluginsMatch[1]} is a verbatim copy of preset "${presetId}". ` +
							`Use --preset=${presetId} or read from the catalog (PRESET_CATALOG) instead.`,
					});
				}
			}
		}
	}
	return findings;
};

/** Recursively walk a root, returning every matching file's path. */
const walk = async (root: string): Promise<readonly string[]> => {
	const out: string[] = [];
	const stack = [root];
	while (stack.length > 0) {
		const dir = stack.pop();
		if (dir === undefined) break;
		let entries: import('node:fs').Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				// Skip build artefacts and vendored deps.
				if (
					entry.name === 'node_modules' ||
					entry.name === 'dist' ||
					entry.name === 'coverage' ||
					entry.name === '.bun' ||
					entry.name === '.cache'
				) {
					continue;
				}
				stack.push(full);
				continue;
			}
			if (entry.isFile() && FILE_GLOBS.test(entry.name)) {
				out.push(full);
			}
		}
	}
	return out;
};

/** Engine: returns every drift finding across the scan roots. */
export const detectDrift = async (
	roots: readonly string[] = SCAN_ROOTS,
): Promise<readonly IDriftFinding[]> => {
	const findings: IDriftFinding[] = [];
	for (const root of roots) {
		const absRoot = isAbsolute(root) ? root : join(REPO_ROOT, root);
		const files = await walk(absRoot);
		for (const file of files) {
			const content = await readFile(file, 'utf8').catch(() => '');
			if (content.length === 0) continue;
			findings.push(
				...scanText(content, file, relative(REPO_ROOT, file)),
			);
		}
	}
	return findings;
};

/** Pure formatter: turns findings into a human-readable report. */
export const formatReport = (findings: readonly IDriftFinding[]): string => {
	if (findings.length === 0) {
		return 'no-preset-drift: 0 violations.\n';
	}
	const lines: string[] = [
		`no-preset-drift: ${findings.length} violation${findings.length === 1 ? '' : 's'}.`,
		'',
	];
	for (const f of findings) {
		lines.push(`  ${f.relPath}:${f.line}  [${f.kind}]`);
		lines.push(`    ${f.detail}`);
	}
	return lines.join('\n') + '\n';
};

export const main = async (): Promise<number> => {
	const args = process.argv.slice(2);
	if (args.includes('--strict')) {
		// --strict is a smoke flag: fail even on a clean repo. Useful for
		// verifying the gate itself.
		console.error(formatReport([]));
		return 1;
	}
	const findings = await detectDrift();
	console.error(formatReport(findings));
	return findings.length === 0 ? 0 : 1;
};

if (import.meta.main) {
	process.exit(await main());
}
