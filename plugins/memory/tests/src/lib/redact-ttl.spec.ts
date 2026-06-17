/**
 * redact-ttl.spec.ts (M11)
 *
 * Memory must never persist a credential, and notes can self-expire.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { redactSecrets } from '@cartago-git/mcp-memory/lib/redact';
import {
	readStore,
	recall,
	saveNote,
	writeStore,
	type INote,
} from '@cartago-git/mcp-memory/lib/store';

// Secret fixtures are assembled from split parts so the SOURCE never holds a
// contiguous, real-looking token (otherwise GitHub push-protection blocks the
// commit). `tok()` rebuilds the exact shape at runtime, which is what the
// redaction regexes actually match against.
const tok = (...parts: string[]): string => parts.join('');

describe('redactSecrets (M11)', () => {
	it('redacts well-known secret shapes', () => {
		const samples = [
			tok('AK', 'IA', 'IOSFODNN7EXAMPLE'),
			tok('gh', 'p', '_', '0123456789abcdefghijklmnopqrstuvwxyz'),
			tok('AI', 'za', 'a'.repeat(35)),
			tok('xo', 'xb', '-123456789012-abcdefghijklmnop'),
			tok('sk', '_live_', '0123456789abcdefghij'),
			tok('ey', 'J', 'hbGci.payloadXYZ012.sigABC345'),
		];
		for (const s of samples) {
			const r = redactSecrets(`value is ${s} end`);
			expect(r.redactions).toBeGreaterThanOrEqual(1);
			expect(r.text).not.toContain(s);
			expect(r.text).toContain('[REDACTED]');
		}
	});

	it('redacts secret-ish assignments but keeps the key', () => {
		const r = redactSecrets('api_key = "s3cr3tValue123" and password: hunter2hunter');
		expect(r.redactions).toBe(2);
		expect(r.text).toContain('api_key');
		expect(r.text).toContain('password');
		expect(r.text).not.toContain('s3cr3tValue123');
		expect(r.text).not.toContain('hunter2hunter');
	});

	it('leaves ordinary prose untouched', () => {
		const prose = 'We decided to use mysql2 with a 30s connection timeout.';
		expect(redactSecrets(prose)).toEqual({ text: prose, redactions: 0 });
	});
});

describe('TTL expiry + redaction on save (M11)', () => {
	let dir = '';
	let store = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'mem-ttl-'));
		store = join(dir, 'notes.json');
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('saveNote scrubs secrets and reports the count', async () => {
		const ghToken = tok('gh', 'p', '_', '0123456789abcdefghijklmnopqrstuvwxyz');
		const { note, redactions } = await saveNote(store, {
			title: 'creds',
			body: `token=${ghToken} here`,
		});
		expect(redactions).toBe(1);
		expect(note.body).not.toContain(ghToken);
		expect(note.body).toContain('[REDACTED]');
	});

	it('saveNote with ttlSeconds sets a future expiresAt and the note survives', async () => {
		const { note } = await saveNote(store, { title: 'temp', body: 'x', ttlSeconds: 3600 });
		expect(note.expiresAt).toBeDefined();
		expect(recall(store, {})).toHaveLength(1);
	});

	it('expired notes are dropped on read (lazy TTL) and pruned on next write', async () => {
		const expired: INote = {
			id: 'old',
			title: 'old',
			body: 'x',
			tags: [],
			createdAt: '2020-01-01T00:00:00.000Z',
			updatedAt: '2020-01-01T00:00:00.000Z',
			expiresAt: '2020-01-02T00:00:00.000Z',
		};
		writeStore(store, [expired]);
		expect(readStore(store)).toHaveLength(0); // lazily filtered

		// A subsequent save persists only the live set (expired pruned).
		await saveNote(store, { title: 'fresh', body: 'y' });
		const raw = JSON.parse(readFileSync(store, 'utf8')) as { notes: INote[] };
		expect(raw.notes.map((n) => n.id)).toEqual(['fresh']);
	});
});
