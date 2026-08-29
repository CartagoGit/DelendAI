#!/usr/bin/env bun
/**
 * reap-legacy-proposals.script.spec.ts — f00076 S2.
 *
 * Coverage:
 *   - The pure lib (`reap-legacy-proposals.lib.ts`) is covered with
 *     synthetic markdown and frontmatter — no fs fixture needed.
 *   - The CLI front (`parseReaperArgs`) covers every arg branch:
 *     defaults, `--older-than`, `--fallback-older-than`, `--apply`,
 *     malformed input.
 *   - `ageInDays` covers same-day, past, future, and invalid input.
 *   - `isReapCandidate` covers: not-done, already-archived, vintage
 *     by shipped-in, vintage by date fallback, not-vintage-yet.
 *   - `buildVintageProposal` covers: folder/filename extraction,
 *     invalid folder shape.
 *   - `planMove` covers: destination path computation, the frontmatter
 *     patch includes `archived-on:`.
 */

import { describe, expect, it } from 'vitest';

import {
	ageInDays,
	buildVintageProposal,
	formatReaperLine,
	isReapCandidate,
	isVintage,
	parseReaperArgs,
	planMove,
} from './lib/reap-legacy-proposals.lib';
import type {
	IReapFrontmatter,
	IVintageProposal,
} from './lib/reap-legacy-proposals.lib';

const fm = (over: Partial<IReapFrontmatter> = {}): IReapFrontmatter => ({
	id: 'f00100',
	status: 'done',
	kind: 'feat',
	date: '2026-07-26',
	...over,
});

const NOW = new Date('2026-07-26T00:00:00Z');

describe('ageInDays', () => {
	it('returns 0 for a same-day timestamp', () => {
		expect(ageInDays('2026-07-26T00:00:00Z', NOW)).toBe(0);
	});

	it('counts whole days between past dates', () => {
		expect(ageInDays('2026-06-26T00:00:00Z', NOW)).toBe(30);
		expect(ageInDays('2026-05-15T00:00:00Z', NOW)).toBe(72);
	});

	it('clamps a future timestamp to 0', () => {
		expect(ageInDays('2027-01-01T00:00:00Z', NOW)).toBe(0);
	});

	it('returns 0 for invalid input', () => {
		expect(ageInDays('not-a-date', NOW)).toBe(0);
		expect(ageInDays('', NOW)).toBe(0);
	});
});

describe('isVintage', () => {
	it('uses shipped-in when present', () => {
		const out = isVintage(
			fm({ shippedIn: '2026-06-25T00:00:00Z' }),
			30,
			60,
			NOW,
		);
		expect(out.ok).toBe(true);
		if (out.ok) {
			expect(out.ageSource).toBe('shipped-in');
			expect(out.ageDays).toBe(31);
		}
	});

	it('falls back to date when shipped-in is missing', () => {
		const out = isVintage(fm({ date: '2026-05-26' }), 30, 60, NOW);
		expect(out.ok).toBe(true);
		if (out.ok) {
			expect(out.ageSource).toBe('date');
			expect(out.ageDays).toBe(61);
		}
	});

	it('rejects a fresh proposal under the threshold', () => {
		const out = isVintage(
			fm({ shippedIn: '2026-07-20T00:00:00Z' }),
			30,
			60,
			NOW,
		);
		expect(out.ok).toBe(false);
	});

	it('rejects a fallback-fresh proposal', () => {
		const out = isVintage(fm({ date: '2026-07-01' }), 30, 60, NOW);
		expect(out.ok).toBe(false);
	});
});

describe('isReapCandidate', () => {
	it('refuses a non-done proposal', () => {
		const out = isReapCandidate(fm({ status: 'ready' }), 30, 60, NOW);
		expect(out.ok).toBe(false);
		if (!out.ok) expect(out.reason).toBe('not-done');
	});

	it('refuses an already-archived proposal (idempotent)', () => {
		const out = isReapCandidate(
			fm({ archivedOn: '2026-07-20', shippedIn: '2026-05-01' }),
			30,
			60,
			NOW,
		);
		expect(out.ok).toBe(false);
		if (!out.ok) expect(out.reason).toBe('already-archived');
	});

	it('accepts a vintage done proposal with shipped-in', () => {
		const out = isReapCandidate(
			fm({ shippedIn: '2026-05-15T00:00:00Z' }),
			30,
			60,
			NOW,
		);
		expect(out.ok).toBe(true);
		if (out.ok) {
			expect(out.ageSource).toBe('shipped-in');
		}
	});

	it('accepts a vintage done proposal via date fallback', () => {
		const out = isReapCandidate(fm({ date: '2026-04-01' }), 30, 60, NOW);
		expect(out.ok).toBe(true);
		if (out.ok) {
			expect(out.ageSource).toBe('date');
		}
	});

	it('refuses a non-vintage done proposal', () => {
		const out = isReapCandidate(
			fm({ shippedIn: '2026-07-10' }),
			30,
			60,
			NOW,
		);
		expect(out.ok).toBe(false);
		if (!out.ok) expect(out.reason).toBe('not-vintage');
	});
});

