#!/usr/bin/env bun
/**
 * Clean build driver (x00531 S2).
 *
 * Removes every per-package `dist/` under `packages/*` and `plugins/*`
 * and then runs the normal build. A clean tree is the case the ordinary
 * incremental build never exercises: a stale `dist/` from a previous run
 * masks a wrong build order (a package can consume a dependency's
 * leftover output even when that dependency has not been rebuilt yet),
 * so only a wiped tree actually proves the order in `build-graph.ts`.
 *
 * Usage: `bun tools/scripts/compile/build-clean.script.ts [pkgDir ...]`.
 */
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WORKSPACE_GROUPS } from './build-graph';
import { main as buildMain } from './build.script';

const findRepoRoot = (start: string): string => {
	let current = start;
	for (let i = 0; i < 8; i++) {
		if (
			existsSync(join(current, 'delendai.config.json')) ||
			existsSync(join(current, '.git'))
		) {
			return current;
		}
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	return join(start, '..', '..');
};

export const ROOT = findRepoRoot(dirname(fileURLToPath(import.meta.url)));

/** Every existing `dist/` under `packages/*` and `plugins/*`. */
export const listDistDirectories = (root: string): string[] => {
	const found: string[] = [];
	for (const group of WORKSPACE_GROUPS) {
		const groupDir = join(root, group);
		if (!existsSync(groupDir)) continue;
		for (const entry of readdirSync(groupDir).sort()) {
			const distDir = join(groupDir, entry, 'dist');
			if (existsSync(distDir)) found.push(distDir);
		}
	}
	return found;
};

/** Remove every per-package `dist/`; returns what was removed. */
export const cleanDistDirectories = (root: string): string[] => {
	const removed = listDistDirectories(root);
	for (const distDir of removed) {
		rmSync(distDir, { recursive: true, force: true });
	}
	return removed;
};

export const main = (argv: string[], root = ROOT): number => {
	const removed = cleanDistDirectories(root);
	console.log(
		`• build:clean removed ${removed.length} dist/ director${removed.length === 1 ? 'y' : 'ies'}`,
	);
	return buildMain(argv);
};

if (import.meta.main) {
	process.exit(main(process.argv.slice(2)));
}
