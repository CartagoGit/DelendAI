#!/usr/bin/env bun
/**
 * capability-matrix.script.ts — d00009 (Track F / security).
 *
 * Generate the readable capability matrix at
 * `docs/mcp-vertex/security/capability-matrix.md`. Rows are
 * plugins, columns are the canonical capabilities declared by
 * the `Capability` union (f00188). Each cell shows one of:
 *
 *   ✅ declared in manifest
 *   🟡 declared but not used (candidacy for removal)
 *   🔴 used but not declared (lint:capabilities violation)
 *   ⚪ not declared, not used
 *
 * The generator is a thin wrapper over the capability-declared
 * lint (c00137) + the manifest loader; the matrix is the human-
 * readable projection of the same data the lint audits.
 *
 * Privacy: no tool names leak — only `pluginId` and the canonical
 * capability tokens (R1.1).
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { CAPABILITIES, type Capability } from '@delendai/core/public';

import {
	detectUsageInSource,
	lintCapabilitiesDeclared,
	type ICapabilityLintViolation,
} from '../lint/capabilities-declared.script.ts';

const SECURITY_DIR = 'docs/mcp-vertex/security';
const MATRIX_REL = `${SECURITY_DIR}/capability-matrix.md`;

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit tests
// ---------------------------------------------------------------------------

export type CapabilityCell =
	| 'declared-used'
	| 'declared-unused'
	| 'used-undeclared'
	| 'absent';

const cellSymbol = (cell: CapabilityCell): string => {
	switch (cell) {
		case 'declared-used':
			return '✅';
		case 'declared-unused':
			return '🟡';
		case 'used-undeclared':
			return '🔴';
		case 'absent':
			return '⚪';
	}
};

export interface IPluginCapabilityRow {
	readonly pluginId: string;
	readonly cells: Readonly<Record<Capability, CapabilityCell>>;
}

export interface ICapabilityMatrix {
	readonly plugins: readonly IPluginCapabilityRow[];
	readonly capabilities: readonly Capability[];
	readonly summary: {
		readonly totalUniqueCapabilities: number;
		readonly topByCapabilityCount: readonly {
			readonly pluginId: string;
			readonly count: number;
		}[];
		readonly rareCapabilities: readonly Capability[];
	};
}

/**
 * Compute one row per plugin. A capability is "used" when the
 * lint's `detectUsageInSource` regex matches anywhere in the
 * plugin's source files, AND the matched token is part of the
 * canonical `Capability` union. Pure over its inputs.
 */
export const computeMatrix = (input: {
	readonly plugins: readonly {
		readonly id: string;
		readonly capabilities: readonly string[];
		readonly usage: readonly { readonly capability: string }[];
	}[];
}): ICapabilityMatrix => {
	const rows: IPluginCapabilityRow[] = input.plugins.map((plugin) => {
		const declared = new Set(
			plugin.capabilities.filter((c): c is Capability =>
				(CAPABILITIES as readonly string[]).includes(c),
			),
		);
		const used = new Set(
			plugin.usage
				.map((u) => u.capability)
				.filter((c): c is Capability =>
					(CAPABILITIES as readonly string[]).includes(c),
				),
		);
		const cells: Record<Capability, CapabilityCell> = {} as Record<
			Capability,
			CapabilityCell
		>;
		for (const cap of CAPABILITIES) {
			const isDeclared = declared.has(cap);
			const isUsed = used.has(cap);
			if (isDeclared && isUsed) cells[cap] = 'declared-used';
			else if (isDeclared && !isUsed) cells[cap] = 'declared-unused';
			else if (!isDeclared && isUsed) cells[cap] = 'used-undeclared';
			else cells[cap] = 'absent';
		}
		return { pluginId: plugin.id, cells };
	});

	const capabilityUsage = new Map<Capability, number>();
	for (const cap of CAPABILITIES) capabilityUsage.set(cap, 0);
	for (const row of rows) {
		for (const cap of CAPABILITIES) {
			if (
				row.cells[cap] === 'declared-used' ||
				row.cells[cap] === 'declared-unused'
			) {
				capabilityUsage.set(cap, (capabilityUsage.get(cap) ?? 0) + 1);
			}
		}
	}
	const topByCapabilityCount = [...rows]
		.map((row) => {
			const count = CAPABILITIES.filter(
				(c) =>
					row.cells[c] === 'declared-used' ||
					row.cells[c] === 'declared-unused',
			).length;
			return { pluginId: row.pluginId, count };
		})
		.sort((left, right) => right.count - left.count)
		.slice(0, 5);
	const rareCapabilities = CAPABILITIES.filter(
		(cap) => (capabilityUsage.get(cap) ?? 0) <= 2,
	);

	return {
		plugins: rows,
		capabilities: CAPABILITIES,
		summary: {
			totalUniqueCapabilities: CAPABILITIES.length,
			topByCapabilityCount,
			rareCapabilities,
		},
	};
};

