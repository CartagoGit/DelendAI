/**
 * bun-sqlite.ts — the one place `bun:sqlite` is resolved.
 *
 * `bun:sqlite` is a Bun builtin: it has no node resolution, so a static
 * top-level `import { Database } from 'bun:sqlite'` makes merely
 * IMPORTING the containing module throw under node/vitest — which is how
 * eight `plugins/proposals` spec files that never open a database ended
 * up red in the `tests` CI job, and later how `startup-state-ports.ts`
 * took `tools/tests/ci/sqlite-cutover-ready.spec.ts` down with it.
 *
 * Resolving it through `createRequire` at call time keeps every module
 * importable everywhere, while the callers still refuse to RUN without
 * Bun. This deliberately THROWS rather than degrading: the proposals
 * database has no non-SQLite fallback, and a driver that silently did
 * nothing would be far worse than a loud failure.
 *
 * `import type { Database } from 'bun:sqlite'` is fine anywhere and needs
 * no help — type imports are erased and never resolved at runtime.
 */
import { createRequire } from 'node:module';

import type { Database } from 'bun:sqlite';

type TSqliteModule = {
	readonly Database: new (
		path: string,
		options?: {
			readonly readonly?: boolean;
			readonly create?: boolean;
			readonly strict?: boolean;
		},
	) => Database;
};

/**
 * The `Database` constructor, or a thrown explanation of why this host
 * cannot have one.
 *
 * `caller` names the subsystem in the error so the message says which
 * thing needs Bun, not just that something did.
 */
export const loadDatabaseClass = (
	caller: string,
): TSqliteModule['Database'] => {
	// Probing `globalThis.Bun` is NOT sufficient: `plugins/proposals`
	// installs a Bun polyfill into its vitest project, so the global is
	// defined on a host that still cannot resolve `bun:sqlite`. The only
	// honest test is the resolution itself.
	try {
		return (createRequire(import.meta.url)('bun:sqlite') as TSqliteModule)
			.Database;
	} catch (cause) {
		throw new Error(
			`${caller} requires the Bun runtime: \`bun:sqlite\` is a Bun builtin and cannot be resolved here. Run this code (and its specs) with \`bun test\`, not under node/vitest.`,
			{ cause },
		);
	}
};
