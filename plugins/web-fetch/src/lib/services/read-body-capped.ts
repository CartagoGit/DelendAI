/**
 * read-body-capped.ts — a response body read up to a cap in real bytes.
 */
import type { IFetchLike } from '../contracts/interfaces/fetch.interface';

/**
 * Consume a response body up to `maxBytes` REAL bytes. Streams when the
 * fetcher exposes `body`, cancelling the reader as soon as the cap is
 * crossed; falls back to `text()` for body-less fetchers (test doubles) —
 * still capped in octets via an encode/slice round-trip. The incremental
 * decoder replaces a cap-split multi-byte sequence with U+FFFD instead of
 * emitting garbage.
 */
export const readBodyCapped = async (
	res: Awaited<ReturnType<IFetchLike>>,
	maxBytes: number,
): Promise<{ body: string; truncated: boolean }> => {
	const stream = res.body;
	if (stream === undefined || stream === null) {
		const raw = await res.text();
		const bytes = new TextEncoder().encode(raw);
		if (bytes.byteLength <= maxBytes) {
			return { body: raw, truncated: false };
		}
		return {
			body: new TextDecoder('utf-8').decode(bytes.subarray(0, maxBytes)),
			truncated: true,
		};
	}

	const reader = stream.getReader();
	const decoder = new TextDecoder('utf-8');
	let received = 0;
	let out = '';
	let truncated = false;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value === undefined || value.byteLength === 0) continue;
			const remaining = maxBytes - received;
			if (value.byteLength <= remaining) {
				received += value.byteLength;
				out += decoder.decode(value, { stream: true });
				continue;
			}
			// Cap crossed mid-chunk: keep the fitting prefix, stop the
			// download — the cancel is the memory/bandwidth bound.
			out += decoder.decode(value.subarray(0, remaining), {
				stream: true,
			});
			truncated = true;
			await reader.cancel();
			break;
		}
	} finally {
		reader.releaseLock();
	}
	out += decoder.decode(); // flush a trailing partial sequence (U+FFFD)
	return { body: out, truncated };
};
