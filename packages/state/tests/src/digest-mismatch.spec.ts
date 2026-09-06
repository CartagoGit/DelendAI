/**
 * digest-mismatch.spec.ts — x00504 S2 acceptance.
 *
 * Pins the invariant that validateSnapshotIntegrity MUST reject
 * a snapshot whose claimed digest does not match sha256(content).
 *
 * Pre-fix, a host could store `content = "A"` and `digest =
 * sha256("B")` and the registry would treat it as coherent.
 * After the fix, the driver's `validateSnapshotIntegrity`
 * emits a `digest_mismatch` issue, and `hydrate()` surfaces
 * `ok: false, reason: 'snapshot_invalid'`.
 */

import { describe, expect, it } from 'vitest';

import { defineInMemoryStateRegistry } from '../../src/lib/driver-in-memory';
import { STATE_ABI_VERSION } from '../../src/lib/fingerprint';
import type {
	ICanonicalProjectFingerprint,
	IProducerInputSpec,
} from '../../src/lib/fingerprint';
import type {
	IStateProducer,
	IStateInputSnapshot,
} from '../../src/lib/producer';
import { sha256BytesHex } from '../../src/lib/hash';
import type { Sha256Hex } from '../../src/lib/hash';
import type { StateScope } from '../../src/lib/scope';
import { asWorktreeId } from '../../src/lib/scope';

const scope: StateScope = {
	kind: 'project',
	locator: {
		workspaceRoot: '/repo',
		worktreeId: asWorktreeId('wt-A'),
		cacheRoot: '/repo/.cache/delendai',
		docsRoot: '/repo/docs/delendai',
	},
};

const spec: IProducerInputSpec = { kind: 'file', locator: 'README.md' };
const key = 'file|README.md|';

const producer: IStateProducer = {
	id: 'docs',
	producerVersion: '0.0.1',
	abiVersion: STATE_ABI_VERSION,
	inputs: [spec],
	validateProjection: () => ({ issues: [] as readonly never[] }),
};

const fingerprint = (): ICanonicalProjectFingerprint => ({
	abiVersion: STATE_ABI_VERSION,
	producers: [],
});

describe('validateSnapshotIntegrity — digest_mismatch invariant (x00504 S2)', () => {
	it('rejects a snapshot whose entry.digest does not match sha256(content)', () => {
		const r = defineInMemoryStateRegistry({
			abiVersion: STATE_ABI_VERSION,
			snapshotFingerprint: fingerprint(),
			producers: [producer],
		});

		const bytes = new TextEncoder().encode('hello world');
		// Lie: claim the digest is sha256("goodbye"), not the
		// bytes' actual digest.
		const fakeDigest = sha256BytesHex(
			new TextEncoder().encode('goodbye'),
		) as Sha256Hex;
		const snapshot: IStateInputSnapshot = {
			fingerprint: fingerprint(),
			contents: new Map([[key, bytes]]),
			declared: [spec],
			byProducer: new Map([
				[
					'docs',
					[
						{
							spec,
							digest: fakeDigest,
							content: bytes,
						},
					],
				],
			]),
		};

		const issues = r.validateSnapshotIntegrity(snapshot);
		const mismatches = issues.filter((i) => i.kind === 'digest_mismatch');
		expect(mismatches.length).toBeGreaterThanOrEqual(1);
		expect(mismatches[0]?.key).toBe(key);
	});

	it('hydrate() propagates digest_mismatch as ok:false, reason:snapshot_invalid', () => {
		const r = defineInMemoryStateRegistry({
			abiVersion: STATE_ABI_VERSION,
			snapshotFingerprint: fingerprint(),
			producers: [producer],
		});

		const bytes = new TextEncoder().encode('hello world');
		const fakeDigest = sha256BytesHex(
			new TextEncoder().encode('goodbye'),
		) as Sha256Hex;
		const snapshot: IStateInputSnapshot = {
			fingerprint: fingerprint(),
			contents: new Map([[key, bytes]]),
			declared: [spec],
			byProducer: new Map([
				[
					'docs',
					[
						{
							spec,
							digest: fakeDigest,
							content: bytes,
						},
					],
				],
			]),
		};

		const result = r.hydrate({
			scope,
			snapshot,
			inputFingerprint: fingerprint(),
		}) as { ok: boolean; reason?: string; detail?: string };

		expect(result.ok).toBe(false);
		expect(result.reason).toBe('snapshot_invalid');
		expect(result.detail).toContain('digest_mismatch');
	});

	it('accepts a snapshot whose entry.digest matches sha256(content)', () => {
		const r = defineInMemoryStateRegistry({
			abiVersion: STATE_ABI_VERSION,
			snapshotFingerprint: fingerprint(),
			producers: [producer],
		});

		const bytes = new TextEncoder().encode('hello world');
		const honestDigest = sha256BytesHex(bytes) as Sha256Hex;
		const snapshot: IStateInputSnapshot = {
			fingerprint: fingerprint(),
			contents: new Map([[key, bytes]]),
			declared: [spec],
			byProducer: new Map([
				[
					'docs',
					[
						{
							spec,
							digest: honestDigest,
							content: bytes,
						},
					],
				],
			]),
		};

		const issues = r.validateSnapshotIntegrity(snapshot);
		expect(issues.filter((i) => i.kind === 'digest_mismatch')).toHaveLength(
			0,
		);
	});

	it('binary (non-UTF-8) content also matches sha256BytesHex exactly', () => {
		// Random bytes that are NOT valid UTF-8 (0xff standalone
		// is invalid). A round-trip through TextDecoder with
		// `fatal: false` would substitute replacement characters;
		// the driver MUST hash the raw bytes.
		const bytes = new Uint8Array([0x66, 0x6f, 0x6f, 0xff, 0x00, 0x80]);
		const honestDigest = sha256BytesHex(bytes) as Sha256Hex;

		const r = defineInMemoryStateRegistry({
			abiVersion: STATE_ABI_VERSION,
			snapshotFingerprint: fingerprint(),
			producers: [producer],
		});
		const snapshot: IStateInputSnapshot = {
			fingerprint: fingerprint(),
			contents: new Map([[key, bytes]]),
			declared: [spec],
			byProducer: new Map([
				[
					'docs',
					[
						{
							spec,
							digest: honestDigest,
							content: bytes,
						},
					],
				],
			]),
		};

		const issues = r.validateSnapshotIntegrity(snapshot);
		expect(issues.filter((i) => i.kind === 'digest_mismatch')).toHaveLength(
			0,
		);
	});
});
