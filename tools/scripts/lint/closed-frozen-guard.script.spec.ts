#!/usr/bin/env bun
/**
 * closed-frozen-guard.script.spec.ts — f00076 S3.
 *
 * Pure-function coverage of the four drift kinds. Each test feeds
 * synthetic markdown + frontmatter + mtime into `detectFrozenDrift`
 * and asserts the produced drift list. No filesystem I/O.
 */

import { describe, expect, it } from 'vitest';

import {
	detectFrozenDrift,
	formatDriftLine,
} from './lib/closed-frozen-guard.lib';
import type { IFrozenInputs } from './lib/closed-frozen-guard.lib';

const NOW = new Date('2026-07-26T12:00:00Z');
const ARCHIVED_AT = '2026-07-15T10:00:00Z';
const MTIME_BEFORE = '2026-07-15T10:00:30Z'; // 30s after archived-on
const MTIME_AFTER = '2026-07-20T10:00:00Z'; // 5 days after archived-on

const baseInputs = (over: Partial<IFrozenInputs> = {}): IFrozenInputs => ({
	relPath: 'legacy/closed/feats/f00100-alpha.md',
	id: 'f00100',
	status: 'done',
	archivedOn: ARCHIVED_AT,
	mtimeIso: MTIME_BEFORE,
	markdown: '### S1 — done\n- **Files**: `a.ts`\n- **Status**: done\n',
	snapshotSlices: [],
	...over,
});

describe('detectFrozenDrift — missing-archived-on', () => {
	it('reports when archived-on is missing', () => {
		const drifts = detectFrozenDrift(baseInputs({ archivedOn: undefined }));
		expect(drifts).toHaveLength(1);
		expect(drifts[0]?.code).toBe('missing-archived-on');
	});

	it('reports when archived-on is empty', () => {
		const drifts = detectFrozenDrift(baseInputs({ archivedOn: '' }));
		expect(drifts).toHaveLength(1);
		expect(drifts[0]?.code).toBe('missing-archived-on');
	});

	it('returns only the missing-archived-on drift (other checks skipped)', () => {
		const drifts = detectFrozenDrift(
			baseInputs({
				archivedOn: '',
				status: 'ready',
				mtimeIso: MTIME_AFTER,
			}),
		);
		expect(drifts).toHaveLength(1);
		expect(drifts[0]?.code).toBe('missing-archived-on');
	});
});

describe('detectFrozenDrift — status-drift', () => {
	it('reports when status is not done', () => {
		const drifts = detectFrozenDrift(baseInputs({ status: 'ready' }));
		expect(drifts.some((d) => d.code === 'status-drift')).toBe(true);
	});

	it('reports when status is missing', () => {
		const drifts = detectFrozenDrift(baseInputs({ status: undefined }));
		expect(drifts.some((d) => d.code === 'status-drift')).toBe(true);
	});

	it('passes when status is done', () => {
		const drifts = detectFrozenDrift(baseInputs({ status: 'done' }));
		expect(drifts.some((d) => d.code === 'status-drift')).toBe(false);
	});
});

describe('detectFrozenDrift — mtime-drift', () => {
	it('reports when file mtime is newer than archived-on + grace', () => {
		const drifts = detectFrozenDrift(baseInputs({ mtimeIso: MTIME_AFTER }));
		expect(drifts.some((d) => d.code === 'mtime-drift')).toBe(true);
	});

	it('passes when mtime is within grace of archived-on', () => {
		const drifts = detectFrozenDrift(
			baseInputs({ mtimeIso: MTIME_BEFORE }),
		);
		expect(drifts.some((d) => d.code === 'mtime-drift')).toBe(false);
	});

	it('reports when mtime is invalid', () => {
		const drifts = detectFrozenDrift(
			baseInputs({ mtimeIso: 'not-a-date' }),
		);
		expect(drifts.some((d) => d.code === 'mtime-drift')).toBe(true);
	});
});

describe('detectFrozenDrift — slice-drift', () => {
	it('reports when a slice status changed since archival', () => {
		const drifts = detectFrozenDrift(
			baseInputs({
				snapshotSlices: [
					{ id: 'S1', title: 'Done', status: 'done', files: [] },
				],
				markdown:
					'### S1 — done\n- **Files**: `a.ts`\n- **Status**: pending\n',
			}),
		);
		expect(drifts.some((d) => d.code === 'slice-drift')).toBe(true);
	});

	it('passes when slice statuses match snapshot', () => {
		const drifts = detectFrozenDrift(
			baseInputs({
				snapshotSlices: [
					{ id: 'S1', title: 'Done', status: 'done', files: [] },
				],
				markdown:
					'### S1 — done\n- **Files**: `a.ts`\n- **Status**: done\n',
			}),
		);
		expect(drifts.some((d) => d.code === 'slice-drift')).toBe(false);
	});

	it('skips slice-drift when no snapshot exists', () => {
		const drifts = detectFrozenDrift(baseInputs({ snapshotSlices: [] }));
		expect(drifts.some((d) => d.code === 'slice-drift')).toBe(false);
	});
});

describe('detectFrozenDrift — multiple drifts', () => {
	it('reports all four kinds when all conditions hold', () => {
		const drifts = detectFrozenDrift(
			baseInputs({
				status: 'ready',
				mtimeIso: MTIME_AFTER,
				snapshotSlices: [
					{ id: 'S1', title: 'Done', status: 'done', files: [] },
				],
				markdown:
					'### S1 — done\n- **Files**: `a.ts`\n- **Status**: pending\n',
			}),
		);
		const codes = drifts.map((d) => d.code).sort();
		expect(codes).toContain('status-drift');
		expect(codes).toContain('mtime-drift');
		expect(codes).toContain('slice-drift');
	});
});

describe('formatDriftLine', () => {
	it('renders the standard one-line drift report', () => {
		const line = formatDriftLine({
			id: 'f00100',
			code: 'status-drift',
			detail: 'status is "ready"',
			fix: 'revert status to done',
		});
		expect(line).toContain('f00100');
		expect(line).toContain('[status-drift]');
		expect(line).toContain('fix:');
	});
});
