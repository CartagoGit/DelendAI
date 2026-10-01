/**
 * protocol.spec.ts — f00189 (Track F / security).
 *
 * Pin the `IDryRunResult` shape so the router, the lint and every
 * plugin handler that opts into dryRun share the same contract.
 */

import { describe, expect, it } from 'vitest';

import {
	buildDryRunResult,
	dryRunRequiredFor,
	isDryRunResult,
	validateDryRunResult,
} from '@delendai/core/public';

describe('f00189 — dry-run protocol (Track F)', () => {
	it('isDryRunResult narrows on the dryRun literal', () => {
		expect(
			isDryRunResult({
				dryRun: true,
				wouldChange: [],
				wouldRun: [],
				risk: 'low',
			}),
		).toBe(true);
		expect(
			isDryRunResult({
				dryRun: false,
				wouldChange: [],
				wouldRun: [],
				risk: 'low',
			}),
		).toBe(false);
		expect(isDryRunResult({ ok: true, committed: true })).toBe(false);
		expect(isDryRunResult(null)).toBe(false);
		expect(isDryRunResult('dryRun: true')).toBe(false);
	});

	it('buildDryRunResult fills optional fields with the canonical defaults', () => {
		const result = buildDryRunResult({ risk: 'low' });
		expect(result).toEqual({
			dryRun: true,
			wouldChange: [],
			wouldRun: [],
			risk: 'low',
		});
	});

	it('buildDryRunResult preserves the note only when set', () => {
		const withNote = buildDryRunResult({
			risk: 'high',
			note: 'destructive',
		});
		expect(withNote.note).toBe('destructive');
		const withoutNote = buildDryRunResult({ risk: 'low' });
		expect(withoutNote).not.toHaveProperty('note');
	});

	it('validateDryRunResult rejects a non-dryRun value', () => {
		expect(validateDryRunResult({ ok: true })).toEqual([
			{
				path: '$',
				message: 'result is not a DryRunResult (dryRun !== true)',
			},
		]);
		expect(validateDryRunResult(null)).toHaveLength(1);
	});

	it('validateDryRunResult flags every shape issue at the right path', () => {
		const issues = validateDryRunResult({
			dryRun: true,
			wouldChange: [
				{ kind: 'unknown-kind', path: '', summary: '' },
				{ kind: 'write', path: '/x', summary: 's' },
			],
			wouldRun: [{ shape: 'shapes', target: '', summary: '' }],
			risk: 'urgent',
			note: 42,
		});
		const paths = issues.map((issue) => issue.path).sort();
		expect(paths).toContain('wouldChange[0].kind');
		expect(paths).toContain('wouldChange[0].path');
		expect(paths).toContain('wouldChange[0].summary');
		expect(paths).toContain('wouldRun[0].shape');
		expect(paths).toContain('wouldRun[0].target');
		expect(paths).toContain('wouldRun[0].summary');
		expect(paths).toContain('risk');
		expect(paths).toContain('note');
	});

	it('validateDryRunResult returns an empty list for a well-formed result', () => {
		expect(
			validateDryRunResult({
				dryRun: true,
				wouldChange: [{ kind: 'write', path: '/a', summary: 'edit' }],
				wouldRun: [
					{ shape: 'git', target: 'git commit', summary: 'commit' },
				],
				risk: 'medium',
				note: 'safe',
			}),
		).toEqual([]);
	});

	it('dryRunRequiredFor: read-only tools do not need dryRun', () => {
		expect(dryRunRequiredFor([])).toBe(false);
		expect(dryRunRequiredFor(undefined)).toBe(false);
		expect(dryRunRequiredFor(['write'])).toBe(true);
		expect(dryRunRequiredFor(['spawn'])).toBe(true);
		expect(dryRunRequiredFor(['network'])).toBe(true);
		expect(dryRunRequiredFor(['destructive'])).toBe(true);
		expect(dryRunRequiredFor(['write', 'network'])).toBe(true);
		// Unknown effect: defensive — newer effects MUST require dryRun
		// until the protocol grows to recognise them explicitly.
		expect(dryRunRequiredFor(['unknown-effect' as never])).toBe(true);
	});
});
