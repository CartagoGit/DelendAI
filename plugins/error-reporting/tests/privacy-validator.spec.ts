import { describe, expect, it } from 'vitest';

import type { ISafeMcpVertexReport } from '../src/lib/contracts/interfaces/reporter.interface';
import {
	PRIVACY_VALIDATOR_BLOCKED_CLASSES,
	validateSafeReport,
	validateSerializedSafeReport,
} from '../src/lib/privacy-validator.helper';

const baseReport: ISafeMcpVertexReport = {
	reporterVersion: '0.1.0',
	mcpVertexVersion: '0.1.0',
	packageId: '@mcp-vertex/error-reporting',
	safeToolId:
		'@mcp-vertex/quality.run_quality' as ISafeMcpVertexReport['safeToolId'],
	toolOwner: 'mcp-vertex',
	toolCategory: 'analysis',
	errorCode: 'PLUGIN_REGISTER_TIMEOUT',
	failureClass: 'INTERNAL_TIMEOUT',
	classification: 'PERFORMANCE',
	fingerprint: 'abc123',
	mcpFrames: [
		{ file: '@mcp-vertex/error-reporting/src/index.ts', line: 1, col: 2 },
	],
	environmentClass: { runtime: 'bun', platformFamily: 'linux' },
};

const baseSyntheticExample = {
	summary: 'Synthetic weather reproduction for PROCESS_TIMEOUT.',
	source: 'fixture-fallback',
	fixtureId: 'weather',
	fixtureDomain: 'weather',
	argumentType: 'object',
} as const;

describe('validateSafeReport', () => {
	it('accepts a safe DTO', () => {
		expect(validateSafeReport(baseReport)).toEqual({ ok: true });
	});

	it('accepts synthetic examples built only with reserved domains and synthetic ids', () => {
		expect(
			validateSafeReport({
				...baseReport,
				syntheticExample: {
					...baseSyntheticExample,
					context: {
						operation: 'external process timeout',
						reservedHosts: ['example.invalid', 'example.com'],
						exampleIds: ['EXAMPLE-001', 'DEMO-123', 'SYNTHETIC-42'],
					},
					payload: {
						requestId: 'SYNTHETIC-42',
						endpoint: 'https://example.com/weather/forecast',
						windowHours: 12,
					},
				},
			}),
		).toEqual({ ok: true });
	});

	it('rejects absolute paths', () => {
		expect(
			validateSafeReport({
				...baseReport,
				syntheticExample: {
					...baseSyntheticExample,
					summary: '/home/alice/acme/private',
				},
			}),
		).toEqual({ ok: false, reasonCode: 'absolute-path' });
	});

	it('rejects emails, urls, json fragments and missing frames', () => {
		expect(
			validateSafeReport({
				...baseReport,
				syntheticExample: {
					...baseSyntheticExample,
					summary: 'contact alice@example.com',
				},
			}),
		).toEqual({ ok: false, reasonCode: 'email' });
		expect(
			validateSafeReport({
				...baseReport,
				syntheticExample: {
					...baseSyntheticExample,
					summary: 'https://corp.example.org/secret',
				},
			}),
		).toEqual({ ok: false, reasonCode: 'url-not-allowlisted' });
		expect(
			validateSafeReport({
				...baseReport,
				syntheticExample: {
					...baseSyntheticExample,
					summary: '{"secret":true}',
				},
			}),
		).toEqual({ ok: false, reasonCode: 'json-fragment' });
		expect(validateSafeReport({ ...baseReport, mcpFrames: [] })).toEqual({
			ok: false,
			reasonCode: 'missing-frames',
		});
	});
});

describe('validateSerializedSafeReport', () => {
	it('rejects leaked authorization strings in the serialized payload', () => {
		expect(
			validateSerializedSafeReport(
				JSON.stringify({
					...baseReport,
					syntheticExample: {
						...baseSyntheticExample,
						summary: 'Authorization: Bearer abc',
					},
				}),
			),
		).toEqual({ ok: false, reasonCode: 'token' });
	});
});

// x00256 S2 acceptance: enumerate the blocked classes the privacy
// validator recognises today and assert the canonical set has not
// grown. The list is the only sanctioned authority for what the
// validator may reject; provenance (Track B) handles everything
// else. Adding a class without updating this test is a contract
// change and must be flagged in the ADR.
describe('PRIV-002 blocked-classes set (x00256)', () => {
	it('exposes exactly the documented set of blocked classes', () => {
		expect(PRIVACY_VALIDATOR_BLOCKED_CLASSES).toEqual([
			'absolute-path',
			'windows-path',
			'url-not-allowlisted',
			'email',
			'ip-address',
			'uuid',
			'token',
			'git-metadata',
			'branch-name',
			'json-fragment',
			'xml-fragment',
			'sql-fragment',
		]);
	});

	it('each blocked class produces a reason code the validator can return', () => {
		// Build one synthetic leaf per blocked class and check the
		// validator catches it. This is the strongest possible
		// "the set is live" assertion.
		const fixtures: Record<
			(typeof PRIVACY_VALIDATOR_BLOCKED_CLASSES)[number],
			string
		> = {
			'absolute-path': '/home/alice/private',
			'windows-path': 'C:\\Users\\bob\\secret',
			'url-not-allowlisted': 'https://corp.example.org/secret',
			email: 'contact alice@example.com',
			'ip-address': '10.0.0.42',
			uuid: '11111111-2222-3333-8444-555555555555',
			token: 'Authorization: Bearer abc',
			'git-metadata': 'repo/.git/config',
			'branch-name': 'origin/feature/foo',
			'json-fragment': '{"secret":true}',
			'xml-fragment': '<?xml version="1.0"?><root/>',
			'sql-fragment': 'select * from users',
		};
		for (const cls of PRIVACY_VALIDATOR_BLOCKED_CLASSES) {
			const report = {
				...baseReport,
				syntheticExample: {
					...baseSyntheticExample,
					summary: fixtures[cls],
				},
			};
			expect(validateSafeReport(report), cls).toEqual({
				ok: false,
				reasonCode: cls,
			});
		}
	});

	it('no blocked class is added without updating the set test above', () => {
		// Defensive: pin the length so a stealth addition to
		// PRIVACY_VALIDATOR_BLOCKED_CLASSES forces a test rewrite.
		expect(PRIVACY_VALIDATOR_BLOCKED_CLASSES.length).toBe(12);
	});
});
