import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	buildForcedRegressionCaller,
	guardDoneToReviewRegression,
	guardShippedInPresent,
	gatesSkippedByForce,
	logForcedTransition,
} from '@delendai/proposals/lib/services/proposal-state';

describe('proposal-state guards', () => {
	const tempRoots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			tempRoots
				.splice(0)
				.map((root) => rm(root, { recursive: true, force: true })),
		);
	});

	it('allows non-regression transitions unchanged', () => {
		expect(
			guardDoneToReviewRegression({
				from: 'in-progress',
				to: 'review',
			}),
		).toEqual({ ok: true });
	});

	it('blocks done -> review without force', () => {
		expect(
			guardDoneToReviewRegression({ from: 'done', to: 'review' }),
		).toEqual({
			ok: false,
			code: 'invalid-regression',
			reason: 'cannot move done -> review without force: true',
		});
	});

	it('blocks done -> review when force is false', () => {
		expect(
			guardDoneToReviewRegression({
				from: 'done',
				to: 'review',
				force: false,
				reason: 'nope',
			}),
		).toEqual({
			ok: false,
			code: 'invalid-regression',
			reason: 'cannot move done -> review without force: true',
		});
	});

	it('blocks done -> review with force and blank reason', () => {
		expect(
			guardDoneToReviewRegression({
				from: 'done',
				to: 'review',
				force: true,
				reason: '   ',
			}),
		).toEqual({
			ok: false,
			code: 'invalid-regression',
			reason: 'force: true requires a non-empty reason',
		});
	});

	it('allows done -> review with force and reason', () => {
		expect(
			guardDoneToReviewRegression({
				from: 'done',
				to: 'review',
				force: true,
				reason: 're-open for operator fix',
			}),
		).toEqual({ ok: true });
	});

	it('builds a caller record with host/pid/agent', () => {
		const caller = buildForcedRegressionCaller('agent-s1');
		expect(caller.agent).toBe('agent-s1');
		expect(typeof caller.host).toBe('string');
		expect(typeof caller.pid).toBe('number');
	});

	it('accepts a non-empty shipped-in list', () => {
		expect(
			guardShippedInPresent({
				'shipped-in': ['30551533', '051b12d5'],
			}),
		).toEqual({ ok: true, shas: ['30551533', '051b12d5'] });
	});

	it('accepts a SHA carrying the YAML inline comment authors actually write', () => {
		// `shipped-in: ["525a3bdc # feat(ci): verify CI local reproduce"]`
		// is idiomatic YAML and common in this repo. The comment is part
		// of the parsed string, and the anchored SHA test rejected it —
		// so the note explaining what the commit did was enough to block
		// the proposal from closing.
		expect(
			guardShippedInPresent({
				'shipped-in': [
					'525a3bdc # feat(ci): verify CI local reproduce',
				],
			}),
		).toEqual({ ok: true, shas: ['525a3bdc'] });
		expect(
			guardShippedInPresent({
				'shipped-in': '30551533 # landed the engine',
			}),
		).toEqual({ ok: true, shas: ['30551533'] });
	});

	it('accepts a raw-frontmatter list value, quotes and trailing comment included', () => {
		// When the frontmatter arrives as a raw line rather than parsed
		// YAML the value is the literal text `["abc1234"]  # note`. The
		// quotes survived into the candidate and the anchored SHA test
		// rejected it, so six verified proposals could not close.
		expect(
			guardShippedInPresent({
				'shipped-in':
					'["1bcc6f491717d22ab8514a1ca00b36ec956cb097"]  # bulk close',
			}),
		).toEqual({
			ok: true,
			shas: ['1bcc6f491717d22ab8514a1ca00b36ec956cb097'],
		});
		expect(guardShippedInPresent({ 'shipped-in': '"30551533"' })).toEqual({
			ok: true,
			shas: ['30551533'],
		});
	});

	it('still rejects an entry that is only a comment', () => {
		expect(
			guardShippedInPresent({ 'shipped-in': ['# not a sha'] }),
		).toMatchObject({ ok: false, code: 'missing-shipped-in' });
	});

	it('rejects missing shipped-in', () => {
		expect(guardShippedInPresent({})).toMatchObject({
			ok: false,
			code: 'missing-shipped-in',
		});
		expect(guardShippedInPresent({})).toHaveProperty('nextAction');
		expect(guardShippedInPresent({})).toHaveProperty('fix');
	});

	it('rejects empty shipped-in lists', () => {
		expect(guardShippedInPresent({ 'shipped-in': [] })).toMatchObject({
			ok: false,
			code: 'missing-shipped-in',
		});
		expect(guardShippedInPresent({ 'shipped-in': [] })).toHaveProperty(
			'nextAction',
		);
		expect(guardShippedInPresent({ 'shipped-in': [] })).toHaveProperty(
			'fix',
		);
	});

	it('rejects shipped-in lists without non-empty strings', () => {
		expect(
			guardShippedInPresent({ 'shipped-in': ['   ', ''] }),
		).toMatchObject({ ok: false, code: 'missing-shipped-in' });
	});

	it('rejects shipped-in lists whose entries are not 7-40 char hex SHAs', () => {
		const out = guardShippedInPresent({
			'shipped-in': ['TBD', 'n/a', 'coming-soon'],
		});
		expect(out.ok).toBe(false);
		if (out.ok) return;
		expect(out.code).toBe('missing-shipped-in');
		expect(out.reason).toMatch(/non-SHA entries/);
		expect(out.nextAction).toMatch(/Add `shipped-in:/);
		expect(out.fix).toMatch(/append `shipped-in:/);
	});

	it('accepts a single 7-char SHA', () => {
		expect(guardShippedInPresent({ 'shipped-in': ['30551533'] })).toEqual({
			ok: true,
			shas: ['30551533'],
		});
	});

	it('accepts a full 40-char SHA', () => {
		expect(
			guardShippedInPresent({
				'shipped-in': ['0123456789abcdef0123456789abcdef01234567'],
			}),
		).toEqual({
			ok: true,
			shas: ['0123456789abcdef0123456789abcdef01234567'],
		});
	});

	it('appends one JSONL line for a forced move, naming the gates it skipped', async () => {
		const root = await mkdtemp(join(tmpdir(), 'proposal-state-log-'));
		tempRoots.push(root);
		await logForcedTransition({
			workspaceRoot: root,
			proposalId: 'f00074',
			from: 'done',
			to: 'review',
			reason: 're-open after audit regression',
			ts: '2026-07-26T12:00:00.000Z',
			caller: { host: 'test-host', pid: 1234, agent: 'agent-s1' },
			via: 'force',
			skippedGates: ['state-machine', 'review-entry'],
		});
		const raw = await readFile(
			join(root, '.cache', 'delendai', 'proposals-state.log'),
			'utf8',
		);
		const entry = JSON.parse(raw.trim()) as {
			proposalId: string;
			caller: { agent: string };
			via: string;
			skippedGates: readonly string[];
		};
		expect(entry.proposalId).toBe('f00074');
		expect(entry.caller.agent).toBe('agent-s1');
		expect(entry.via).toBe('force');
		expect(entry.skippedGates).toEqual(['state-machine', 'review-entry']);
	});
});