/**
 * Render the matrix to Markdown. Pure.
 */
export const renderMatrix = (
	matrix: ICapabilityMatrix,
	options: { readonly generatedAt: string } = {
		generatedAt: new Date().toISOString().slice(0, 10),
	},
): string => {
	const lines: string[] = [];
	lines.push('# Capability Matrix');
	lines.push('');
	lines.push(
		`> Generated ${options.generatedAt} from plugin manifests + the \`lint:capabilities\` static analysis. ` +
			'Regenerate with `bun tools/scripts/gen/capability-matrix.script.ts`.',
	);
	lines.push('');
	lines.push(
		'Legend: ✅ declared & used · 🟡 declared but unused · 🔴 used but not declared · ⚪ absent',
	);
	lines.push('');

	// Main table — plugin rows × capability columns.
	const header = ['Plugin', ...matrix.capabilities];
	const separator = ['---', ...matrix.capabilities.map(() => '---')];
	lines.push(`| ${header.join(' | ')} |`);
	lines.push(`| ${separator.join(' | ')} |`);
	for (const row of matrix.plugins) {
		const cells = matrix.capabilities.map((cap) =>
			cellSymbol(row.cells[cap]),
		);
		lines.push(`| ${row.pluginId} | ${cells.join(' | ')} |`);
	}

	lines.push('');
	lines.push('## Summary');
	lines.push('');
	lines.push(
		`- Total unique capabilities: **${matrix.summary.totalUniqueCapabilities}**`,
	);
	lines.push('');
	lines.push('### Top 5 plugins by declared capability count');
	lines.push('');
	for (const entry of matrix.summary.topByCapabilityCount) {
		lines.push(`- \`${entry.pluginId}\` — ${entry.count}`);
	}
	lines.push('');
	if (matrix.summary.rareCapabilities.length > 0) {
		lines.push('### Rare capabilities (declared by ≤ 2 plugins)');
		lines.push('');
		for (const cap of matrix.summary.rareCapabilities) {
			lines.push(`- \`${cap}\``);
		}
		lines.push('');
	}
	return lines.join('\n');
};

// ---------------------------------------------------------------------------
// File-system adapters — kept here so the pure logic above stays pure
// ---------------------------------------------------------------------------

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);

const collectTsFiles = async (dir: string): Promise<string[]> => {
	const out: string[] = [];
	let entries: import('node:fs').Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...(await collectTsFiles(full)));
			continue;
		}
		if (!entry.isFile()) continue;
		const dot = entry.name.lastIndexOf('.');
		if (dot < 0) continue;
		if (TS_EXTENSIONS.has(entry.name.slice(dot))) out.push(full);
	}
	return out;
};

const collectUsageForPlugin = async (
	root: string,
	pluginDir: string,
): Promise<readonly { readonly capability: string }[]> => {
	const files = await collectTsFiles(join(root, pluginDir, 'src'));
	const usages: { readonly capability: string }[] = [];
	for (const abs of files) {
		const source = await readFile(abs, 'utf8').catch(() => null);
		if (source === null) continue;
		const rel = relative(root, abs);
		for (const usage of detectUsageInSource(source, rel)) {
			usages.push({ capability: usage.capability });
		}
	}
	return usages;
};

