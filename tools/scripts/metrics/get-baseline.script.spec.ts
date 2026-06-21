#!/usr/bin/env bun
import { describe, expect, it } from 'vitest';

import { getBaselineSnapshot, type IFetchLike } from './get-baseline.script.ts';

const jsonResponse = (status: number, body: unknown): ReturnType<IFetchLike> =>
	Promise.resolve({
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve(body),
		text: () => Promise.resolve(JSON.stringify(body)),
	});

describe('getBaselineSnapshot', () => {
	it('resolves the snapshot when the tag exists and has the asset', async () => {
		const snapshot = {
			at: '2026-06-21T00:00:00.000Z',
			tools: {
				'mcp-vertex_overview': {
					calls: 1,
					errors: 0,
					totalMs: 5,
					maxMs: 5,
					totalBytes: 318,
				},
			},
			totals: { calls: 1, errors: 0, totalMs: 5, totalBytes: 318 },
		};
		const fetchImpl: IFetchLike = (url) => {
			if (url.includes('/releases/latest')) {
				return jsonResponse(200, {
					tag_name: 'v1.2.3',
					assets: [
						{
							name: 'metrics-baseline.json',
							browser_download_url: 'https://example.test/asset',
						},
					],
				});
			}
			return jsonResponse(200, snapshot);
		};

		const result = await getBaselineSnapshot(
			'CartagoGit',
			'mcp-vertex',
			fetchImpl,
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.tag).toBe('v1.2.3');
			expect(result.snapshot).toEqual(snapshot);
		}
	});

	it('reports "no-previous-release" when there is no tag yet (404)', async () => {
		const fetchImpl: IFetchLike = () => jsonResponse(404, {});

		const result = await getBaselineSnapshot(
			'CartagoGit',
			'mcp-vertex',
			fetchImpl,
		);

		expect(result).toEqual({ ok: false, reason: 'no-previous-release' });
	});

	it('reports "rate-limited" on a 403/429 from the GitHub API', async () => {
		const fetchImpl: IFetchLike = () => jsonResponse(429, {});

		const result = await getBaselineSnapshot(
			'CartagoGit',
			'mcp-vertex',
			fetchImpl,
		);

		expect(result).toEqual({ ok: false, reason: 'rate-limited' });
	});

	it('reports "malformed-json" when the release response cannot be parsed', async () => {
		const fetchImpl: IFetchLike = () =>
			Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.reject(new Error('unexpected token')),
				text: () => Promise.resolve('not json'),
			});

		const result = await getBaselineSnapshot(
			'CartagoGit',
			'mcp-vertex',
			fetchImpl,
		);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe('malformed-json');
		}
	});

	it('reports "no-snapshot-asset" when the release has no metrics-baseline.json asset', async () => {
		const fetchImpl: IFetchLike = () =>
			jsonResponse(200, { tag_name: 'v1.0.0', assets: [] });

		const result = await getBaselineSnapshot(
			'CartagoGit',
			'mcp-vertex',
			fetchImpl,
		);

		expect(result).toEqual({ ok: false, reason: 'no-snapshot-asset' });
	});
});
