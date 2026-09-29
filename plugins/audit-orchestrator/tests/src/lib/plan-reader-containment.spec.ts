/**
 * plan-reader-containment.spec.ts — `readAuditPlan` reads a plan that
 * really is inside the workspace, and refuses one that only looks like
 * it is.
 *
 * The path comes from a caller. The lexical containment check it used is
 * a string comparison, so `workspace/linked/plan.md` passed while
 * `linked` pointed at another tree — and the orchestrator would have
 * derived its tasks from somebody else's audit plan. Physical
 * containment resolves the real path first.
 *
 * The sibling spec covers the pure parser; this one covers the reader,
 * which is the half that touches disk.
 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IWorkspacePathProvider } from '@delendai/core/public';

import { readAuditPlan } from '../../../src/lib/plan-reader';

const PLAN = `---
id: q00001
status: ready
type: plan
kind: plan
title: Example implementation plan
---

# q00001

## Slices

### q00001-s1 — Fix: Repair boundary
- **Files**:
    - \`src/example.ts\`
- **Acceptance**: tests pass
`;

describe('readAuditPlan workspace containment', () => {
	let parent = '';
	let workspace = '';
	let outside = '';

	/** The provider the reader takes: a root plus a resolver. */
	const workspaceFor = (root: string): IWorkspacePathProvider => ({
		root,
		resolve: (relativePath: string) => join(root, relativePath),
	});

	beforeEach(async () => {
		parent = await mkdtemp(join(tmpdir(), 'plan-reader-'));
		workspace = join(parent, 'workspace');
		outside = join(parent, 'outside');
		await mkdir(workspace, { recursive: true });
		await mkdir(outside, { recursive: true });
		await writeFile(join(workspace, 'plan.md'), PLAN, 'utf8');
		await writeFile(
			join(outside, 'plan.md'),
			PLAN.replace('Example implementation plan', 'Someone else’s plan'),
			'utf8',
		);
	});

	afterEach(async () => {
		await rm(parent, { recursive: true, force: true });
	});

	it('reads a plan that really is inside the workspace', async () => {
		const plan = await readAuditPlan(workspaceFor(workspace), 'plan.md');

		expect(plan.id).toBe('q00001');
	});

	it('refuses a plan path that traverses out of the workspace', async () => {
		await expect(
			readAuditPlan(workspaceFor(workspace), '../outside/plan.md'),
		).rejects.toThrow();
	});

	it('refuses a plan reached through a symlink that leaves the workspace', async () => {
		// `linked/plan.md` never leaves the workspace as a string, which
		// is exactly why the lexical check accepted it.
		await symlink(outside, join(workspace, 'linked'), 'dir');

		await expect(
			readAuditPlan(workspaceFor(workspace), 'linked/plan.md'),
		).rejects.toThrow();
	});
});
