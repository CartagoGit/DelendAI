/**
 * enforce.spec.ts — r00037 S1.
 *
 * `enforceDryRunReturnContract` had router-level coverage
 * (`router-enforcement.spec.ts`, through `ToolSurfaceRuntime.invokeTool`)
 * but no unit-level spec of its own. These tests pin its pure contract
 * directly, independent of the router, so a future change to the
 * router's dispatch path cannot silently change what counts as a
 * violation.
 */
import { describe, expect, it } from 'vitest';

import {
	enforceDryRunReturnContract,
	validateToolDryRunManifest,
} from '@delendai/core/public';

describe('enforceDryRunReturnContract', () => {
	it('forwards the result untouched when the caller did not ask for a dryRun', () => {
		const verdict = enforceDryRunReturnContract({
			args: { dryRun: false },
			result: { ok: true, wrote: '/a' },
		});

		expect(verdict).toEqual({
			kind: 'forwarded',
			value: { ok: true, wrote: '/a' },
		});
	});

	it('forwards a well-formed IDryRunResult when dryRun is true', () => {
		const plan = {
			dryRun: true as const,
			wouldChange: [{ kind: 'write' as const, path: '/a', summary: 'x' }],
			wouldRun: [],
			risk: 'low' as const,
		};

		const verdict = enforceDryRunReturnContract({
			args: { dryRun: true },
			result: plan,
		});

		expect(verdict).toEqual({ kind: 'forwarded', value: plan });
	});

	it('refuses a non-dryRun payload when the caller asked for a dryRun', () => {
		const verdict = enforceDryRunReturnContract({
			args: { dryRun: true },
			result: { ok: true, committed: true },
		});

		expect(verdict).toMatchObject({
			kind: 'dry-run-contract-violation',
			reason: 'handler ignored args.dryRun and returned a non-dryRun payload',
		});
	});

	it('refuses a structurally malformed IDryRunResult when the caller asked for a dryRun', () => {
		const verdict = enforceDryRunReturnContract({
			args: { dryRun: true },
			result: {
				dryRun: true,
				wouldChange: [
					{ kind: 'not-a-real-kind', path: '/a', summary: 's' },
				],
				wouldRun: [],
				risk: 'catastrophic',
			},
		});

		expect(verdict.kind).toBe('dry-run-contract-violation');
		if (verdict.kind === 'dry-run-contract-violation') {
			expect(verdict.reason).toBe(
				'handler returned a malformed DryRunResult',
			);
			expect(verdict.issues.length).toBeGreaterThan(0);
		}
	});
});

describe('validateToolDryRunManifest', () => {
	it('warns when a tool declares effects but omits dryRunSupported', () => {
		const warning = validateToolDryRunManifest({
			tool: 'writer_run',
			effects: ['write'],
			dryRunSupported: undefined,
		});

		expect(warning).toMatchObject({
			kind: 'manifest-warning',
			tool: 'writer_run',
		});
	});

	it('is silent for a tool that declares no effects', () => {
		expect(
			validateToolDryRunManifest({
				tool: 'reader_run',
				effects: [],
				dryRunSupported: undefined,
			}),
		).toBeNull();
	});

	it('is silent when dryRunSupported is explicitly declared true', () => {
		expect(
			validateToolDryRunManifest({
				tool: 'writer_run',
				effects: ['write'],
				dryRunSupported: true,
			}),
		).toBeNull();
	});
});
