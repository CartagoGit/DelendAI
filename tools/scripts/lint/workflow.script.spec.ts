#!/usr/bin/env bun
/**
 * workflow.script.spec.ts — pins the contract of the f00049 S10
 * workflow-shape lint.
 *
 * Every rule is tested against a fake `IWorkflowContext` (the designed
 * DIP seam): no real git, no real working dir. This covers the gate's
 * acceptance ("flags the known patterns on a fixture") deterministically.
 *
 * SOLID: each describe block has a single responsibility.
 */
import { describe, expect, it } from 'vitest';

import { formatReport, lintWorkflow } from './workflow.script.ts';
import {
	AutoWorkLoopRule,
	DEFAULT_WORKFLOW_RULES,
	HandEditedIndexRule,
	PushFromMainRule,
	SyncRaceRule,
	type ICommitInfo,
	type IWorkflowContext,
} from './workflow-rules.ts';

const commit = (over: Partial<ICommitInfo> = {}): ICommitInfo => ({
	hash: 'deadbeefcafe',
	author: 'tester',
	iso: '2026-06-24T00:00:00Z',
	subject: 'chore: x',
	files: [],
	...over,
});

const ctx = (over: Partial<IWorkflowContext> = {}): IWorkflowContext => ({
	rootDir: '/fake',
	recentCommits: [],
	upstream: null,
	exec: async () => '',
	...over,
});

describe('HandEditedIndexRule', () => {
	it('flags a commit that touched docs/proposals/index.json', () => {
		const findings = HandEditedIndexRule.detect(
			ctx({
				recentCommits: [
					commit({ files: ['docs/proposals/index.json'] }),
				],
			}),
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.rule).toBe('hand-edited-index');
	});

	it('passes when no commit touched the index', () => {
		const findings = HandEditedIndexRule.detect(
			ctx({ recentCommits: [commit({ files: ['src/x.ts'] })] }),
		);
		expect(findings).toEqual([]);
	});
});

describe('PushFromMainRule', () => {
	it('flags a diverged local/remote head', () => {
		const findings = PushFromMainRule.detect(
			ctx({ upstream: { localHead: 'aaaa', remoteHead: 'bbbb' } }),
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.rule).toBe('push-from-main');
	});

	it('passes when local and remote heads match', () => {
		const findings = PushFromMainRule.detect(
			ctx({ upstream: { localHead: 'aaaa', remoteHead: 'aaaa' } }),
		);
		expect(findings).toEqual([]);
	});

	it('passes when there is no upstream', () => {
		expect(PushFromMainRule.detect(ctx({ upstream: null }))).toEqual([]);
	});
});

describe('placeholder rules detect nothing (must not turn the gate red)', () => {
	it('SyncRaceRule emits no findings', () => {
		expect(SyncRaceRule.detect(ctx())).toEqual([]);
	});

	it('AutoWorkLoopRule emits no findings', () => {
		expect(AutoWorkLoopRule.detect(ctx())).toEqual([]);
	});
});

describe('lintWorkflow (engine over the default rule chain)', () => {
	it('returns no findings for a clean context', () => {
		expect(lintWorkflow(ctx())).toEqual([]);
	});

	it('aggregates findings across rules', () => {
		const findings = lintWorkflow(
			ctx({
				recentCommits: [
					commit({ files: ['docs/proposals/index.json'] }),
				],
				upstream: { localHead: 'aaaa', remoteHead: 'bbbb' },
			}),
		);
		const ids = findings.map((f) => f.rule).sort();
		expect(ids).toEqual(['hand-edited-index', 'push-from-main']);
	});

	it('honours an injected rule subset', () => {
		expect(lintWorkflow(ctx(), [SyncRaceRule, AutoWorkLoopRule])).toEqual(
			[],
		);
	});
});

describe('formatReport', () => {
	it('renders a clean line when there are no findings', () => {
		expect(formatReport([])).toBe('workflow: 0 findings\n');
	});

	it('renders one line per finding', () => {
		const out = formatReport([
			{ rule: 'push-from-main', detail: 'diverged' },
		]);
		expect(out).toContain('workflow: 1 finding(s)');
		expect(out).toContain('push-from-main: diverged');
	});
});

describe('DEFAULT_WORKFLOW_RULES', () => {
	it('keeps all four rule ids wired (open/closed: placeholders stay)', () => {
		expect(DEFAULT_WORKFLOW_RULES.map((r) => r.id).sort()).toEqual([
			'auto-work-loop',
			'hand-edited-index',
			'push-from-main',
			'sync-race',
		]);
	});
});
