/**
 * delivery-evidence.tool.spec.ts — the error envelope and the delivery
 * evidence a transition reads from a proposal's frontmatter.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	appendWarning,
	buildCodeError,
	certifiedDelivery,
	hasExactCiCommitEvidence,
	hasProposalCiEvidence,
	isTrackedFile,
} from '@delendai/proposals/lib/tools/transition/delivery-evidence.tool';

const notGit = async () => ({ ok: false, output: '', reason: 'no git' });

const WITH_CI = `---
id: x00001
evidence:
  commit: "abc1234"
  ci-runs:
    - name: validate
      status: success
---
`;

describe('buildCodeError', () => {
	it('carries the code, reason, next action and fix', () => {
		const answer = buildCodeError('stale-verdict', 'why', 'next', 'fix');
		expect(answer.isError).toBe(true);
		expect(answer.structuredContent).toMatchObject({
			ok: false,
			reason: 'why',
			error: {
				code: 'stale-verdict',
				reason: 'why',
				nextAction: 'next',
				fix: 'fix',
			},
		});
		expect(JSON.parse(answer.content[0]?.text ?? '{}')).toEqual(
			answer.structuredContent,
		);
	});

	it('names the kind each code stands for', () => {
		expect(buildCodeError('QUARANTINED', 'q').structuredContent.kind).toBe(
			'quarantined',
		);
		const illegal = buildCodeError(
			'illegal-transition',
			'no',
		).structuredContent;
		expect(illegal.error).not.toHaveProperty('nextAction');
		expect(
			buildCodeError('INVALID_TRANSITION', 'no').structuredContent.kind,
		).toBe(illegal.kind);
		expect(
			buildCodeError('write-conflict', 'c').structuredContent.kind,
		).not.toBe(buildCodeError('other', 'o').structuredContent.kind);
	});
});

describe('the evidence a proposal records', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('appends a warning to the ones before it', () => {
		expect(appendWarning(undefined, 'a')).toBe('a');
		expect(appendWarning('a', 'b')).toBe('a; b');
	});

	it('asks git whether a file is tracked', async () => {
		expect(await isTrackedFile(notGit, 'a.md')).toBe(false);
		expect(
			await isTrackedFile(
				async () => ({ ok: true, output: 'a.md' }),
				'a.md',
			),
		).toBe(true);
	});

	it('reads CI evidence with its commit, and nothing without one', () => {
		expect(hasProposalCiEvidence(WITH_CI)).toBe(true);
		expect(
			hasProposalCiEvidence(WITH_CI.replace('  commit: "abc1234"\n', '')),
		).toBe(false);
		expect(hasProposalCiEvidence('no frontmatter')).toBe(false);
	});

	it('matches the CI commit to the run it is in', () => {
		vi.stubEnv('GITHUB_SHA', '');
		expect(hasExactCiCommitEvidence(WITH_CI)).toBe(false);
		vi.stubEnv('GITHUB_SHA', 'abc1234');
		expect(hasExactCiCommitEvidence(WITH_CI)).toBe(true);
		vi.stubEnv('GITHUB_SHA', 'def5678');
		expect(hasExactCiCommitEvidence(WITH_CI)).toBe(false);
	});
});

describe('certifiedDelivery', () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'delivery-evidence-'));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('has none without frontmatter or a shipped-in', async () => {
		expect(
			await certifiedDelivery('no frontmatter', root, notGit),
		).toBeNull();
		expect(
			await certifiedDelivery('---\nid: x1\n---\n', root, notGit),
		).toBeNull();
	});

	it('asks for the certification of what the proposal shipped in', async () => {
		const asked: string[] = [];
		const answer = await certifiedDelivery(
			'---\nid: x1\nshipped-in:\n  - "abc1234"\n---\n',
			join(root, 'nowhere'),
			async (args) => {
				asked.push(args.join(' '));
				return { ok: false, output: '', reason: 'no git' };
			},
		);
		expect(answer).toBeNull();
		expect(asked[0]).toMatch(
			/^rev-parse --verify --quiet refs\/remotes\/origin\//u,
		);
	});
});
