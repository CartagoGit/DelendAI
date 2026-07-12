/**
 * Tests for the extracted read-proposals-index module.
 */
import { describe, expect, it } from 'vitest';

import {
	proposalKindFromId,
	normalizeProposalStatus,
	readProposalsIndex,
} from '../../../../src/lib/cli/read-proposals-index';

describe('proposalKindFromId', () => {
	it.each([
		['f00100', 'feat'],
		['r00003', 'refactor'],
		['c00002', 'chore'],
		['d00001', 'docs'],
		['q00001', 'plan'],
		['a00013', 'audit'],
		['x00052', 'fix'],
		['z99999', 'unspecified'],
	] as const)('maps %s → %s', (id, expected) => {
		expect(proposalKindFromId(id)).toBe(expected);
	});

	it('returns unspecified for empty string', () => {
		expect(proposalKindFromId('')).toBe('unspecified');
	});
});

describe('normalizeProposalStatus', () => {
	it.each([
		'ready',
		'in-progress',
		'review',
		'paused',
		'done',
		'blocked',
		'retired',
	] as const)('passes through known status: %s', (status) => {
		expect(normalizeProposalStatus(status)).toBe(status);
	});

	it('normalizes unknown status to unspecified', () => {
		expect(normalizeProposalStatus('invalid')).toBe('unspecified');
		expect(normalizeProposalStatus(undefined)).toBe('unspecified');
	});
});

describe('readProposalsIndex', () => {
	it('returns empty array when index does not exist', async () => {
		const result = await readProposalsIndex('/workspace', 'cache', async () =>
			undefined,
		);
		expect(result).toEqual([]);
	});

	it('returns empty array for invalid JSON', async () => {
		const result = await readProposalsIndex(
			'/workspace',
			'cache',
			async () => '{ invalid json',
		);
		expect(result).toEqual([]);
	});

	it('returns empty array when proposals field is missing', async () => {
		const result = await readProposalsIndex(
			'/workspace',
			'cache',
			async () => JSON.stringify({ other: 'data' }),
		);
		expect(result).toEqual([]);
	});

	it('parses a valid proposals index', async () => {
		const index = {
			proposals: [
				{
					id: 'f00100',
					title: 'VS Code extension completeness',
					track: 'extensions/vscode',
					status: 'done',
					kind: 'feat',
					date: '2026-07-07',
				},
				{
					id: 'c00002',
					title: 'Pause npm publish',
					status: 'paused',
					date: '2026-06-21',
				},
			],
		};
		const result = await readProposalsIndex(
			'/workspace',
			'cache',
			async (path) => {
				expect(path).toBe('/workspace/cache/proposals/index.json');
				return JSON.stringify(index);
			},
		);

		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({
			id: 'f00100',
			title: 'VS Code extension completeness',
			track: 'extensions/vscode',
			status: 'done',
			kind: 'feat',
			date: '2026-07-07',
		});
		expect(result[1]).toEqual({
			id: 'c00002',
			title: 'Pause npm publish',
			track: 'unspecified',
			status: 'paused',
			kind: 'chore',
			date: '2026-06-21',
		});
	});

	it('skips entries without id', async () => {
		const index = {
			proposals: [
				{ title: 'No id field' },
				{ id: 'f00001', title: 'Has id' },
			],
		};
		const result = await readProposalsIndex(
			'/workspace',
			'cache',
			async () => JSON.stringify(index),
		);
		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe('f00001');
	});

	it('derives kind from id prefix when kind is missing', async () => {
		const index = {
			proposals: [
				{ id: 'f00100' },
				{ id: 'r00003' },
				{ id: 'x00052' },
			],
		};
		const result = await readProposalsIndex(
			'/workspace',
			'cache',
			async () => JSON.stringify(index),
		);
		expect(result[0]?.kind).toBe('feat');
		expect(result[1]?.kind).toBe('refactor');
		expect(result[2]?.kind).toBe('fix');
	});
});