describe('buildVintageProposal', () => {
	const proposalsDir = '/repo/docs/mcp-vertex/proposals';
	const absPath =
		'/repo/docs/mcp-vertex/proposals/done/feats/f00100-alpha.md';

	it('builds the proposal record from a well-formed path', () => {
		const v = buildVintageProposal(
			fm(),
			absPath,
			proposalsDir,
			31,
			'shipped-in',
		);
		expect(v).toBeDefined();
		expect(v?.id).toBe('f00100');
		expect(v?.kind).toBe('feat');
		expect(v?.sourceFolder).toBe('done/feats');
		expect(v?.filename).toBe('f00100-alpha.md');
		expect(v?.sourceRelPath).toBe('done/feats/f00100-alpha.md');
	});

	it('returns undefined for a path outside done/', () => {
		const v = buildVintageProposal(
			fm(),
			'/repo/docs/mcp-vertex/proposals/ready/f00100-alpha.md',
			proposalsDir,
			31,
			'shipped-in',
		);
		expect(v).toBeUndefined();
	});

	it('returns undefined for an unknown kind folder', () => {
		const v = buildVintageProposal(
			fm(),
			'/repo/docs/mcp-vertex/proposals/done/unknown/f00100-alpha.md',
			proposalsDir,
			31,
			'shipped-in',
		);
		expect(v).toBeUndefined();
	});
});

describe('planMove', () => {
	const proposalsDir = '/repo/docs/mcp-vertex/proposals';
	const v: IVintageProposal = {
		id: 'f00100',
		kind: 'feat',
		sourceAbsPath:
			'/repo/docs/mcp-vertex/proposals/done/feats/f00100-alpha.md',
		sourceRelPath: 'done/feats/f00100-alpha.md',
		sourceFolder: 'done/feats',
		filename: 'f00100-alpha.md',
		title: 'Alpha',
		date: '2026-07-26',
		shippedIn: '2026-05-15',
		ageDays: 72,
		ageSource: 'shipped-in',
	};

	it('computes the destination under legacy/closed/<kind>/', () => {
		const plan = planMove(v, proposalsDir, '2026-07-26');
		expect(plan.destAbsPath).toBe(
			'/repo/docs/mcp-vertex/proposals/legacy/closed/feats/f00100-alpha.md',
		);
		expect(plan.destRelPath).toContain('legacy/closed/feats/');
		expect(plan.frontmatterPatch['archived-on']).toBe('2026-07-26');
	});
});

describe('parseReaperArgs', () => {
	it('returns defaults when no args are passed', () => {
		expect(parseReaperArgs([])).toEqual({
			thresholdDays: 30,
			fallbackThresholdDays: 60,
			apply: false,
		});
	});

	it('parses --older-than', () => {
		expect(parseReaperArgs(['--older-than=45d']).thresholdDays).toBe(45);
		expect(parseReaperArgs(['--older-than=7D']).thresholdDays).toBe(7);
	});

	it('parses --fallback-older-than', () => {
		expect(
			parseReaperArgs(['--fallback-older-than=90d'])
				.fallbackThresholdDays,
		).toBe(90);
	});

	it('parses --apply', () => {
		expect(parseReaperArgs(['--apply']).apply).toBe(true);
	});

	it('combines multiple flags', () => {
		const out = parseReaperArgs([
			'--older-than=14d',
			'--fallback-older-than=30d',
			'--apply',
		]);
		expect(out).toEqual({
			thresholdDays: 14,
			fallbackThresholdDays: 30,
			apply: true,
		});
	});

	it('ignores non-numeric --older-than (regex does not match)', () => {
		const out = parseReaperArgs(['--older-than=foo']);
		expect(out.thresholdDays).toBe(30);
	});

	it('ignores negative --older-than (regex does not match)', () => {
		const out = parseReaperArgs(['--older-than=-5d']);
		expect(out.thresholdDays).toBe(30);
	});

	it('ignores unknown flags', () => {
		const out = parseReaperArgs(['--unknown', '--older-than=10d']);
		expect(out.thresholdDays).toBe(10);
	});
});

describe('formatReaperLine', () => {
	const v: IVintageProposal = {
		id: 'f00100',
		kind: 'feat',
		sourceAbsPath: '/r/done/feats/f00100.md',
		sourceRelPath: 'done/feats/f00100.md',
		sourceFolder: 'done/feats',
		filename: 'f00100.md',
		title: 'Alpha',
		date: '2026-07-26',
		shippedIn: '2026-05-15',
		ageDays: 72,
		ageSource: 'shipped-in',
	};

	it('renders the standard one-line report', () => {
		const line = formatReaperLine(v);
		expect(line).toContain('f00100');
		expect(line).toContain('done/feats/f00100.md');
		expect(line).toContain('age=72d');
		expect(line).toContain('since=shipped-in');
		expect(line).toContain('legacy/closed/feats/f00100.md');
	});
});
