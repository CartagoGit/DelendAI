/**
 * public-catalogue-http.spec.ts — the conditional GET a catalogue source
 * is asked with, against a real local server, and where copies are kept.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { homedir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	catalogueCacheDir,
	catalogueCachePath,
	httpConditionalFetch,
} from '../../../../src/lib/shared/public-catalogue-sources.service';

describe('httpConditionalFetch', () => {
	let server: Server;
	let url = '';
	const seen: Array<Record<string, string | undefined>> = [];

	beforeEach(async () => {
		seen.length = 0;
		server = createServer((request, response) => {
			const etag = request.headers['if-none-match'];
			seen.push({
				etag,
				since: request.headers['if-modified-since'],
			});
			if (etag === '"v1"') {
				response.writeHead(304).end();
				return;
			}
			response
				.writeHead(200, {
					etag: '"v1"',
					'last-modified': 'Mon, 26 Oct 2026 00:00:00 GMT',
				})
				.end('{"items":[]}');
		});
		await new Promise<void>((resolve) =>
			server.listen(0, '127.0.0.1', () => resolve()),
		);
		url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/c.json`;
	});

	afterEach(async () => {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});

	it('reads a fresh body with its validators, and sends them back to learn it is unchanged', async () => {
		const fresh = await httpConditionalFetch(url, { timeoutMs: 5_000 });
		expect(fresh).toEqual({
			status: 200,
			body: '{"items":[]}',
			etag: '"v1"',
			lastModified: 'Mon, 26 Oct 2026 00:00:00 GMT',
		});
		const again = await httpConditionalFetch(url, {
			etag: fresh.etag,
			lastModified: fresh.lastModified,
			timeoutMs: 5_000,
		});
		expect(again.status).toBe(304);
		expect(again.body).toBeUndefined();
		expect(seen[1]).toEqual({
			etag: '"v1"',
			since: 'Mon, 26 Oct 2026 00:00:00 GMT',
		});
	});
});

describe('catalogue copies', () => {
	it('are kept one per kind in the user cache folder', () => {
		expect(catalogueCacheDir().startsWith(homedir())).toBe(true);
		expect(catalogueCachePath('models')).toBe(
			`${catalogueCacheDir()}/models.json`,
		);
	});
});
