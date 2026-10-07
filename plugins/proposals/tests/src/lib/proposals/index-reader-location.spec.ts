/**
 * index-reader-location.spec.ts — the workspace of an index the host
 * relocated with its cache is found from the layout the plugin declared,
 * in any checkout of the workspace, and nowhere else.
 */
import { join, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	declareProposalIndexFile,
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
