import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	checkTransitionEvidence,
	evidenceFileExists,
	isEvidenceFresh,
} from '@delendai/proposals/lib/services/transition-evidence';

describe('transition-evidence', () => {
	const tempRoots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			tempRoots
				.splice(0)
				.map((root) => rm(root, { recursive: true, force: true })),
		);
	});

	const makeLogFile = async () => {
		const root = await mkdtemp(join(tmpdir(), 'transition-evidence-'));
		tempRoots.push(root);
		const logPath = join(root, 'validate.log');
		await writeFile(logPath, 'ok\n', 'utf8');
		return logPath;
	};

	it('returns missing-evidence when evidence is absent', async () => {
		await expect(checkTransitionEvidence(undefined)).resolves.toEqual({
			ok: false,
			code: 'missing-evidence',
			reason: 'validateEvidence is required to move pending/ready proposals directly to done',
		});
	});

	it('returns stale-evidence when timestamp is older than 24h', async () => {
		const logPath = await makeLogFile();
		const nowMs = Date.parse('2026-07-26T12:00:00.000Z');
		await expect(
			checkTransitionEvidence(
				{
					timestamp: '2026-07-25T11:59:59.999Z',
					exitCode: 0,
					logPath,
				},
				nowMs,
			),
		).resolves.toEqual({
			ok: false,
			code: 'stale-evidence',
			reason: 'validateEvidence.timestamp must be no older than 24 hours',
		});
	});

	it('returns invalid-evidence when logPath does not exist', async () => {
		// f00154 audit: use a fresh timestamp (relative to now) so the
		// 24h-staleness check doesn't fire before the existence check.
		// Previous hardcoded `2026-07-26T11:00:00Z` had drifted past
		// 24h whenever the suite ran more than a day after that date.
		await expect(
			checkTransitionEvidence({
				timestamp: new Date(Date.now() - 60_000).toISOString(),
				exitCode: 0,
				logPath: join(tmpdir(), 'does-not-exist.log'),
			}),
		).resolves.toEqual({
			ok: false,
			code: 'invalid-evidence',
			reason: 'validateEvidence.logPath must point to an existing file',
		});
	});

	it('returns ok for valid evidence', async () => {
		const logPath = await makeLogFile();
		await expect(
			checkTransitionEvidence({
				timestamp: new Date().toISOString(),
				exitCode: 0,
				logPath,
			}),
		).resolves.toEqual({ ok: true });
	});

	it('treats exactly 24h old evidence as fresh', () => {
		const nowMs = Date.parse('2026-07-26T12:00:00.000Z');
		expect(
			isEvidenceFresh({ timestamp: '2026-07-25T12:00:00.000Z' }, nowMs),
		).toBe(true);
	});

	it('accepts future timestamps to tolerate clock skew', () => {
		const nowMs = Date.parse('2026-07-26T12:00:00.000Z');
		expect(
			isEvidenceFresh({ timestamp: '2026-07-26T12:30:00.000Z' }, nowMs),
		).toBe(true);
	});

	it('checks file existence asynchronously', async () => {
		const logPath = await makeLogFile();
		await expect(evidenceFileExists(logPath)).resolves.toBe(true);
		await expect(
			evidenceFileExists(join(tmpdir(), 'does-not-exist.log')),
		).resolves.toBe(false);
	});
});