describe('gatesSkippedByForce', () => {
	const policy = {
		via: 'force' as const,
		requireValidateEvidence: true,
		requirePeerReview: true,
		inCi: false,
	};

	it('lists every gate a forced close from review passes without', () => {
		expect(
			gatesSkippedByForce({
				...policy,
				from: 'review',
				to: 'done',
				inCi: true,
			}),
		).toEqual([
			'slice-completeness',
			'validate-evidence',
			'ci-evidence',
			'peer-review-log',
		]);
	});

	it('names the entry check of review, and the state machine for a reopened proposal', () => {
		expect(
			gatesSkippedByForce({
				...policy,
				from: 'in-progress',
				to: 'review',
			}),
		).toEqual(['review-entry']);
		expect(
			gatesSkippedByForce({ ...policy, from: 'done', to: 'review' }),
		).toEqual(['state-machine']);
	});

	it('leaves out a gate the project turned off, or one the move never meets', () => {
		expect(
			gatesSkippedByForce({
				...policy,
				from: 'review',
				to: 'done',
				requireValidateEvidence: false,
				requirePeerReview: false,
			}),
		).toEqual(['slice-completeness']);
		expect(
			gatesSkippedByForce({ ...policy, from: 'ready', to: 'done' }),
		).toEqual(['slice-completeness']);
		expect(
			gatesSkippedByForce({ ...policy, from: 'ready', to: 'paused' }),
		).toEqual([]);
	});

	it('counts the state machine for the recovery tool, which runs no gate of the transition', () => {
		expect(
			gatesSkippedByForce({
				...policy,
				via: 'force_transition',
				from: 'in-progress',
				to: 'review',
			}),
		).toEqual(['state-machine', 'review-entry']);
	});
});
