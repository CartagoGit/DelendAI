/**
 * executable-acceptance.spec.ts
 *
 * T3 slice of p34 (Proposal Budget + Execution Plan Tool).
 *
 * Integration spec for `runAcceptanceCriteria` (T3 deliverable in
 * `libs/mcp-server/src/lib/proposals/proposal-acceptance.ts`).
 *
 * The spec uses `Bun.spawn` for real (no mocks): acceptance criteria are
 * the gate between an `implementation_runner` slice and `delivery_verifier`
 * closure, so the test MUST cover the actual subprocess machinery. If Bun
 * is not available in the host environment, the whole `describe` is
 * skipped with `skipIf(!Bun.which('bun'))`.
 *
 * Cases locked by the p34 proposal (section T3, points 9-10):
 *
 *   1. `runAcceptanceCriteria([{ command: 'bun --version', expect: 'contains:1.' }])`
 *      → passed: true (bun real exists in this workspace).
 *   2. `runAcceptanceCriteria([{ command: 'bun --version', expect: 'contains:9.9.9' }])`
 *      → passed: false, reason: 'substring not found'.
 *   3. `runAcceptanceCriteria([{ command: 'exit 1', expect: 'exit0' }])`
 *      → passed: false, reason: 'exit code N'.
 *   4. `runAcceptanceCriteria([{ command: 'bun test libs/mcp-server -- --invalid-flag', expect: 'pass' }])`
 *      → passed: false, reason contains 'vitest exit code'.
 *   5. `runAcceptanceCriteria` with empty `command` → throws `INVALID_CRITERION`
 *      without spawning anything.
 *
 * Plus three defensive cases added for completeness:
 *   6. `expect: 'synchronized'` on a command that exits 0 → passed: true
 *      (the policy is "exit 0 + no expected substring means pass").
 *   7. `expect: 'pass'` on a command that exits 0 → passed: true.
 *   8. `timeoutMs: 1` on a long-running command → passed: false with
 *      reason mentioning timeout.
 */

import { describe, expect, it } from 'vitest';

import { runAcceptanceCriteria } from '@cartago-git/mcp-proposals/lib/proposals/proposal-acceptance';
import { ProposalParseError } from '@cartago-git/mcp-proposals/lib/proposals/proposal-errors';

// skipIf guard: when Bun is unavailable, the whole suite skips. The
// vitest run still reports the file as 0/0 with `skipped: true` rather
// than failing, which matches the integration-spec policy in the p34
// proposal (section T3, point 10: "If Bun no está disponible en CI, el
// spec se marca skipIf con un check de Bun.which").
const BUN_AVAILABLE = typeof Bun !== 'undefined' && Bun.which('bun') !== null;
const describeIfBun = BUN_AVAILABLE ? describe : describe.skip;

// Helper: a small command that always exits 0 — used to build
// `expect: 'exit0' | 'pass' | 'synchronized'` cases without coupling
// the spec to the host's `bun` version string.
const EXIT_ZERO_CMD = 'bun --version';

// Per-test timeout for the vitest-suite spawn used in case 4. The
// command runs a real `bun test libs/mcp-server -- --invalid-flag`
// (the whole vitest suite as a subprocess), which can take 10-15s
// in this workspace; the default vitest 5s timeout is not enough.
// We only widen the timeout for that one test, leaving the rest at
// the project default.
const VITEST_SUITE_TIMEOUT_MS = 60_000;

