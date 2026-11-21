/**
 * scan-roots.lib.ts — a lint over a scan root that is not there fails.
 *
 * The common shape walks each root and swallows the error of a missing
 * one, so a renamed folder, a partial checkout or a run from the wrong
 * directory examines nothing and reports success. A lint calls this
 * before it scans; no-silent-gates runs every lint over an empty tree to
 * prove each one does.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The checkout a lint under `tools/scripts/lint/` belongs to. */
export const lintRepoRoot = (moduleUrl: string): string =>
	resolve(dirname(fileURLToPath(moduleUrl)), '../../..');

/** The roots of `roots` that do not exist under `root`. */
export const missingScanRoots = (
	root: string,
	roots: readonly string[],
): readonly string[] =>
	roots.filter((scanRoot) => !existsSync(join(root, scanRoot)));

/**
 * True, having said why on stderr, when a root of `roots` is missing:
 * the caller exits non-zero instead of passing over nothing.
 */
export const refuseMissingScanRoots = (
	lint: string,
	root: string,
	roots: readonly string[],
): boolean => {
	const missing = missingScanRoots(root, roots);
	if (missing.length === 0) return false;
	console.error(
		`✖ ${lint}: scan root(s) missing under ${root}: ${missing.join(', ')}. A lint over an absent root measures nothing; run it from the checkout.`,
	);
	return true;
};
