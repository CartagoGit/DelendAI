/**
 * hash.ts — canonical serialisation + SHA-256.
 *
 * q00018 Phase 0.1. Pure-TypeScript SHA-256 (NIST FIPS 180-4) so
 * the package stays free of Node's `crypto`. The 64-bit message
 * length trailer is written BIG-ENDIAN with HIGH 32 bits THEN
 * LOW 32 bits (the previous Phase 0 wrote the two halves in the
 * opposite order, producing non-standard digests that just
 * happened to satisfy the tests we had).
 *
 * Determinism rules:
 *
 *   - object keys are sorted lexicographically before serialisation
 *   - arrays preserve caller order (the producer / hash caller is
 *     responsible for sorting when order is semantically
 *     irrelevant)
 *   - `undefined` values are stripped (objects) or mapped to
 *     `null` (arrays)
 *   - `null` is kept as `null`
 *   - timestamps are never part of the canonical payload (the
 *     producer keeps them in `LOCAL_METADATA_KEYS`-prefixed fields)
 *
 * Verified against standard test vectors:
 *
 *   sha256("")   = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
 *   sha256("abc")= ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
 */

export type Sha256Hex = string;

export type CanonicalJsonValue =
	| string
	| number
	| boolean
	| null
	| CanonicalJsonValue[]
	| { readonly [k: string]: CanonicalJsonValue };

/** Anything the producer may return from `canonicalize()`. */
export type CanonicalProjection = CanonicalJsonValue;

/** Metadata fields that must NOT enter the canonical hash. */
export const LOCAL_METADATA_KEYS: readonly string[] = [
	'generated_at',
	'hydrated_at',
	'rebuild_duration_ms',
	'observed_at',
	'pid',
	'hostname',
	'created_at',
	'last_seen_at',
	'last_seen',
] as const;

/** Strip every listed key from the projection (recursively). */
export function withoutLocalMetadata<T extends CanonicalJsonValue>(
	projection: T,
	extraKeys: readonly string[] = [],
): T {
	const skip = new Set<string>([...LOCAL_METADATA_KEYS, ...extraKeys]);
	return stripLocalMetadataInternal(projection, skip) as T;
}

function stripLocalMetadataInternal(
	value: CanonicalJsonValue,
	skip: ReadonlySet<string>,
): CanonicalJsonValue {
	if (value === null) return null;
	if (Array.isArray(value)) {
		return value.map((v) =>
			typeof v === 'object' && v !== null
				? stripLocalMetadataInternal(v as CanonicalJsonValue, skip)
				: (v as CanonicalJsonValue),
		);
	}
	if (typeof value === 'object') {
		const out: Record<string, CanonicalJsonValue> = {};
		for (const [k, v] of Object.entries(value)) {
			if (skip.has(k)) continue;
			if (typeof v === 'object' && v !== null) {
				out[k] = stripLocalMetadataInternal(
					v as CanonicalJsonValue,
					skip,
				);
			} else {
				out[k] = v as CanonicalJsonValue;
			}
		}
		return out;
	}
	return value;
}

/** Stable JSON serialisation (sorted keys, undefined stripped). */
export function canonicalStringify(value: CanonicalJsonValue): string {
	const cleaned = stripUndefinedForStringify(value);
	return JSON.stringify(cleaned, replacerSortedKeys);
}

function stripUndefinedForStringify(
	value: CanonicalJsonValue,
): CanonicalJsonValue {
	if (value === null) return null;
	if (Array.isArray(value)) {
		return value.map((v) =>
			typeof v === 'object' && v !== null
				? stripUndefinedForStringify(v as CanonicalJsonValue)
				: v === undefined
					? null
					: (v as CanonicalJsonValue),
		);
	}
	if (typeof value === 'object') {
		const out: Record<string, CanonicalJsonValue> = {};
		for (const [k, v] of Object.entries(value)) {
			if (v === undefined) continue;
			if (typeof v === 'object' && v !== null) {
				out[k] = stripUndefinedForStringify(v as CanonicalJsonValue);
			} else if (v !== undefined) {
				out[k] = v as CanonicalJsonValue;
			}
		}
		return out;
	}
	return value;
}

function replacerSortedKeys(_key: string, value: unknown): unknown {
	if (value === null) return null;
	if (Array.isArray(value)) return value;
	if (typeof value === 'object') {
		const sorted: Record<string, unknown> = {};
		for (const k of Object.keys(value as Record<string, unknown>).sort()) {
			sorted[k] = (value as Record<string, unknown>)[k];
		}
		return sorted;
	}
	return value;
}

/**
 * Compute the canonical state hash of a projection. Strips
 * local metadata (configurable via `extraSkipKeys`) and returns
 * a lower-case sha256 hex digest.
 */
export function canonicalStateHash(
	projection: CanonicalJsonValue,
	extraSkipKeys: readonly string[] = [],
): Sha256Hex {
	const purged = withoutLocalMetadata(projection, extraSkipKeys);
	const serialised = canonicalStringify(purged);
	return sha256Hex(serialised);
}

/**
 * Lower-case hex sha256 of a UTF-8 string. Independent of Node
 * so the State Engine can run in any host.
 */
export function sha256Hex(input: string): Sha256Hex {
	const bytes = textToUtf8Bytes(input);
	const hash = sha256Bytes(bytes);
	return bytesToHex(hash);
}

/**
 * Lower-case hex sha256 of an arbitrary byte sequence. Use this
 * for content that is NOT a valid UTF-8 string (git blobs,
 * opaque binary cache entries, anything that would lose data on
 * TextDecoder replacement decoding).
 *
 * Phase 0.3 (x00504 / reviewer): the integrity invariant
 * `entry.digest === sha256(entry.content)` MUST hold byte for
 * byte; hashing bytes-as-UTF-8 with `fatal: false` would silently
 * substitute replacement characters for invalid sequences,
 * letting two hosts that disagree on the same content produce
 * the same digest. This primitive is the only one the State
 * Engine should call for byte-exact hashing.
 */