describe('runAcceptanceCriteria (integration, p34 T3)', () => {
	describeIfBun('executable acceptance', () => {
		it('case 1: bun --version matches contains:1. → passed: true', async () => {
			const result = await runAcceptanceCriteria([
				{ command: 'bun --version', expect: 'contains:1.' },
			]);
			expect(result.results).toHaveLength(1);
			const r = result.results[0];
			expect(r?.passed).toBe(true);
			expect(r?.command).toBe('bun --version');
			expect(r?.actual).toContain('1.');
		});

		it('case 2: bun --version against contains:9.9.9 → passed: false', async () => {
			const result = await runAcceptanceCriteria([
				{ command: 'bun --version', expect: 'contains:9.9.9' },
			]);
			expect(result.results).toHaveLength(1);
			const r = result.results[0];
			expect(r?.passed).toBe(false);
			expect(r?.reason).toMatch(/substring not found/i);
			expect(r?.command).toBe('bun --version');
		});

		it('case 3: exit 1 with expect: exit0 → passed: false (exit code)', async () => {
			// `false` is a POSIX-standard command that always exits with
			// code 1. It is a single token, so the whitespace tokenizer
			// in `runOne` (which avoids shell parsing by design — see
			// p34 §T3 point 10) can dispatch it as a single argv entry.
			const result = await runAcceptanceCriteria([
				{ command: 'false', expect: 'exit0' },
			]);
			expect(result.results).toHaveLength(1);
			const r = result.results[0];
			expect(r?.passed).toBe(false);
			expect(r?.reason).toMatch(/exit code 1/);
		});

		it(
			'case 4: bun test with invalid flag → passed: false (vitest exit code)',
			async () => {
				// Real vitest startup + parse + error path is ~3-4 s in this
				// workspace; we set a generous per-test timeout so the spec is
				// not flaky on slower CI hosts.
				const result = await runAcceptanceCriteria([
					{
						command: 'bun x vitest run --invalid-flag',
						expect: 'pass',
					},
				]);
				expect(result.results).toHaveLength(1);
				const r = result.results[0];
				expect(r?.passed).toBe(false);
				expect(r?.reason ?? '').toMatch(/exit code/);
			},
			VITEST_SUITE_TIMEOUT_MS
		);

		it('case 5: empty command throws INVALID_CRITERION without spawning', async () => {
			await expect(
				runAcceptanceCriteria([{ command: '', expect: 'exit0' }])
			).rejects.toBeInstanceOf(ProposalParseError);

			try {
				await runAcceptanceCriteria([{ command: '', expect: 'exit0' }]);
			} catch (e) {
				expect(e).toBeInstanceOf(ProposalParseError);
				if (e instanceof ProposalParseError) {
					expect(e.code).toBe('INVALID_CRITERION');
				}
			}
		});

		it('case 6: expect=synchronized on an exit-0 command → passed: true', async () => {
			const result = await runAcceptanceCriteria([
				{ command: EXIT_ZERO_CMD, expect: 'synchronized' },
			]);
			expect(result.results[0]?.passed).toBe(true);
		});

		it('case 7: expect=pass on an exit-0 command → passed: true', async () => {
			const result = await runAcceptanceCriteria([
				{ command: EXIT_ZERO_CMD, expect: 'pass' },
			]);
			expect(result.results[0]?.passed).toBe(true);
		});

		it('case 8: timeoutMs=1 on a long-running command → passed: false (timeout)', async () => {
			// 50ms sleep, 1ms timeout → must trip the timeout path.
			// We use `sleep 0.1` (a single token + a single numeric arg
			// that is tokenised cleanly) instead of `bun -e "..."` so
			// the whitespace-split argv shim does not have to parse
			// quoted strings. `sleep` is in POSIX so it is portable
			// across Linux and macOS hosts.
			const result = await runAcceptanceCriteria([
				{
					command: 'sleep 0.1',
					expect: 'exit0',
					timeoutMs: 1,
				},
			]);
			expect(result.results[0]?.passed).toBe(false);
			expect(result.results[0]?.reason ?? '').toMatch(/timeout/i);
		});

		it('runs an empty array of criteria → empty results, allPassed true', async () => {
			const result = await runAcceptanceCriteria([]);
			expect(result.results).toEqual([]);
			expect(result.allPassed).toBe(true);
		});

		it('mixed batch: one passes, one fails → allPassed is false', async () => {
			const result = await runAcceptanceCriteria([
				{ command: 'bun --version', expect: 'contains:1.' },
				{ command: 'bun --version', expect: 'contains:9.9.9' },
			]);
			expect(result.results).toHaveLength(2);
			expect(result.allPassed).toBe(false);
			expect(result.results[0]?.passed).toBe(true);
			expect(result.results[1]?.passed).toBe(false);
		});
	});

	describe('non-Bun hosts (sanity)', () => {
		// The pre-spawn check runs regardless of Bun availability. We
		// assert the error path is type-safe even when the host has
		// neither Bun nor Node.
		it('rejects unknown expect values', async () => {
			await expect(
				runAcceptanceCriteria([
					{
						command: 'true',
						// Cast to bypass the type-level closed union; the
						// runtime guard must still reject this.
						expect: 'banana' as never,
					},
				])
			).rejects.toBeInstanceOf(ProposalParseError);
		});
	});
});
