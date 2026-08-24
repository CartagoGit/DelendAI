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
	toolId: 'tool_x',
	errorCode: 'PLUGIN_REGISTER_TIMEOUT',
	failureClass: 'INTERNAL_TIMEOUT',
	classification: 'PERFORMANCE',
	fingerprint: 'abc123',
	mcpFrames: [
		{ file: '@mcp-vertex/error-reporting/src/index.ts', line: 1, col: 2 },
	],
	environmentClass: { runtime: 'bun', platformFamily: 'linux' },
};

describe('validateSafeReport', () => {
	it('accepts a safe DTO', () => {
		expect(validateSafeReport(baseReport)).toEqual({ ok: true });
	});

	it('rejects absolute paths', () => {
		expect(
			validateSafeReport({
				...baseReport,
				syntheticExample: { summary: '/home/alice/acme/private' },
			}),
		).toEqual({ ok: false, reasonCode: 'absolute-path' });
	});

	it('rejects emails, urls, json fragments and missing frames', () => {
		expect(
			validateSafeReport({
				...baseReport,
				syntheticExample: { summary: 'contact alice@example.com' },
			}),
		).toEqual({ ok: false, reasonCode: 'email' });
		expect(
			validateSafeReport({
				...baseReport,
				syntheticExample: {
					summary: 'https://corp.example.org/secret',
				},
			}),
		).toEqual({ ok: false, reasonCode: 'url-not-allowlisted' });
		expect(
			validateSafeReport({
				...baseReport,
				syntheticExample: { summary: '{"secret":true}' },
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
					syntheticExample: { summary: 'Authorization: Bearer abc' },
				}),
			),
		).toEqual({ ok: false, reasonCode: 'token' });
	});
});
