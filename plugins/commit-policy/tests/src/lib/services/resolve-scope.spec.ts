/**
 * resolve-scope.spec.ts — coverage for the machine-resolved
 * commit scope introduced by f00417.
 */

import { describe, expect, it } from 'vitest';

import {
	classifyDeclaredEntry,
	resolveCommitScope,
} from '@mcp-vertex/commit-policy/lib/services/resolve-scope';

describe('resolveCommitScope (f00417)', () => {
	it('classifies exact-path entries as canonical', () => {
		const scope = resolveCommitScope({
			proposalId: 'f00417',
			sliceId: 'S1',
			declaredFiles: [
				'plugins/commit-policy/src/lib/engine.ts',
				'packages/core/src/lib/foo.ts',
			],
		});
		expect(scope.files).toEqual([
			'plugins/commit-policy/src/lib/engine.ts',
			'packages/core/src/lib/foo.ts',
		]);
		expect(scope.unresolvedEntries).toEqual([]);
		expect(scope.source).toBe('declared');
	});

	it('rejects markdown link syntax and records the reason', () => {
		const scope = resolveCommitScope({
			proposalId: 'f00417',
			sliceId: 'S2',
			declaredFiles: [
				'[foo.ts](../../../../plugins/foo/foo.ts)',
				'plugins/foo/src/ok.ts',
			],
		});
		expect(scope.files).toEqual(['plugins/foo/src/ok.ts']);
		expect(scope.unresolvedEntries).toEqual([
			{
				raw: '[foo.ts](../../../../plugins/foo/foo.ts)',
				reason: 'markdown-link',
			},
		]);
	});

	it('rejects (or equivalent) annotations as vague-language', () => {
		const scope = resolveCommitScope({
			proposalId: 'f00417',
			sliceId: 'S3',
			declaredFiles: [
				'foo.ts (or equivalent)',
				'plugins/proposals/src/index.ts',
			],
		});
		expect(scope.files).toEqual(['plugins/proposals/src/index.ts']);
		expect(scope.unresolvedEntries).toEqual([
			{ raw: 'foo.ts (or equivalent)', reason: 'vague-language' },
		]);
	});

	it('rejects globs', () => {
		const scope = resolveCommitScope({
			proposalId: 'f00417',
			sliceId: 'S4',
			declaredFiles: ['plugins/**/*', 'plugins/foo/src/a.ts'],
		});
		expect(scope.files).toEqual(['plugins/foo/src/a.ts']);
		expect(scope.unresolvedEntries).toEqual([
			{ raw: 'plugins/**/*', reason: 'glob' },
		]);
	});

	it('rejects bare descriptions with whitespace', () => {
		const scope = resolveCommitScope({
			proposalId: 'f00417',
			sliceId: 'S5',
			declaredFiles: ['every `.md` under `docs/`'],
			workspaceDirty: [],
		});
		expect(scope.files).toEqual([]);
		expect(scope.unresolvedEntries).toEqual([
			{ raw: 'every `.md` under `docs/`', reason: 'vague-language' },
		]);
	});

	it('intersects with positive ownership when provided', () => {
		const scope = resolveCommitScope({
			proposalId: 'f00417',
			sliceId: 'S6',
			declaredFiles: ['plugins/a.ts', 'plugins/b.ts', 'plugins/c.ts'],
			ownership: {
				agentId: 'agent-x',
				taskId: 'task-x',
				ownedFiles: ['plugins/a.ts', 'plugins/c.ts'],
			},
		});
		expect(scope.files).toEqual(['plugins/a.ts', 'plugins/c.ts']);
		expect(scope.source).toBe('mixed');
	});

	it('reports foreign-dirty-excluded for declared-but-not-dirty paths', () => {
		const scope = resolveCommitScope({
			proposalId: 'f00417',
			sliceId: 'S7',
			declaredFiles: ['plugins/a.ts', 'plugins/b.ts'],
			workspaceDirty: ['plugins/a.ts'],
		});
		// x00419 / 2026-09-02: `files` is the canonical ∩ owned set
		// (NOT filtered by workspaceDirty — the stage step does the
		// staging). `foreignDirtyExcluded` is a WARN signal so the
		// operator can spot slices whose declared paths quietly
		// vanished from the worktree.
		expect(scope.files).toEqual(['plugins/a.ts', 'plugins/b.ts']);
		expect(scope.foreignDirtyExcluded).toEqual(['plugins/b.ts']);
	});

	it('x00419 regression: declared-but-unstaged files are still committable', () => {
		// Real-world slice shape from the 2026-09-02 log storm:
		// the agent wrote `forge-write.ts` but never `git add`'d
		// it (so `git status --porcelain` shows `?? forge-write.ts`,
		// which `gitDirtyFilePaths` does NOT report because it only
		// surfaces staged entries). The slice declares it.
		//
		// BEFORE the fix: `files` was filtered by `workspaceDirty`,
		// the scope became empty, engine.ts short-circuited to
		// NO_CHANGE, and the user saw hundreds of
		// `WORKSPACE_HAS_NO_FILES` ERR lines per session.
		//
		// AFTER the fix: `files` carries the declared canonical
		// path through to the stage step, which `git add`s it and
		// commits. `foreignDirtyExcluded` records the unstaged
		// warning for the operator.
		const scope = resolveCommitScope({
			proposalId: 'x00168',
			sliceId: 'S5',
			declaredFiles: [
				'plugins/forge/src/lib/services/forge-write.ts',
				'plugins/forge/tests/src/lib/services/forge-write.spec.ts',
			],
			workspaceDirty: [], // nothing staged — both files are `??`
		});
		expect(scope.files).toEqual([
			'plugins/forge/src/lib/services/forge-write.ts',
			'plugins/forge/tests/src/lib/services/forge-write.spec.ts',
		]);
		expect(scope.foreignDirtyExcluded).toEqual([
			'plugins/forge/src/lib/services/forge-write.ts',
			'plugins/forge/tests/src/lib/services/forge-write.spec.ts',
		]);
	});

	it('returns empty scope + no unresolved when declared is empty', () => {
		const scope = resolveCommitScope({
			proposalId: 'f00417',
			sliceId: 'S8',
			declaredFiles: [],
		});
		expect(scope.files).toEqual([]);
		expect(scope.unresolvedEntries).toEqual([]);
		expect(scope.source).toBe('declared');
	});
});

describe('classifyDeclaredEntry', () => {
	it.each([
		['empty string', '', 'empty'],
		['bare filename', 'foo.ts', null],
		['relative path', 'plugins/a/foo.ts', null],
		['markdown link', '[a](b)', 'markdown-link'],
		['glob with **', 'plugins/**/*', 'glob'],
		['glob with ?', 'foo?.ts', 'glob'],
		['(or equivalent)', 'foo.ts (or equivalent)', 'vague-language'],
		['free text', 'every file under foo', 'vague-language'],
		['absolute POSIX path', '/etc/passwd', 'cross-repo'],
	])('%s → %s', (label, input, expected) => {
		const result = classifyDeclaredEntry(input);
		if (expected === null) {
			expect(result, label).toBeNull();
		} else {
			expect(result?.reason, label).toBe(expected);
		}
	});
});
