/**
 * canonical-path.ts — resolve the canonical binary the alias should re-exec.
 *
 * b00239 S4: the alias must point at the actual binary that npm/bun
 * installed and the user is currently invoking. We can't guess that
 * from `process.cwd()` — that would be wherever the user happened to
 * run `delendai alias install` from, not where the binary lives.
 *
 * Sources of truth, in priority order:
 *
 *   1. `process.argv[1]` — Node / Bun always populates this with the
 *      script path that was invoked. For a globally installed CLI
 *      this is `<prefix>/bin/delendai`; for `bunx delendai ...` it is
 *      the temp script bunx writes. Either way, it is the SAME binary
 *      that just ran this code, which is what the alias needs to
 *      forward to.
 *
 *   2. `import.meta.url` (Bun, ESM) — fallback when `argv[1]` is
 *      missing or `node:` (REPL, embedded). Resolves to the source
 *      file of this module; the binary lives two directories up
 *      under the package's `dist/`.
 *
 * The `binDir` is then `dirname(canonicalPath)`. The alias file lives
 * next to the canonical binary so package-manager uninstall removes
 * both together (npm/bun remove the entire `bin/` directory).
 */

import { dirname, resolve } from 'node:path';

import { fileURLToPath } from 'node:url';

export interface ICanonicalExecutableResolution {
	/** Absolute path to the canonical binary the alias must re-exec. */
	readonly canonicalPath: string;
	/** Directory the binary lives in; the alias is provisioned here. */
	readonly binDir: string;
	/**
	 * Strategy used to resolve the canonical path. Tests and
	 * diagnostic surfaces can inspect this; users rarely need to.
	 */
	readonly source: 'argv1' | 'meta-url' | 'fallback';
}

/**
 * Resolve the canonical executable path + bin directory for the
 * current process.
 *
 * Falls back to `<cwd>/delendai` only when neither argv[1] nor the
 * import.meta.url are usable (e.g. bundled into a single executable
 * with no script path). The fallback is conservative — it surfaces
 * as `source: 'fallback'` so tests can pin it.
 */
export const resolveCanonicalExecutable = (): ICanonicalExecutableResolution => {
	// 1. process.argv[1] — the script the runtime actually invoked.
	const argv1 = process.argv[1];
	if (
		typeof argv1 === 'string' &&
		argv1.length > 0 &&
		argv1 !== 'node' &&
		argv1 !== 'bun'
	) {
		const canonical = resolve(argv1);
		return {
			canonicalPath: canonical,
			binDir: dirname(canonical),
			source: 'argv1',
		};
	}

	// 2. import.meta.url — ESM resolution when argv[1] is not a real path.
	try {
		const here = fileURLToPath(import.meta.url);
		// This file lives at `<pkg>/src/lib/alias/canonical-path.ts`.
		// The canonical binary is `<pkg>/dist/index.js`; for the alias
		// we want `<pkg>/dist/index.js` so it always exists post-build.
		const distIndex = resolve(here, '..', '..', '..', 'dist', 'index.js');
		return {
			canonicalPath: distIndex,
			binDir: dirname(distIndex),
			source: 'meta-url',
		};
	} catch {
		// Fall through.
	}

	// 3. Last-resort fallback — surfaces as `source: 'fallback'`.
	const fallback = resolve(process.cwd(), 'delendai');
	return {
		canonicalPath: fallback,
		binDir: dirname(fallback),
		source: 'fallback',
	};
};
