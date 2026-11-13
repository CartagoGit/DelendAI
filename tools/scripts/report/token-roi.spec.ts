/**
 * token-roi.spec.ts — the report says only what a session measured, and a
 * model-dependent number never moves a row.
 */
import { describe, expect, it } from 'vitest';

import {
	renderRoiMarkdown,
	roiArtifactFor,
	unsupportedRoiClaims,
	withAnnotations,
	withoutAnnotations,
	type IRoiDashboardArtifact,
} from './token-roi.script';

const artifact = (): IRoiDashboardArtifact =>
	roiArtifactFor({
		measurements: [
			{
				pluginId: 'proposals',
				successfulCalls: 12,
				schemaBytes: 4_000,
				responseTokens: 800,
			},
			{
				pluginId: 'forge',
				successfulCalls: 3,
				schemaBytes: 900,
				responseTokens: 100,
			},
			{
				pluginId: 'idle',
				successfulCalls: 0,
				schemaBytes: 300,
				responseTokens: 0,
			},
			{
				pluginId: 'silent',
				successfulCalls: 4,
				schemaBytes: 200,
				responseTokens: 50,
			},
			{
				pluginId: 'core',
				successfulCalls: 9,
				schemaBytes: 1_000,
				responseTokens: 90,
			},
		],
		values: [
			{ pluginId: 'proposals', value: 5 },
			{ pluginId: 'forge', value: 5 },
			{ pluginId: 'idle', value: 3 },
			{ pluginId: 'silent', value: undefined },
		],
		generatedAt: '2026-10-22T00:00:00.000Z',
	});

describe('roiArtifactFor', () => {
	it('ranks the measured, and names the unmeasured and the unranked apart', () => {
		const report = artifact();
		expect(report.top.map((row) => row.pluginId)).toEqual([
			'forge',
			'proposals',
		]);
		expect(report.unmeasured).toEqual(['idle']);
		expect(report.unranked).toEqual([
			{ pluginId: 'silent', reason: 'no-value-declared' },
			{ pluginId: 'core', reason: 'not-a-plugin' },
		]);
		expect(unsupportedRoiClaims(report)).toEqual([]);
	});

	it('renders the unmeasured and the unranked, not only the ranks', () => {
		const text = renderRoiMarkdown(artifact());
		expect(text).toContain('| forge |');
		expect(text).toContain('Unmeasured (served, never called): idle.');
		expect(text).toContain('silent (no-value-declared)');
	});
});

describe('unsupportedRoiClaims', () => {
	it('refuses a row no sample supports, and a sample size that is not the calls', () => {
		const report = artifact();
		const forged = {
			...report,
			top: [
				...report.top,
				{
					pluginId: 'ghost',
					roi: 9,
					sampleSize: 1,
					confidence: 'low' as const,
				},
				{ ...report.top[0]!, sampleSize: 999 },
			],
			unmeasured: [...report.unmeasured, 'nowhere'],
		};
		expect(unsupportedRoiClaims(forged)).toEqual([
			'ghost: a row with no measurement behind it',
			'forge: sample size 999, but 3 calls were measured',
			'nowhere: unmeasured, and never served',
		]);
	});

	it('refuses an empty report while the session had calls', () => {
		const report = artifact();
		expect(
			unsupportedRoiClaims({
				...report,
				top: [],
				bottom: [],
				unranked: [],
			}),
		).toHaveLength(4);
	});
});

describe('annotations', () => {
	it('ride beside the rows and removing them leaves the report byte-identical', () => {
		const report = artifact();
		const annotated = withAnnotations(report, (row) =>
			row.pluginId === 'forge'
				? [
						{
							kind: 'tokens',
							value: 97,
							confidence: 'measured-real-bpe',
							source: 'o200k_base',
						},
					]
				: [],
		);
		expect(annotated.top[0]?.annotations).toHaveLength(1);
		expect(JSON.stringify(withoutAnnotations(annotated))).toBe(
			JSON.stringify(report),
		);
	});
});
