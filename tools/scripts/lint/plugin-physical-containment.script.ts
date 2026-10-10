#!/usr/bin/env bun
/**
 * plugin-physical-containment.script.ts — no NEW lexical-only path
 * resolution in plugin code, as a burn-down ratchet (x00544 S1).
 *
 * Core's file primitives are physical: `fsRead`, `fsWrite` and
 * `resolveWorkspaceContainedEffective` compare the `realpath` of the
 * target with the `realpath` of each authorized root, so a symlink that
 * points out of the workspace is refused. The lexical resolver alone
 * never touches the disk: `workspace/link/config` passes when `link`
 * points at `~/.ssh`. Measured on 2026-09-15: 36 calls in 26 files across
 * 17 plugins still resolve their path arguments with the lexical check
 * alone, docs and deps among them.
 *
 * Migrating all of them is S2/S3. This gate makes sure the number only
 * falls: a JSON baseline records today's count per file, and the lint
 * fails when a file's count RISES or a new file starts calling the
 * lexical resolver. Growing the baseline needs `--allow-baseline-growth`
 * and a `--reason`, through the shared helper; shrinking never does.
 *
 * Usage:
 *   bun tools/scripts/lint/plugin-physical-containment.script.ts            # check
 *   bun tools/scripts/lint/plugin-physical-containment.script.ts --update   # rewrite baseline
 *   bun tools/scripts/lint/plugin-physical-containment.script.ts --report   # counts only
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';
import {
	countBaselineGrowth,
	refuseBaselineGrowth,
} from './baseline-growth.helper';

const BASELINE_REL =
	'tools/scripts/lint/plugin-physical-containment.baseline.json';

/**
 * A call to the lexical resolver, under either of its names. The physical
 * `resolveWorkspaceContainedEffective` does not match: its name continues
 * past `Contained` before the parenthesis.
 */
const LEXICAL_CALL = /\bresolveWorkspaceContained(?:Lexical)?\s*\(/gu;

const isSourceFile = (rel: string): boolean =>
	rel.endsWith('.ts') &&
	!rel.endsWith('.spec.ts') &&
	!rel.endsWith('.test.ts') &&
	!rel.endsWith('.d.ts');

/** How many lexical-only resolutions one source text performs. */
export const countLexicalContainment = (source: string): number =>
	source.match(LEXICAL_CALL)?.length ?? 0;

const walk = (root: string, absDir: string, out: string[]): void => {
	for (const entry of readdirSync(absDir, { withFileTypes: true })) {
		if (entry.name.startsWith('.') || entry.name === 'node_modules') {
			continue;
		}
		const abs = join(absDir, entry.name);
		if (entry.isDirectory()) walk(root, abs, out);
		else if (entry.isFile()) {
			const rel = relative(root, abs).split('\\').join('/');
			if (isSourceFile(rel)) out.push(rel);
		}
	}
};

/** `{ relPath: count }` for every plugin source file that resolves lexically. */
export const scanLexicalContainment = (
	root: string,
): Record<string, number> => {
	const pluginsAbs = join(root, 'plugins');
	if (!existsSync(pluginsAbs)) return {};
	const files: string[] = [];
	for (const plugin of readdirSync(pluginsAbs, { withFileTypes: true })) {
		if (!plugin.isDirectory()) continue;
		const srcAbs = join(pluginsAbs, plugin.name, 'src');
		if (existsSync(srcAbs)) walk(root, srcAbs, files);
	}
	const result: Record<string, number> = {};
	for (const rel of files.sort()) {
		const n = countLexicalContainment(
			readFileSync(join(root, rel), 'utf8'),
		);
		if (n > 0) result[rel] = n;
	}
	return result;
};

const loadBaseline = (root: string): Record<string, number> => {
	const abs = join(root, BASELINE_REL);
	if (!existsSync(abs)) return {};
	return JSON.parse(readFileSync(abs, 'utf8')) as Record<string, number>;
};

const total = (counts: Readonly<Record<string, number>>): number =>
	Object.values(counts).reduce((a, b) => a + b, 0);

const main = (): number => {
	const root = repoRoot();
	const args = new Set(process.argv.slice(2));
	const current = scanLexicalContainment(root);

	if (args.has('--update')) {
		// The first baseline records today's floor; only an existing one
		// can grow, and growth needs an explicit, reasoned flag.
		const refusal = !existsSync(join(root, BASELINE_REL))
			? undefined
			: refuseBaselineGrowth({
					gate: 'plugin-physical-containment',
					growth: countBaselineGrowth(current, loadBaseline(root)),
					argv: process.argv.slice(2),
				});
		if (refusal !== undefined) {
			process.stderr.write(refusal);
			return 1;
		}
		writeFileSync(
			join(root, BASELINE_REL),
			`${JSON.stringify(current, null, '\t')}\n`,
			'utf8',
		);
		process.stderr.write(
			`plugin-physical-containment: baseline updated — ${Object.keys(current).length} files, ${total(current)} lexical-only call(s).\n`,
		);
		return 0;
	}

	const baseline = loadBaseline(root);
	if (args.has('--report')) {
		process.stderr.write(
			`plugin-physical-containment: ${Object.keys(current).length} files / ${total(current)} lexical-only call(s) (baseline ${total(baseline)}).\n`,
		);
		return 0;
	}

	const regressions = Object.entries(current)
		.filter(([rel, count]) => count > (baseline[rel] ?? 0))
		.map(
			([rel, count]) =>
				`  ${rel}: ${count} lexical-only resolution(s) (baseline ${baseline[rel] ?? 0})`,
		);
	if (regressions.length > 0) {
		process.stderr.write(
			`✖ plugin-physical-containment: ${regressions.length} file(s) added path resolution that a symlink can escape:\n${regressions.join('\n')}\n\n` +
				'  Readers: resolveExistingWorkspaceContained / resolveWorkspaceContainedEffective.\n' +
				'  Writers: fsWrite, or the lexical check followed by realpathContained.\n',
		);
		return 1;
	}
	const before = total(baseline);
	const now = total(current);
	process.stderr.write(
		now < before
			? `✓ plugin-physical-containment: no new lexical-only resolution; debt shrank ${before} → ${now}. Run --update to lock in the win.\n`
			: `✓ plugin-physical-containment: no new lexical-only resolution (${now} baselined).\n`,
	);
	return 0;
};

if (import.meta.main) process.exit(main());
