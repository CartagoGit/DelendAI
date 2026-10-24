/**
 * index-reader-location.spec.ts — the workspace of an index the host
 * relocated with its cache is found from the layout the plugin declared,
 * in any checkout of the workspace, and nowhere else.
 */
import { join, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	declareProposalIndexFile,
	resolveProposalsDirAbs,
	resolveWorkspaceRoot,
} from '../../../../src/lib/proposals/index-reader-location';

describe('resolveWorkspaceRoot for a declared layout', () => {
	const relative = join('srv-cache', 'delendai-x', 'proposals', 'index.json');
	declareProposalIndexFile(relative, '/unused-for-a-relative-layout');
	const absolute = join(sep, 'pinned', 'cache', 'proposals', 'index.json');
	declareProposalIndexFile(absolute, join(sep, 'pinned-root'));

	it('is the checkout a relative layout ends in, a unit worktree included', async () => {
		const root = join(sep, 'work', 'project');
		const unit = join(root, '.cache', 'delendai', '.worktrees', 'unit-a');
		expect(await resolveWorkspaceRoot(join(root, relative))).toBe(root);
		expect(await resolveWorkspaceRoot(join(unit, relative))).toBe(unit);
	});

	it('is the root declared with an absolute layout, for that path only', async () => {
		expect(await resolveWorkspaceRoot(absolute)).toBe(
			join(sep, 'pinned-root'),
		);
		expect(
			await resolveWorkspaceRoot(
				join(sep, 'elsewhere', 'proposals', 'index.json'),
			),
		).toBeNull();
	});

	it('defers to a workspace the caller names', async () => {
		expect(
			await resolveWorkspaceRoot(join(sep, 'work', 'project', relative), {
				workspaceRoot: join(sep, 'named'),
			}),
		).toBe(join(sep, 'named'));
	});
});

describe('the folder a projection is rebuilt from', () => {
	const root = join(sep, 'work', 'elsewhere');
	const configured = join('var', 'cache-b', 'proposals', 'index.json');
	declareProposalIndexFile(configured, root, join('planning', 'proposals'));
	const pinned = join(sep, 'abs', 'cache', 'proposals', 'index.json');
	declareProposalIndexFile(pinned, root, join(sep, 'shared', 'proposals'));

	it('is the one the project configured, in any checkout of it', () => {
		const unit = join(root, '.worktrees', 'unit-a');
		expect(resolveProposalsDirAbs(join(root, configured), root)).toBe(
			join(root, 'planning', 'proposals'),
		);
		expect(resolveProposalsDirAbs(join(unit, configured), unit)).toBe(
			join(unit, 'planning', 'proposals'),
		);
	});

	it('is an absolute configured folder as it stands', () => {
		expect(resolveProposalsDirAbs(pinned, root)).toBe(
			join(sep, 'shared', 'proposals'),
		);
	});

	it('is the default layout when nothing was declared for the index', () => {
		expect(
			resolveProposalsDirAbs(join(root, 'other', 'index.json'), root),
		).toBe(join(root, 'docs', 'delendai', 'proposals'));
	});

	it('defers to a folder the caller names', () => {
		expect(
			resolveProposalsDirAbs(join(root, configured), root, {
				proposalsDirAbs: join(sep, 'named'),
			}),
		).toBe(join(sep, 'named'));
	});
});
