/**
 * bun-polyfill.ts
 *
 * Inject a minimal `Bun` global at the top of every vitest worker so the
 * 1 integration spec gated on `typeof Bun !== 'undefined'` can run inside
 * the default thread-pool (which is plain Node, never Bun).
 *
 * Used by `plugins/proposals/tests/src/lib/proposals/executable-acceptance.spec.ts`:
 *   const BUN_AVAILABLE = typeof Bun !== 'undefined' && Bun.which('bun') !== null;
 *   const describeIfBun = BUN_AVAILABLE ? describe : describe.skip;
 *
 * Why this lives in setupFiles (not a vitest Environment):
 *   vitest 4's `test.environment` is a string union ('node' | 'jsdom' | ...).
 *   You can register a custom environment only via a separately-installed
 *   `vitest-environment-<name>` package, which means adding a new dep and
 *   a publishable surface for what is internally a 10-line polyfill.
 *   setupFiles run synchronously inside the worker before specs import,
 *   so mutating `globalThis` there is functionally equivalent — and keeps
 *   the project-agnostic core free of a vitest-specific contract.
 *
 * What this provides:
 *   - `Bun.which(name)` -> resolves via the host `$PATH`, identical to the
 *     real Bun API. Returns `null` when not found, matching Bun's contract.
 *   - `Bun.version` -> the parent's `bun --version` string when available,
 *     else the empty string (so `typeof Bun !== 'undefined'` stays true).
 *
 * What this intentionally does NOT provide:
 *   - `Bun.spawn`, `Bun.file`, `Bun.write`, `Bun.$` -- those would change
 *     runtime semantics and break unrelated specs. The acceptance spec
 *     uses `node:child_process.spawn` (agnostic), so a polyfill is enough.
 *
 * Wired in via `vitest.shared.ts#sharedSetupFiles` so every project picks
 * it up automatically. The cost when Bun is NOT on the host is one
 * `which bun` syscall per worker startup — negligible.
 */
import { execFileSync } from 'node:child_process';

const resolveBunVersion = (): string => {
	try {
		return execFileSync('bun', ['--version'], { encoding: 'utf8' }).trim();
	} catch {
		return '';
	}
};

const resolveBunPath = (): string | null => {
	try {
		const out = execFileSync('which', ['bun'], {
			encoding: 'utf8',
		}).trim();
		return out.length > 0 ? out : null;
	} catch {
		return null;
	}
};

const path = resolveBunPath();
const version = path ? resolveBunVersion() : '';

(globalThis as unknown as { Bun: unknown }).Bun = {
	which: (name: string): string | null => (name === 'bun' ? path : null),
	version,
};
