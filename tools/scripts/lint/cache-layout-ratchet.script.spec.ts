import { describe, expect, it } from 'vitest';

import type { ICacheLayoutManifest } from '../../../packages/core/src/lib/contracts/interfaces/cache-layout.interface';
import { judgeRatchet, manifestChecksum } from './cache-layout-ratchet.script';

const manifest = (paths: readonly string[]): ICacheLayoutManifest => ({
	epoch: 1,
	artifacts: paths.map((path) => ({
		id: path,
		owner: 'x',
		path,
		class: 'derived',
	})),
});

describe('cache-layout-ratchet', () => {
	it('does not depend on the order of the artifacts', () => {
		expect(manifestChecksum(manifest(['a', 'b']))).toBe(
			manifestChecksum(manifest(['b', 'a'])),
		);
	});

	it('notices a changed artifact list', () => {
		expect(manifestChecksum(manifest(['a']))).not.toBe(
			manifestChecksum(manifest(['a', 'b'])),
		);
	});

	it('passes when nothing moved', () => {
		expect(
			judgeRatchet(
				{ epoch: 5, checksum: 'a' },
				{ epoch: 5, checksum: 'a' },
			),
		).toEqual({ ok: true });
	});

	it('fails when the artifacts changed and the epoch did not', () => {
		const verdict = judgeRatchet(
			{ epoch: 5, checksum: 'a' },
			{ epoch: 5, checksum: 'b' },
		);
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.message).toContain('Raise the epoch');
	});

	it('asks for the snapshot to be re-recorded once the epoch rose', () => {
		const verdict = judgeRatchet(
			{ epoch: 5, checksum: 'a' },
			{ epoch: 6, checksum: 'b' },
		);
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.message).toContain('--update');
	});

	it('refuses an epoch that goes down', () => {
		const verdict = judgeRatchet(
			{ epoch: 5, checksum: 'a' },
			{ epoch: 4, checksum: 'a' },
		);
		expect(verdict.ok).toBe(false);
	});
});
