import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	REVIEW_IDENTITY_RELATIVE_PATH,
	buildReviewIdentity,
	checkApproveIdentity,
	readLatestSubmitIdentity,
	recordReviewSubmitIdentity,
	type IReviewIdentityDeps,
} from '@delendai/proposals/lib/services/review-identity';

describe('review identity service (a00074 S2)', () => {
	let root = '';
	let deps: IReviewIdentityDeps;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'review-identity-'));
		deps = {
			appendLine: async (path, line) => {
				let existing = '';
				try {
					existing = readFileSync(path, 'utf8');
				} catch {
					existing = '';
				}
				const prefix =
					existing === '' || existing.endsWith('\n')
						? existing
						: `${existing}\n`;
				await writeFile(path, `${prefix}${line}\n`, 'utf8');
			},
			ensureDir: async (path) => {
				await mkdir(path, { recursive: true });
			},
			readText: async (path) => {
				try {
					return readFileSync(path, 'utf8');
				} catch {
					return '';
				}
			},
			now: () => '2026-07-26T12:00:00.000Z',
			hostname: () => 'fallback-host',
			pid: () => 111,
			envHost: () => 'env-host',
		};
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('writes the identity record keyed by proposal and slice', async () => {
		await recordReviewSubmitIdentity({
			workspaceRoot: root,
			proposalId: 'a00074',
			sliceId: 'S2',
			agent: 'reviewer-a',
			deps,
		});
		const logPath = join(root, REVIEW_IDENTITY_RELATIVE_PATH);
		const lines = readFileSync(logPath, 'utf8').trim().split('\n');
		expect(lines).toHaveLength(1);
		expect(JSON.parse(lines[0] ?? '{}')).toEqual({
			proposalId: 'a00074',
			sliceId: 'S2',
			host: 'env-host',
			pid: 111,
			agent: 'reviewer-a',
			ts: '2026-07-26T12:00:00.000Z',
		});
	});

	it('allows approve from a different agent even on the same host+pid', async () => {
		await recordReviewSubmitIdentity({
			workspaceRoot: root,
			proposalId: 'a00074',
			sliceId: 'S2',
			agent: 'implementer-a',
			deps,
		});
		const out = await checkApproveIdentity({
			workspaceRoot: root,
			proposalId: 'a00074',
			sliceId: 'S2',
			approver: { host: 'env-host', pid: 111, agent: 'reviewer-b' },
			deps,
		});
		expect(out).toEqual({
			ok: true,
			submitter: {
				proposalId: 'a00074',
				sliceId: 'S2',
				host: 'env-host',
				pid: 111,
				agent: 'implementer-a',
				ts: '2026-07-26T12:00:00.000Z',
			},
		});
	});

	it('refuses self-approval (same agent) even from a different host', async () => {
		await recordReviewSubmitIdentity({
			workspaceRoot: root,
			proposalId: 'a00074',
			sliceId: 'S2',
			agent: 'delivery_verifier',
			deps,
		});
		const out = await checkApproveIdentity({
			workspaceRoot: root,
			proposalId: 'a00074',
			sliceId: 'S2',
			approver: {
				host: 'other-host',
				pid: 222,
				agent: 'delivery_verifier',
			},
			deps,
		});
		expect(out).toMatchObject({
			ok: false,
			reason: 'self-approve',
			submitter: {
				proposalId: 'a00074',
				sliceId: 'S2',
				host: 'env-host',
				pid: 111,
				agent: 'delivery_verifier',
				ts: '2026-07-26T12:00:00.000Z',
			},
		});
		// The refusal has to name who is blocked and what to do instead;
		// an agent that only reads "a different agent must approve" tends
		// to rename itself, which is the same self-approval this gate
		// exists to refuse.
		expect(out.ok).toBe(false);
		if (!out.ok) {
			expect(out.nextAction).toContain('delivery_verifier');
			expect(out.nextAction).toContain('a00074 S2');
			expect(out.nextAction).toContain('renaming yourself');
		}
	});

	it('returns explicit missing-submit-identity before approve', async () => {
		const out = await checkApproveIdentity({
			workspaceRoot: root,
			proposalId: 'a00074',
			sliceId: 'S2',
			approver: {
				host: 'other-host',
				pid: 222,
				agent: 'delivery_verifier',
			},
			deps,
		});
		expect(out.ok).toBe(false);
		if (!out.ok) {
			expect(out.reason).toBe('missing-submit-identity');
			// A reviewer cannot open the round itself — submitting under
			// its own name would make it the implementer and bar it from
			// approving — so the refusal has to name the exact command AND
			// whose it is, or the reviewer stalls on advice it cannot act
			// on.
			expect(out.nextAction).toContain('IMPLEMENTER');
			expect(out.nextAction).toContain('action: "submit"');
			expect(out.nextAction).toContain('a00074');
			expect(out.nextAction).toContain('proposal-review.script.ts');
		}
	});

	it('survives process restart by reading the existing JSONL on a new cycle', async () => {
		await recordReviewSubmitIdentity({
			workspaceRoot: root,
			proposalId: 'a00074',
			sliceId: 'S2',
			agent: 'implementer-a',
			deps,
		});
		const restartedDeps: IReviewIdentityDeps = {
			...deps,
			pid: () => 222,
			envHost: () => 'restarted-host',
		};
		const record = await readLatestSubmitIdentity({
			workspaceRoot: root,
			proposalId: 'a00074',
			sliceId: 'S2',
			deps: restartedDeps,
		});
		expect(record).toMatchObject({
			proposalId: 'a00074',
			sliceId: 'S2',
			host: 'env-host',
			pid: 111,
			agent: 'implementer-a',
		});
	});

	it('uses MCP_HOST first and falls back to hostname', () => {
		expect(
			buildReviewIdentity('agent-x', {
				hostname: () => 'local-host',
				pid: () => 999,
				envHost: () => 'remote-host',
			}),
		).toEqual({ host: 'remote-host', pid: 999, agent: 'agent-x' });
		expect(
			buildReviewIdentity('agent-y', {
				hostname: () => 'local-host',
				pid: () => 1000,
				envHost: () => undefined,
			}),
		).toEqual({ host: 'local-host', pid: 1000, agent: 'agent-y' });
	});
});
