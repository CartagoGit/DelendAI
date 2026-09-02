import { describe, expect, it } from 'vitest';

import type {
	IDeclaredBranchPolicy,
	IGitHubBranchProtectionResponse,
} from './verify-main-health.script.ts';
import { diffDeclaredProtection } from './verify-main-health.script.ts';

const declaredPolicy = (
	overrides: Partial<IDeclaredBranchPolicy['protection']> = {},
): IDeclaredBranchPolicy => ({
	name: 'main',
	protected: true,
	protection: {
		required_status_checks: {
			strict: true,
			contexts: [
				'quality-gate',
				'tests',
				'tokens',
				'governance',
				'security',
			],
		},
		enforce_admins: true,
		required_linear_history: true,
		allow_force_pushes: false,
		allow_deletions: false,
		...overrides,
	},
});

const liveProtection = (
	overrides: Partial<IGitHubBranchProtectionResponse> = {},
): IGitHubBranchProtectionResponse => ({
	enforce_admins: { enabled: true },
	required_linear_history: { enabled: true },
	allow_force_pushes: { enabled: false },
	allow_deletions: { enabled: false },
	required_status_checks: {
		strict: true,
		contexts: ['quality-gate', 'tests', 'tokens', 'governance', 'security'],
	},
	...overrides,
});

describe('diffDeclaredProtection (verify-main-health)', () => {
	it('returns a single "could not be verified" entry when the API call failed', () => {
		const diff = diffDeclaredProtection(declaredPolicy(), null, false);
		expect(diff).toEqual([
			'main: branch protection could not be verified via GitHub API',
		]);
	});

	it('returns no diff when the live policy matches the declared policy exactly', () => {
		const diff = diffDeclaredProtection(
			declaredPolicy(),
			liveProtection(),
			true,
		);
		expect(diff).toEqual([]);
	});

	it('flags a missing GitHub protection when the branch is declared protected', () => {
		const diff = diffDeclaredProtection(declaredPolicy(), null, true);
		expect(diff).toEqual([
			'main: branch protection is missing in GitHub but declared protected',
		]);
	});

	it('flags a protected-but-declared-unprotected branch', () => {
		const diff = diffDeclaredProtection(
			{ ...declaredPolicy(), protected: false },
			liveProtection(),
			true,
		);
		expect(diff).toEqual([
			'main: branch is protected in GitHub but declared unprotected',
		]);
	});

	it('is silent when both the declared policy and the live state agree the branch is unprotected', () => {
		const diff = diffDeclaredProtection(
			{ ...declaredPolicy(), protected: false },
			null,
			true,
		);
		expect(diff).toEqual([]);
	});

	it('flags every boolean protection field that diverges', () => {
		const diff = diffDeclaredProtection(
			declaredPolicy(),
			liveProtection({
				enforce_admins: { enabled: false },
				required_linear_history: { enabled: false },
				allow_force_pushes: { enabled: true },
				allow_deletions: { enabled: true },
			}),
			true,
		);
		expect(diff).toEqual([
			'main: enforce_admins expected true but found false',
			'main: required_linear_history expected true but found false',
			'main: allow_force_pushes expected false but found true',
			'main: allow_deletions expected false but found true',
		]);
	});

	it('flags a strict-mode mismatch on required_status_checks', () => {
		const diff = diffDeclaredProtection(
			declaredPolicy(),
			liveProtection({
				required_status_checks: {
					strict: false,
					contexts: [
						'quality-gate',
						'tests',
						'tokens',
						'governance',
						'security',
					],
				},
			}),
			true,
		);
		expect(diff).toEqual([
			'main: required_status_checks.strict expected true but found false',
		]);
	});

	it('flags a required check missing from the live contexts', () => {
		const diff = diffDeclaredProtection(
			declaredPolicy(),
			liveProtection({
				required_status_checks: {
					strict: true,
					contexts: ['quality-gate', 'tests', 'tokens'],
				},
			}),
			true,
		);
		expect(diff).toEqual([
			'main: missing required status check "governance"',
			'main: missing required status check "security"',
		]);
	});

	it('flags a live context that is not in the declared required checks', () => {
		const diff = diffDeclaredProtection(
			declaredPolicy(),
			liveProtection({
				required_status_checks: {
					strict: true,
					contexts: [
						'quality-gate',
						'tests',
						'tokens',
						'governance',
						'security',
						'extra-unrequired-check',
					],
				},
			}),
			true,
		);
		expect(diff).toEqual([
			'main: unexpected live status check "extra-unrequired-check"',
		]);
	});
});
