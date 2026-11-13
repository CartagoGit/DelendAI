/**
 * pinned-connection.ts — the network fetch that connects to the address
 * the address policy validated, and to nothing else.
 *
 * The runtime's `fetch` takes a URL and resolves its name itself, so the
 * address it connects to is a second answer of the resolver: one that
 * answered a public address to the check could answer a private one to the
 * connection (DNS rebinding). This request is made to the validated
 * address itself, with the requested host kept where the server reads it:
 * the `Host` header and, over TLS, the server name (SNI) the certificate
 * is checked against. Nothing here resolves a name.
 */
// effect-boundary-authorized: web-fetch is the governed network engine; this is the one connection it opens.
import { request as httpRequest } from 'node:http';
import type { IncomingMessage, RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';

import type { IFetchLike } from '../contracts/interfaces/fetch.interface';

/** The statuses `ok` stands for, as `fetch` defines it. */
const OK_STATUS_MIN = 200;
const OK_STATUS_MAX = 300;

/**
 * The options of a request to `url` made at `address`: the socket goes to
 * the address, the `Host` header and the TLS server name stay the URL's.
 */
export const pinnedRequestOptions = (
	url: URL,
	address: string,
	init: Parameters<IFetchLike>[1] = {},
): RequestOptions & { readonly servername?: string } => {
	const hostname = url.hostname.replace(/^\[|\]$/gu, '');
	return {
		host: address.replace(/^\[|\]$/gu, ''),
		family: isIP(address.replace(/^\[|\]$/gu, '')) === 6 ? 6 : 4,
		...(url.port === '' ? {} : { port: Number(url.port) }),
		path: `${url.pathname}${url.search}`,
		method: init.method ?? 'GET',
		headers: { ...init.headers, host: url.host },
		// SNI takes a name, never an address literal.
		...(url.protocol === 'https:' && isIP(hostname) === 0
			? { servername: hostname }
			: {}),
		...(init.signal === undefined ? {} : { signal: init.signal }),
	};
};

/** A fetch whose every connection goes to `address`, whatever the URL's name resolves to. */
export const pinnedFetch =
	(address: string): IFetchLike =>
	(raw, init = {}) =>
		new Promise((done, fail) => {
			const url = new URL(raw);
			const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
			const req = send(
				pinnedRequestOptions(url, address, init),
				(res: IncomingMessage) => {
					const status = res.statusCode ?? 0;
					const body = Readable.toWeb(
						res,
					) as unknown as ReadableStream<Uint8Array>;
					done({
						ok: status >= OK_STATUS_MIN && status < OK_STATUS_MAX,
						status,
						headers: {
							get: (name) => {
								const value = res.headers[name.toLowerCase()];
								return value === undefined
									? null
									: Array.isArray(value)
										? value.join(', ')
										: value;
							},
						},
						body,
						text: async () => new Response(body).text(),
					});
				},
			);
			req.on('error', fail);
			if (init.body !== undefined) req.write(init.body);
			req.end();
		});
