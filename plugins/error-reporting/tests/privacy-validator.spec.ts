import { describe, expect, it } from 'vitest';

import type { ISafeMcpVertexReport } from '../src/lib/contracts/interfaces/reporter.interface';
import {
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
