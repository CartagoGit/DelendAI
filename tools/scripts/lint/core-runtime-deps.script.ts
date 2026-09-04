#!/usr/bin/env bun
/**
 * core-runtime-deps.script.ts — the core's dependency promise, enforced.
 *
 * `ARCHITECTURE.md` states what `@delendai/core` is allowed to depend on
 * at runtime. That claim had already drifted: the table said "only
 * `@modelcontextprotocol/sdk`, `zod`" while the package also depended on
 * `@delendai/contracts` and `jsonc-parser`. Neither addition was wrong —
 * contracts is the deliberate protocol split, and jsonc-parser arrived
 * with comment-preserving config — but nothing noticed the sentence had
 * stopped being true.
 *
 * A promise nobody checks is a promise that decays. Prose in a document
 * cannot fail a build; this can. The list below is the single source of
 * truth, and the architecture doc points at it rather than repeating it,
 * so the two cannot disagree again.
 *
 * Adding an entry here is meant to be a visible decision: every runtime
 * dependency of the core is inherited by every consumer of the core,
 * which is why the boundary is worth guarding at all.
 *
 * Usage:
 *   bun tools/scripts/lint/core-runtime-deps.script.ts
 *   bun tools/scripts/lint/core-runtime-deps.script.ts --root <dir>
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Every runtime dependency `@delendai/core` may declare, with why it is
 * allowed. A dependency not listed here fails the gate.
 */
export const ALLOWED_CORE_RUNTIME_DEPENDENCIES: Readonly<
	Record<string, string>
> = {
	'@delendai/contracts':
		'the protocol shapes, deliberately split out so hosts and plugins can depend on the contract without the runtime',
	'@modelcontextprotocol/sdk': 'the MCP protocol implementation itself',
	'jsonc-parser':
		'comment-preserving config reads and edits; the config format admits comments, so parsing it needs more than JSON.parse',
	zod: 'schema declaration and validation for every tool contract',
};

export interface IDependencyViolation {
	readonly name: string;
	readonly kind: 'not-allowed' | 'allowed-but-absent';
	readonly detail: string;
}

/** Pure: given the declared dependencies, what breaks the promise. */
export const checkCoreDependencies = (
	declared: Readonly<Record<string, string>>,
	allowed: Readonly<
		Record<string, string>
	> = ALLOWED_CORE_RUNTIME_DEPENDENCIES,
): readonly IDependencyViolation[] => {
	const violations: IDependencyViolation[] = [];
	for (const name of Object.keys(declared).sort()) {
		if (name in allowed) continue;
		violations.push({
			name,
			kind: 'not-allowed',
			detail: `"${name}" is a runtime dependency of the core but is not on the allow-list; every consumer of the core inherits it, so adding one is an architectural decision that belongs in ALLOWED_CORE_RUNTIME_DEPENDENCIES with its reason`,
		});
	}
	for (const name of Object.keys(allowed).sort()) {
		if (name in declared) continue;
		// A stale allowance is not harmless: it is the same decay in the
		// other direction, and it quietly widens what the gate permits.
		violations.push({
			name,
			kind: 'allowed-but-absent',
			detail: `"${name}" is on the allow-list but the core no longer depends on it; remove the entry so the list keeps describing the package`,
		});
	}
	return violations;
};

const main = async (argv: readonly string[]): Promise<number> => {
	const rootFlag = argv.indexOf('--root');
	const root =
		rootFlag === -1 ? process.cwd() : (argv[rootFlag + 1] ?? process.cwd());
	const manifest = JSON.parse(
		await readFile(join(root, 'packages', 'core', 'package.json'), 'utf8'),
	) as { dependencies?: Record<string, string> };
	const violations = checkCoreDependencies(manifest.dependencies ?? {});

	if (violations.length === 0) {
		process.stdout.write(
			`✓ core-runtime-deps: the core depends on exactly its ${Object.keys(ALLOWED_CORE_RUNTIME_DEPENDENCIES).length.toString()} allowed runtime packages.\n`,
		);
		return 0;
	}
	process.stderr.write(
		`✖ core-runtime-deps: ${violations.length.toString()} dependency promise(s) broken:\n`,
	);
	for (const violation of violations) {
		process.stderr.write(`  ${violation.detail}\n`);
	}
	return 1;
};

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
