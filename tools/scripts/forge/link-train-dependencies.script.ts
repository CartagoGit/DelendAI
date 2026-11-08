#!/usr/bin/env bun
/**
 * link-train-dependencies.script.ts — gives a train's scratch worktree the
 * shared checkout's dependencies, the way a unit worktree gets them.
 *
 * Usage: bun tools/scripts/forge/link-train-dependencies.script.ts <dir>
 * Exits 0 when the dependencies are linked, 1 when they are not (a
 * different lockfile, or no shared modules): the generators would then
 * fail to load the code, and the train must not be pushed.
 */
import { linkSharedDependencies } from '@delendai/core/cli';

const directory = process.argv[2];
if (directory === undefined) {
	console.error('usage: link-train-dependencies.script.ts <dir>');
	process.exit(2);
}
process.exit((await linkSharedDependencies(directory)) === undefined ? 1 : 0);
