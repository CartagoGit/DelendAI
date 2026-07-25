/**
 * a00069 S7 — review → done requires independent peer approve.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IGitRunner } from '@mcp-vertex/proposals/lib/shared/git-runner';
import {
	hasIndependentPeerApproval,
	runProposalTransition,
	type IProposalTransitionToolOptions,
} from '@mcp-vertex/proposals/lib/tools/proposal-transition.tool';
import { hasPeerApprovedReview } from '@mcp-vertex/proposals/lib/swarm/proposal-review';

const DOC = (extra: string) => `---
id: f00888
title: peer review fixture
status: review
type: feature
---

# peer review fixture

## Slices

### S1 — work
- **Status**: done
- **Files**: \`src/a.ts\`
${extra}
`;

const PEER_OK = `- review-state: done
- review-implementer: alice
- review-reviewer: bob
- review-log: approved by bob
`;

const SELF_APPROVE = `- review-state: done
- review-implementer: alice
- review-reviewer: alice
- review-log: approved by alice
`;

const FAKE_GIT: IGitRunner = async (args) => {
	// Untracked path: ls-files fails → plain rename + git add.
	if (args[0] === 'ls-files') {
		return { ok: false, output: '', reason: 'untracked' };
	}
	return { ok: true, output: '' };
};

describe('hasIndependentPeerApproval (a00069 S7)', () => {
	it('rejects empty / self-only approve', () => {
		expect(hasIndependentPeerApproval(DOC(''))).toBe(false);
		expect(
			hasIndependentPeerApproval(
				DOC(
					'- review-implementer: alice\n- review-log: approved by alice\n',
				),
			),
		).toBe(false);
	});

	it('accepts peer approve', () => {
		expect(
			hasIndependentPeerApproval(
				DOC(
					'- review-implementer: alice\n- review-log: approved by bob\n',
				),
			),
		).toBe(true);
	});

	it('accepts approve when no implementer recorded', () => {
		expect(
			hasIndependentPeerApproval(DOC('- review-log: approved by bob\n')),
		).toBe(true);
	});
});

describe('hasPeerApprovedReview (a00069 S7)', () => {
	it('requires done + distinct reviewer + approved round', () => {
		expect(hasPeerApprovedReview(DOC(PEER_OK))).toBe(true);
		expect(hasPeerApprovedReview(DOC(SELF_APPROVE))).toBe(false);
		expect(hasPeerApprovedReview(DOC(''))).toBe(false);
	});
});

describe('runProposalTransition peer-review gate (a00069 S7)', () => {
	let root = '';
	let opts: IProposalTransitionToolOptions;
	let docPath = '';

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'peer-gate-'));
		const proposalsDir = join(root, 'docs/mcp-vertex/proposals');
		mkdirSync(join(proposalsDir, 'review'), { recursive: true });
		mkdirSync(join(proposalsDir, 'done', 'feature'), { recursive: true });
		docPath = join(proposalsDir, 'review', 'f00888-peer.md');
		opts = {
			namespacePrefix: 'proposals',
			workspaceRoot: root,
			proposalsDirAbs: proposalsDir,
			gitRunner: FAKE_GIT,
		};
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	const parse = (r: { content: Array<{ text?: string }> }) =>
		JSON.parse(r.content[0]?.text ?? '{}');

	it('blocks review→done without peer approve', async () => {
		writeFileSync(docPath, DOC('- review-implementer: alice\n'), 'utf8');
		const body = parse(
			await runProposalTransition(
				{ id: 'f00888', to: 'done', reason: 'ship it' },
				opts,
			),
		);
		expect(body.ok).toBe(false);
		const msg = JSON.stringify(body);
		expect(msg).toMatch(/peer-review/i);
	});

	it('blocks self-approve even when review-state is done', async () => {
		writeFileSync(docPath, DOC(SELF_APPROVE), 'utf8');
		const body = parse(
			await runProposalTransition(
				{ id: 'f00888', to: 'done', reason: 'self' },
				opts,
			),
		);
		expect(body.ok).toBe(false);
	});

	it('allows review→done after independent approve', async () => {
		writeFileSync(docPath, DOC(PEER_OK), 'utf8');
		const body = parse(
			await runProposalTransition(
				{ id: 'f00888', to: 'done', reason: 'peer ok' },
				opts,
			),
		);
		expect(body.ok).toBe(true);
	});

	it('allows force:true bypass', async () => {
		writeFileSync(docPath, DOC(''), 'utf8');
		const body = parse(
			await runProposalTransition(
				{ id: 'f00888', to: 'done', reason: 'emergency', force: true },
				opts,
			),
		);
		expect(body.ok).toBe(true);
	});

	it('skips gate when requirePeerReview is false', async () => {
		writeFileSync(docPath, DOC(''), 'utf8');
		const body = parse(
			await runProposalTransition(
				{ id: 'f00888', to: 'done', reason: 'host off' },
				{ ...opts, requirePeerReview: false },
			),
		);
		expect(body.ok).toBe(true);
	});
});
