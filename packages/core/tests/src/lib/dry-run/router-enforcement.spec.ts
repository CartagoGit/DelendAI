/**
 * router-enforcement.spec.ts — f00189 (Track F / security).
 *
 * The router is the boundary between the caller's `args.dryRun`
 * and the plugin's handler. These tests pin the contract:
 *
 *   - A tool with `effects !== []` and no `dryRunSupported: true`
 *     triggers a manifest warning at boot.
 *   - When `args.dryRun === true`, the handler must return an
 *     `IDryRunResult` — anything else is a typed refusal.
 *   - When `args.dryRun !== true`, the result passes through
 *     untouched (the plugin ran for real).
 */

import { describe, expect, it } from 'vitest';

import {
	enforceDryRunReturnContract,
	validateToolDryRunManifest,
} from '@mcp-vertex/core/public';

describe('f00189 — dry-run router enforcement (Track F)', () => {
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
