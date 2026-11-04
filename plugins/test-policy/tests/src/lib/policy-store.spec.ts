import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import {
	readPolicyOverride,
	writePolicyOverride,
} from '../../../src/lib/policy-store';

let cacheDir: string;

beforeEach(async () => {
	cacheDir = await mkdtemp(join(tmpdir(), 'test-policy-store-'));
});

describe('policy-store', () => {
	it('returns null when no override was ever written', async () => {
		expect(await readPolicyOverride(cacheDir)).toBeNull();
	});

	it('round-trips an override with its reason', async () => {
		await writePolicyOverride(cacheDir, {
			mode: 'tests-after',
			reason: 'spike week',
		});
		const read = await readPolicyOverride(cacheDir);
		expect(read?.mode).toBe('tests-after');
		expect(read?.reason).toBe('spike week');
		expect(typeof read?.setAt).toBe('string');
	});

	// x00190: `reason` used to be persisted verbatim and later echoed
	// back to every future caller via get_test_policy's `overrideReason`
	// — a durable, re-surfaced value with zero redaction.
	it('redacts a high-confidence secret out of reason before persisting', async () => {
		await writePolicyOverride(cacheDir, {
			mode: 'tests-after',
			reason: 'disabling TDD, key sk-ant-api03-abcdefghijklmnop leaked',
		});
		const read = await readPolicyOverride(cacheDir);
		expect(read?.reason).not.toContain('sk-ant-api03-abcdefghijklmnop');
		expect(read?.reason).toContain('[REDACTED]');
		const raw = await readFile(join(cacheDir, 'policy.json'), 'utf8');
		expect(raw).not.toContain('sk-ant-api03-abcdefghijklmnop');
	});

	it('the write is durable JSON on disk (atomic path)', async () => {
		await writePolicyOverride(cacheDir, { mode: 'none' });
		const raw = await readFile(join(cacheDir, 'policy.json'), 'utf8');
		expect(JSON.parse(raw).mode).toBe('none');
	});

	it('quarantines a corrupt file and treats it as absent (corrupt != empty)', async () => {
		await writeFile(join(cacheDir, 'policy.json'), '{ not json', 'utf8');
		expect(await readPolicyOverride(cacheDir)).toBeNull();
		// The corrupt payload must be preserved aside, not destroyed.
		const entries = await readdir(cacheDir);
		expect(entries.some((name) => name !== 'policy.json')).toBe(true);
	});

	it('a file with an unknown mode is rejected as corrupt, not honoured', async () => {
		await writeFile(
			join(cacheDir, 'policy.json'),
			JSON.stringify({ mode: 'yolo', setAt: new Date().toISOString() }),
			'utf8',
		);
		expect(await readPolicyOverride(cacheDir)).toBeNull();
	});
});
