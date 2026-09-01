import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	buildForcedRegressionCaller,
	guardDoneToReviewRegression,
	guardShippedInPresent,
	logForcedRegression,
} from '@mcp-vertex/proposals/lib/services/proposal-state';

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
		).toEqual({ ok: true });
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
		).toEqual({ ok: true });
		expect(
			guardShippedInPresent({
				'shipped-in': '30551533 # landed the engine',
			}),
		).toEqual({ ok: true });
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
		});
	});

	it('accepts a full 40-char SHA', () => {
		expect(
			guardShippedInPresent({
				'shipped-in': ['0123456789abcdef0123456789abcdef01234567'],
			}),
		).toEqual({ ok: true });
	});

	it('appends one JSONL line for a forced regression', async () => {
		const root = await mkdtemp(join(tmpdir(), 'proposal-state-log-'));
		tempRoots.push(root);
		await logForcedRegression({
			workspaceRoot: root,
			proposalId: 'f00074',
			from: 'done',
			to: 'review',
			reason: 're-open after audit regression',
			ts: '2026-07-26T12:00:00.000Z',
			caller: { host: 'test-host', pid: 1234, agent: 'agent-s1' },
		});
		const raw = await readFile(
			join(root, '.cache', 'mcp-vertex', 'proposals-state.log'),
			'utf8',
		);
		const entry = JSON.parse(raw.trim()) as {
			proposalId: string;
			caller: { agent: string };
		};
		expect(entry.proposalId).toBe('f00074');
		expect(entry.caller.agent).toBe('agent-s1');
	});
});
