/**
 * read-capped.ts — at most `limit` bytes of a response body, read while
 * it streams.
 *
 * A job log or an artifact was read whole into memory and only then cut
 * to `maxBytes`. Reading stops, and the download is cancelled, once
 * `limit` bytes have arrived.
 */
import type { IRemoteFetchResponse } from './client';

export const readCapped = async (
	response: IRemoteFetchResponse,
	limit: number,
): Promise<Uint8Array> => {
	const stream = response.body;
	if (stream === undefined || stream === null) {
		const whole =
			response.arrayBuffer === undefined
				? new TextEncoder().encode(await response.text())
				: new Uint8Array(await response.arrayBuffer());
		return whole.subarray(0, limit);
	}
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let received = 0;
	try {
		while (received < limit) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value === undefined) continue;
			const fitting = value.subarray(0, limit - received);
			chunks.push(fitting);
			received += fitting.byteLength;
		}
		if (received >= limit) await reader.cancel();
	} finally {
		reader.releaseLock();
	}
	const out = new Uint8Array(received);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
};