interface ICollectedPlugin {
	readonly id: string;
	readonly dir: string;
	readonly capabilities: readonly string[];
	readonly usage: readonly { readonly capability: string }[];
}

const collectPlugins = async (
	root: string,
): Promise<readonly ICollectedPlugin[]> => {
	const pluginsDir = join(root, 'plugins');
	let entries: import('node:fs').Dirent[];
	try {
		entries = await readdir(pluginsDir, { withFileTypes: true });
	} catch {
		return [];
	}
	const collected: ICollectedPlugin[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const manifestPath = join(pluginsDir, entry.name, 'plugin.manifest.ts');
		const source = await readFile(manifestPath, 'utf8').catch(() => null);
		if (source === null) continue;
		const capabilities = parseCapabilitiesFromSource(source);
		const usage = await collectUsageForPlugin(root, entry.name);
		collected.push({
			id: entry.name,
			dir: entry.name,
			capabilities,
			usage,
		});
	}
	return collected.sort((left, right) => left.id.localeCompare(right.id));
};

const parseCapabilitiesFromSource = (source: string): readonly string[] => {
	const match = /capabilities:\s*\[([^\]]*)\]/u.exec(source);
	if (match === null) return [];
	const inner = match[1] as string;
	return inner
		.split(',')
		.map((raw) =>
			raw
				.trim()
				.replace(/^['"]|['"]$/g, '')
				.replace(/\s+/g, ''),
		)
		.filter((token) => token.length > 0);
};

export const buildCapabilityMatrixMarkdown = async (
	root: string,
): Promise<{
	readonly markdown: string;
	readonly violations: readonly ICapabilityLintViolation[];
}> => {
	const plugins = await collectPlugins(root);
	const matrix = computeMatrix({ plugins });
	const markdown = renderMatrix(matrix);
	const violations = (await lintCapabilitiesDeclared(root)).violations;
	return { markdown, violations };
};

/**
 * Keep the previous `Generated <date>` stamp when the rest of the
 * document is byte-identical.
 *
 * A date-only rewrite is not drift: it says the generator ran, not that
 * anything changed. Treating it as drift made the pre-push gate fail
 * every time the clock crossed midnight.
 */
export const preserveStampIfUnchanged = (
	previous: string,
	next: string,
): string => {
	const stamp = /(> Generated )\d{4}-\d{2}-\d{2}( from )/;
	const previousStamp = previous.match(stamp);
	if (previousStamp === null) return next;
	const normalize = (text: string): string =>
		text.replace(stamp, '$1<<date>>$2');
	return normalize(previous) === normalize(next) ? previous : next;
};

const writeMatrix = async (
	root: string,
): Promise<{
	readonly path: string;
	readonly violations: readonly ICapabilityLintViolation[];
}> => {
	const { markdown, violations } = await buildCapabilityMatrixMarkdown(root);
	const abs = join(root, MATRIX_REL);
	await mkdir(join(root, SECURITY_DIR), { recursive: true });
	// The header carries a `Generated <date>` stamp, so a regeneration on a
	// later day rewrote the file even when nothing about the capabilities
	// had changed. `gen-all --check` gates `git push` with a raw
	// `git diff --exit-code`, so a date rollover alone blocked every push
	// until someone committed a one-line date bump. Keep the existing stamp
	// whenever the substance is identical.
	const previous = await readFile(abs, 'utf8').catch(() => '');
	await writeFile(abs, preserveStampIfUnchanged(previous, markdown), 'utf8');
	return { path: abs, violations };
};

const main = async (): Promise<number> => {
	const root = process.cwd();
	const result = await writeMatrix(root);
	const violationCount = result.violations.length;
	console.log(
		`✓ capability-matrix: wrote ${result.path} with ${violationCount} lint:capabilities violation(s).`,
	);
	return 0;
};

if (import.meta.main) {
	process.exit(await main());
}