export function sha256BytesHex(input: Uint8Array): Sha256Hex {
	const hash = sha256Bytes(input);
	return bytesToHex(hash);
}

// --- SHA-256 (NIST FIPS 180-4) -----------------------------------------

const K = new Uint32Array([
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
	0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
	0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
	0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
	0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
	0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
	0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
	0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
	0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256Bytes(message: Uint8Array): Uint8Array {
	const len = message.length;
	const bitLen = BigInt(len) * 8n;
	// Padding: append 0x80, then zero bytes, until the length
	// is congruent to 56 modulo 64 (so the last 8 bytes hold the
	// length).
	const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
	padded.set(message);
	padded[len] = 0x80;
	const view = new DataView(padded.buffer);
	// Big-endian 64-bit length: HIGH 32 bits THEN LOW 32 bits.
	// FIPS 180-4 §5.1.1.
	view.setUint32(
		padded.length - 8,
		Number((bitLen >> 32n) & 0xffffffffn),
		false,
	);
	view.setUint32(padded.length - 4, Number(bitLen & 0xffffffffn), false);

	const H = new Uint32Array([
		0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
		0x1f83d9ab, 0x5be0cd19,
	]);

	const W = new Uint32Array(64);
	for (let chunk = 0; chunk < padded.length; chunk += 64) {
		for (let i = 0; i < 16; i += 1) {
			W[i] = view.getUint32(chunk + i * 4, false);
		}
		for (let i = 16; i < 64; i += 1) {
			const w15 = W[i - 15] as number;
			const w2 = W[i - 2] as number;
			const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
			const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
			const w7 = W[i - 7] as number;
			const w16 = W[i - 16] as number;
			W[i] = (w16 + s0 + w7 + s1) >>> 0;
		}

		let a = H[0] as number;
		let b = H[1] as number;
		let c = H[2] as number;
		let d = H[3] as number;
		let e = H[4] as number;
		let f = H[5] as number;
		let g = H[6] as number;
		let h = H[7] as number;

		for (let i = 0; i < 64; i += 1) {
			const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
			const ch = (e & f) ^ (~e & g);
			const temp1 =
				(h + S1 + ch + (K[i] as number) + (W[i] as number)) >>> 0;
			const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
			const mj = (a & b) ^ (a & c) ^ (b & c);
			const temp2 = (S0 + mj) >>> 0;
			h = g;
			g = f;
			f = e;
			e = (d + temp1) >>> 0;
			d = c;
			c = b;
			b = a;
			a = (temp1 + temp2) >>> 0;
		}

		H[0] = ((H[0] as number) + a) >>> 0;
		H[1] = ((H[1] as number) + b) >>> 0;
		H[2] = ((H[2] as number) + c) >>> 0;
		H[3] = ((H[3] as number) + d) >>> 0;
		H[4] = ((H[4] as number) + e) >>> 0;
		H[5] = ((H[5] as number) + f) >>> 0;
		H[6] = ((H[6] as number) + g) >>> 0;
		H[7] = ((H[7] as number) + h) >>> 0;
	}

	const out = new Uint8Array(32);
	const outView = new DataView(out.buffer);
	for (let i = 0; i < 8; i += 1) {
		outView.setUint32(i * 4, H[i] as number, false);
	}
	return out;
}

function rotr(x: number, n: number): number {
	return ((x >>> n) | (x << (32 - n))) >>> 0;
}

const HEX = '0123456789abcdef';

function bytesToHex(bytes: Uint8Array): string {
	let s = '';
	for (let i = 0; i < bytes.length; i += 1) {
		const b = bytes[i] as number;
		s += HEX[(b >>> 4) & 0xf];
		s += HEX[b & 0xf];
	}
	return s;
}

function textToUtf8Bytes(text: string): Uint8Array {
	if (typeof TextEncoder !== 'undefined') {
		return new TextEncoder().encode(text);
	}
	const bytes: number[] = [];
	for (let i = 0; i < text.length; i += 1) {
		let codePoint = text.charCodeAt(i);
		if (codePoint >= 0xd800 && codePoint <= 0xdbff && i + 1 < text.length) {
			const next = text.charCodeAt(i + 1);
			if (next >= 0xdc00 && next <= 0xdfff) {
				codePoint =
					0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00);
				i += 1;
			}
		}
		if (codePoint < 0x80) {
			bytes.push(codePoint);
		} else if (codePoint < 0x800) {
			bytes.push(0xc0 | (codePoint >> 6));
			bytes.push(0x80 | (codePoint & 0x3f));
		} else if (codePoint < 0x10000) {
			bytes.push(0xe0 | (codePoint >> 12));
			bytes.push(0x80 | ((codePoint >> 6) & 0x3f));
			bytes.push(0x80 | (codePoint & 0x3f));
		} else {
			bytes.push(0xf0 | (codePoint >> 18));
			bytes.push(0x80 | ((codePoint >> 12) & 0x3f));
			bytes.push(0x80 | ((codePoint >> 6) & 0x3f));
			bytes.push(0x80 | (codePoint & 0x3f));
		}
	}
	return new Uint8Array(bytes);
}

/**
 * The standard FIPS 180-4 test vectors. Re-exported so other
 * tests can use them as fixtures.
 */
export const SHA256_STANDARD_VECTORS: ReadonlyArray<{
	readonly input: string;
	readonly hex: Sha256Hex;
}> = [
	{
		input: '',
		hex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
	},
	{
		input: 'abc',
		hex: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
	},
	{
		input: 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
		hex: '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
	},
] as const;
