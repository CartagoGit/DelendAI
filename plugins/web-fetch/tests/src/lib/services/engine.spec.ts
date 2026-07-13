/**
 * engine.spec.ts (services) — streaming byte cap (x00097 S4, audit
 * a00052 #14).
 *
 * The engine used to `await res.text()` (unbounded buffering), measure
 * UTF-16 units and slice after the fact. It must now: count REAL octets,
 * cancel the reader the moment the cap is crossed (an infinite body
 * terminates), decode incrementally so multi-byte UTF-8 split across
 * chunk boundaries survives, and keep the abort timer armed through the
 * body read.
 */
import { describe, expect, it } from 'vitest';

import type { IFetchLike } from '../../../../src/lib/contracts/interfaces/fetch.interface';
import { webFetch } from '../../../../src/lib/services/engine';

const ALLOW = ['example.com'];
const URL_OK = 'https://example.com/data';

type FetchResponse = Awaited<ReturnType<IFetchLike>>;

const headers = (map: Record<string, string> = {}) => ({
	get: (name: string) => map[name.toLowerCase()] ?? null,
});

/** A 200 response whose body streams the given chunks. */
const streamResponse = (
	chunks: readonly Uint8Array[],
	onCancel?: () => void,
): FetchResponse => {
	let index = 0;
	const body = new ReadableStream<Uint8Array>({
		pull(controller) {
			const chunk = chunks[index];
			index += 1;
			if (chunk === undefined) {
				controller.close();
				return;
			}
			controller.enqueue(chunk);
		},
		cancel() {
			onCancel?.();
		},
	});
	return {
		ok: true,
		status: 200,
		headers: headers({ 'content-type': 'text/plain' }),
		body,
		text: () => Promise.reject(new Error('streaming path must not text()')),
	};
};

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('webFetch streaming byte cap (x00097 S4)', () => {
	it('caps in real octets and cancels the reader mid-stream', async () => {
		let cancelled = false;
		let pulls = 0;
		// An endless body: only an in-flight cancel can terminate the fetch.
		const endless = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulls += 1;
				controller.enqueue(encode('x'.repeat(1024)));
			},
			cancel() {
				cancelled = true;
			},
		});
		const fetcher: IFetchLike = async () => ({
			ok: true,
			status: 200,
			headers: headers(),
			body: endless,
			text: () => Promise.reject(new Error('unreachable')),
		});

		const result = await webFetch(
			{ url: URL_OK, allowList: ALLOW, maxBytes: 4096 },
			fetcher,
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.truncated).toBe(true);
		expect(new TextEncoder().encode(result.body).byteLength).toBe(4096);
		expect(cancelled).toBe(true);
		// Bounded consumption: ~5 pulls for a 4 KiB cap, never hundreds.
		expect(pulls).toBeLessThanOrEqual(8);
	});

	it('decodes multi-byte UTF-8 split across chunk boundaries', async () => {
		// '€' is E2 82 AC — split it across two chunks.
		const euro = encode('€');
		const fetcher: IFetchLike = async () =>
			streamResponse([
				encode('a').slice(),
				euro.subarray(0, 1),
				euro.subarray(1),
				encode('b'),
			]);

		const result = await webFetch(
			{ url: URL_OK, allowList: ALLOW },
			fetcher,
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.body).toBe('a€b');
		expect(result.truncated).toBe(false);
	});

	it('a cap that lands inside a multi-byte char yields no mojibake', async () => {
		// 'aa' + '€': cap at 3 bytes cuts the euro after its first byte.
		const fetcher: IFetchLike = async () => streamResponse([encode('aa€')]);

		const result = await webFetch(
			{ url: URL_OK, allowList: ALLOW, maxBytes: 3 },
			fetcher,
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.truncated).toBe(true);
		// The split sequence collapses to a single replacement char.
		expect(result.body).toBe('aa�');
	});

	it('counts octets, not UTF-16 units (the audited contract bug)', async () => {
		// 10 × '€' = 10 UTF-16 units but 30 bytes. A 30-byte cap must NOT
		// truncate; the old length-based check would have sliced at 30
		// "characters" but flagged nothing — and a 29-byte cap must.
		const body = '€'.repeat(10);
		const fetcher: IFetchLike = async () => streamResponse([encode(body)]);

		const full = await webFetch(
			{ url: URL_OK, allowList: ALLOW, maxBytes: 30 },
			fetcher,
		);
		expect(full.ok && !full.truncated && full.body === body).toBe(true);

		const capped = await webFetch(
			{ url: URL_OK, allowList: ALLOW, maxBytes: 29 },
			async () => streamResponse([encode(body)]),
		);
		expect(capped.ok).toBe(true);
		if (!capped.ok) return;
		expect(capped.truncated).toBe(true);
		expect(capped.body).toBe(`${'€'.repeat(9)}�`);
	});

	it('body-less fetchers (test doubles) fall back to text(), still byte-capped', async () => {
		const fetcher: IFetchLike = async () => ({
			ok: true,
			status: 200,
			headers: headers(),
			text: async () => '€€€€', // 12 bytes
		});

		const result = await webFetch(
			{ url: URL_OK, allowList: ALLOW, maxBytes: 6 },
			fetcher,
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.truncated).toBe(true);
		expect(result.body).toBe('€€');
	});

	it('the timeout covers a trickling body, not just the headers', async () => {
		// Headers arrive instantly; the body never does. The engine must
		// resolve with a timeout instead of hanging past the deadline.
		let ctl: ReadableStreamDefaultController<Uint8Array> | undefined;
		const stuck = new ReadableStream<Uint8Array>({
			start(controller) {
				ctl = controller; // no pull: reads stay pending forever
			},
		});
		const fetcher: IFetchLike = async (_url, init) => {
			// Real fetch rejects pending body reads on abort; the double
			// mirrors that by erroring the stream from the signal.
			init?.signal?.addEventListener('abort', () => {
				ctl?.error(
					Object.assign(new Error('The operation was aborted.'), {
						name: 'AbortError',
					}),
				);
			});
			return {
				ok: true,
				status: 200,
				headers: headers(),
				body: stuck,
				text: () => Promise.reject(new Error('unreachable')),
			};
		};

		const result = await webFetch(
			{ url: URL_OK, allowList: ALLOW, timeoutMs: 50 },
			fetcher,
		);

		expect(result).toEqual(
			expect.objectContaining({ ok: false, reason: 'timeout' }),
		);
	}, 2000);
});
