/**
 * contract-helpers.spec.ts — f00189 (Track F / security).
 *
 * Unit coverage for the two PURE helpers in `dry-run/enforce.ts`, in
 * isolation from any router or runtime:
 *
 *   - `validateToolDryRunManifest` — the boot-time warning for a tool
 *     that declares non-empty `effects` without `dryRunSupported: true`.
 *   - `enforceDryRunReturnContract` — given `args` and a handler's
 *     `result`, decide forward-vs-refuse.
 *
 * This file does NOT exercise the router or `ToolSurfaceRuntime` — it
 * calls the helpers directly to pin their input/output contract. The
 * router actually wires `enforceDryRunReturnContract` into a live
 * `invokeTool` dispatch; that end-to-end behaviour (a handler that
 * ignores `dryRun` and the caller getting a typed refusal instead of
 * the bogus payload) is covered by
 * `tests/src/lib/dry-run/router-enforcement.spec.ts`, which drives the
 * runtime instead of calling this helper in isolation.
 */

import { describe, expect, it } from 'vitest';

import {
	enforceDryRunReturnContract,
	validateToolDryRunManifest,
} from '@mcp-vertex/core/public';

describe('f00189 — dry-run contract helpers (pure, unit-level)', () => {
	it('flags a write tool that did not declare dryRunSupported', () => {
		const warning = validateToolDryRunManifest({
			tool: 'commit_policy_run',
			effects: ['write'],
			dryRunSupported: undefined,
		});
		expect(warning).not.toBeNull();
		expect(warning?.kind).toBe('manifest-warning');
		expect(warning?.tool).toBe('commit_policy_run');
		expect(warning?.message).toContain('dryRunSupported');
	});

	it('accepts a write tool that declared dryRunSupported', () => {
		expect(
			validateToolDryRunManifest({
				tool: 'commit_policy_run',
				effects: ['write'],
				dryRunSupported: true,
			}),
		).toBeNull();
	});

	it('does not flag a read-only tool', () => {
		expect(
			validateToolDryRunManifest({
				tool: 'git_status',
				effects: [],
				dryRunSupported: false,
			}),
		).toBeNull();
	});

	it('forwards the result untouched when dryRun is unset', () => {
		const verdict = enforceDryRunReturnContract({
			args: {},
			result: { ok: true, committed: true, hash: 'abc' },
		});
		expect(verdict).toEqual({
			kind: 'forwarded',
			value: { ok: true, committed: true, hash: 'abc' },
		});
	});

	it('forwards a valid DryRunResult when dryRun is true', () => {
		const plan = {
			dryRun: true as const,
			wouldChange: [
				{ kind: 'write' as const, path: '/a', summary: 'edit' },
			],
			wouldRun: [
				{
					shape: 'git' as const,
					target: 'git commit',
					summary: 'commit',
				},
			],
			risk: 'medium' as const,
		};
		const verdict = enforceDryRunReturnContract({
			args: { dryRun: true },
			result: plan,
		});
		expect(verdict).toEqual({ kind: 'forwarded', value: plan });
	});

	it('refuses when the handler ignored dryRun and returned a normal payload', () => {
		const verdict = enforceDryRunReturnContract({
			args: { dryRun: true },
			result: { ok: true, committed: true, hash: 'abc' },
		});
		if (verdict.kind !== 'dry-run-contract-violation') {
			throw new Error(`expected refusal, got ${verdict.kind}`);
		}
		expect(verdict.reason).toMatch(/ignored args.dryRun/);
	});

	it('refuses when the handler returned a malformed DryRunResult', () => {
		const verdict = enforceDryRunReturnContract({
			args: { dryRun: true },
			result: {
				dryRun: true,
				wouldChange: [{ kind: 'unknown', path: '/a', summary: 's' }],
				wouldRun: [],
				risk: 'catastrophic',
			},
		});
		if (verdict.kind !== 'dry-run-contract-violation') {
			throw new Error(`expected refusal, got ${verdict.kind}`);
		}
		expect(verdict.reason).toMatch(/malformed DryRunResult/);
	});
});
