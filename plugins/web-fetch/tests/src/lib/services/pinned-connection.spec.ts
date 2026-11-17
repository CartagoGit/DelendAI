/**
 * pinned-connection.spec.ts — the network fetch goes to the validated
 * address, while the Host header and the TLS name stay the requested host,
 * so a name the resolver answers differently later is never asked again.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import type { IFetchLike } from '../../../../src/lib/contracts/interfaces/fetch.interface';
import { webFetch } from '../../../../src/lib/services/engine';
import {
	pinnedFetch,
	pinnedRequestOptions,
} from '../../../../src/lib/services/pinned-connection';

type FetchResponse = Awaited<ReturnType<IFetchLike>>;
const ALLOW = ['example.com'];
const URL_OK = 'https://example.com/data';
const headers = (map: Record<string, string> = {}) => ({
	get: (name: string) => map[name.toLowerCase()] ?? null,
});
const okResponse = (): FetchResponse => ({
	ok: true,
	status: 200,
	headers: headers(),
	body: null,
	text: async () => 'ok',
});

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
	await Promise.all(
		servers
			.splice(0)
			.map((server) => new Promise((done) => server.close(done))),
	);
});

/** A server on 127.0.0.1 that answers with the Host header it was sent. */
const hostEcho = async (): Promise<number> => {
	const server = createServer((req, res) => {
		res.writeHead(200, { 'content-type': 'text/plain' });
		res.end(`host=${req.headers.host ?? ''}`);
	});
	servers.push(server);
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	return (server.address() as AddressInfo).port;
};

describe('pinnedRequestOptions', () => {
	it('connects to the address and keeps the host as Host header and TLS name', () => {
		const options = pinnedRequestOptions(
			new URL('https://example.com/data?q=1'),
			'93.184.216.34',
			{ headers: { accept: 'text/plain' } },
		);
		expect(options).toMatchObject({
			host: '93.184.216.34',
			family: 4,
			path: '/data?q=1',
			method: 'GET',
			servername: 'example.com',
			headers: { accept: 'text/plain', host: 'example.com' },
		});
	});

	it('gives no TLS name for an address literal, and reads an IPv6 address', () => {
		const options = pinnedRequestOptions(
			new URL('https://[2001:db8::1]:8443/'),
			'[2001:db8::1]',
		);
		expect(options).toMatchObject({
			host: '2001:db8::1',
			family: 6,
			port: 8443,
		});
		expect(options).not.toHaveProperty('servername');
	});
});

describe('pinnedFetch', () => {
	it('reaches the address for a name that resolves nowhere, with that name as Host', async () => {
		const port = await hostEcho();
		const res = await pinnedFetch('127.0.0.1')(
			`http://not-resolvable.invalid:${String(port)}/`,
		);
		expect(res.status).toBe(200);
		expect(res.headers.get('Content-Type')).toBe('text/plain');
		expect(await res.text()).toBe(
			`host=not-resolvable.invalid:${String(port)}`,
		);
	});

	it('fails rather than resolve when the address does not answer', async () => {
		await expect(
			pinnedFetch('127.0.0.1')('http://example.com:1/'),
		).rejects.toThrow();
	});
});

describe('webFetch over the network, against a rebinding resolver', () => {
	it('connects to the first, validated answer and never asks the resolver again', async () => {
		const port = await hostEcho();
		const answers = [['127.0.0.1'], ['10.255.255.1']];
		let calls = 0;
		const result = await webFetch(
			{
				url: `http://rebind.invalid:${String(port)}/`,
				allowList: [`rebind.invalid:${String(port)}`],
				allowPrivateAddresses: true,
			},
			undefined,
			async () => answers[Math.min(calls++, 1)] ?? [],
		);
		expect(result).toMatchObject({
			ok: true,
			body: `host=rebind.invalid:${String(port)}`,
		});
		expect(calls).toBe(1);
	});
});

describe('webFetch connects to the address it validated (x01028)', () => {
	/** A resolver that answers a public address first and a private one after. */
	const rebinding = () => {
		const answers = [['93.184.216.34'], ['127.0.0.1']];
		let calls = 0;
		return {
			resolve: async () => {
				const answer = answers[Math.min(calls, answers.length - 1)];
				calls += 1;
				return answer ?? [];
			},
			calls: () => calls,
		};
	};

	it('hands the connection the validated address, never a second answer', async () => {
		const dns = rebinding();
		const seen: (string | undefined)[] = [];
		const fetcher: IFetchLike = async (_url, init) => {
			seen.push(init?.address);
			return okResponse();
		};
		const result = await webFetch(
			{ url: URL_OK, allowList: ALLOW },
			fetcher,
			dns.resolve,
		);
		expect(result.ok).toBe(true);
		expect(seen).toEqual(['93.184.216.34']);
		expect(dns.calls()).toBe(1);
	});

	it('cannot reach the private address a rebinding resolver answers next', async () => {
		const dns = rebinding();
		const seen: (string | undefined)[] = [];
		const fetcher: IFetchLike = async (_url, init) => {
			seen.push(init?.address);
			return {
				ok: false,
				status: 302,
				headers: headers({ location: 'https://example.com/again' }),
				body: null,
				text: async () => '',
			};
		};
		const result = await webFetch(
			{ url: URL_OK, allowList: ALLOW },
			fetcher,
			dns.resolve,
		);
		expect(result).toMatchObject({
			ok: false,
			reason: 'blocked-address',
			detail: 'example.com resolves to 127.0.0.1',
		});
		expect(seen).toEqual(['93.184.216.34']);
	});
});
