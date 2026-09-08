import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	applyValidatedCandidate,
	ProposalsSqliteDriver,
	reconcileShadowToStaging,
} from '../../../src';

const makeTmpDir = (): string =>
	mkdtempSync(join(tmpdir(), 'proposals-sqlite-promote-'));

describe('applyValidatedCandidate (q00024 S2)', () => {
	let rootDir: string;
	let statePath: string;
	let activePath: string;

	beforeEach(() => {
		rootDir = makeTmpDir();
		statePath = join(rootDir, '.delendai', 'state');
		activePath = join(statePath, 'proposals.sqlite');
		mkdirSync(statePath, { recursive: true });
	});

	afterEach(() => {
		rmSync(rootDir, { recursive: true, force: true });
	});

	it('applies the staging projection and preserves operational ledgers', () => {
		const staging = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath: join(rootDir, 'workspace'),
			statePath,
			sourceCommit: 'abc1234',
			sha: 'tree-abc1234',
			files: [
				{
					path: 'ready/fixes/x00001.md',
					sha: 'blob-x00001',
					raw: `---\nid: x00001\ntitle: Staged title\nkind: fix\nstatus: ready\ntype: proposal\ntrack: general\n---\n# Staged title`,
				},
			],
			now: 1000,
		});
		expect(staging.status).toBe('ok');

		const active = new ProposalsSqliteDriver({ path: activePath });
		active.handle.exec(`
			INSERT INTO proposals (
				uid, slug, kind, status, title, source_path, source_blob_sha,
				revision, content_hash, created_at, updated_at, closed_at
			) VALUES ('x00001', 'old-title', 'fix', 'ready', 'Old title',
				'old.md', 'old-blob', 3, 'old-hash', 900, 900, NULL);
			INSERT INTO lifecycle_events (
				entity_type, entity_uid, entity_revision, from_status, to_status,
				actor, source, occurred_at, metadata
			) VALUES ('proposal', 'x00001', 3, 'draft', 'ready', 'test', 'test', 901, NULL);
			INSERT INTO outbox (
				idempotency_key, kind, payload, next_attempt_at, created_at, updated_at
			) VALUES ('keep-outbox', 'test', '{}', 902, 902, 902);
			INSERT INTO mutation_commands (
				command_name, idempotency_key, request_fingerprint, entity_type,
				entity_uid, status, created_at
			) VALUES ('close', 'keep-command', 'fingerprint', 'proposal', 'x00001', 'started', 903);
		`);
		active.close();

		const result = applyValidatedCandidate({
			stagingPath: staging.stagingPath,
			activePath,
			sourceCommit: 'abc1234',
			expectedDigest: staging.stagingDigest,
			now: 2000,
		});

		expect(result.status).toBe('ok');
		expect(result.proposalsApplied).toBe(1);

		const verified = new ProposalsSqliteDriver({
			path: activePath,
			readonly: true,
		});
		try {
			const proposal = verified.handle
				.query<
					{ readonly title: string; readonly revision: number },
					[string]
				>('SELECT title, revision FROM proposals WHERE uid = ?')
				.get('x00001');
			expect(proposal).toEqual({ title: 'Staged title', revision: 4 });
			expect(
				verified.handle.query('SELECT id FROM lifecycle_events').all()
			).toHaveLength(1);
			expect(
				verified.handle.query('SELECT id FROM outbox').all()
			).toHaveLength(1);
			expect(
				verified.handle.query('SELECT id FROM mutation_commands').all()
			).toHaveLength(1);
			expect(
				verified.handle
					.query<
						{ readonly kind: string },
						[]
					>(`SELECT kind FROM reconciliation_runs ORDER BY id DESC LIMIT 1`)
					.get()?.kind
			).toBe('promote');
		} finally {
			verified.close();
		}
	});

	it('rejects a digest mismatch without changing the active database', () => {
		const staging = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath: join(rootDir, 'workspace'),
			statePath,
			sourceCommit: 'def5678',
			sha: 'tree-def5678',
			files: [],
			now: 1000,
		});
		const active = new ProposalsSqliteDriver({ path: activePath });
		active.handle.exec(`
			INSERT INTO proposals (
				uid, slug, kind, status, title, revision, created_at, updated_at
			) VALUES ('keep', 'keep', 'fix', 'ready', 'Keep', 0, 1, 1);
		`);
		active.close();

		const result = applyValidatedCandidate({
			stagingPath: staging.stagingPath,
			activePath,
			sourceCommit: 'def5678',
			expectedDigest: 'different-digest',
		});

		expect(result.status).toBe('rejected');
		expect(result.reason).toContain('digest');
		expect(result.failedStagingPath).not.toBeNull();
		expect(staging.stagingPath).not.toBe(result.failedStagingPath);

		const verified = new ProposalsSqliteDriver({
			path: activePath,
			readonly: true,
		});
		try {
			expect(
				verified.handle.query('SELECT uid FROM proposals').all()
			).toEqual([{ uid: 'keep' }]);
			expect(
				verified.handle
					.query('SELECT id FROM reconciliation_runs')
					.all()
			).toHaveLength(0);
		} finally {
			verified.close();
		}
	});
});
