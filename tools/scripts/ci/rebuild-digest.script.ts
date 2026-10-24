#!/usr/bin/env bun

export interface IRebuildDigestRunner {
	readonly command: (command: readonly string[]) => number;
}

export const REBUILD_DIGEST_COMMAND = [
	'bun',
	'test',
	'packages/proposals-sqlite/tests/e2e/digest-rebuild.spec.ts',
] as const;

export const runRebuildDigest = (
	runner: IRebuildDigestRunner = {
		command: (command) =>
			Bun.spawnSync([...command], {
				stdout: 'inherit',
				stderr: 'inherit',
			}).exitCode,
	},
): number => runner.command(REBUILD_DIGEST_COMMAND);

if (import.meta.main) {
	process.exit(runRebuildDigest());
}
