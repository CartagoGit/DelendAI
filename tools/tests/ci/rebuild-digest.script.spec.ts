import { describe, expect, it } from 'vitest';

import {
	REBUILD_DIGEST_COMMAND,
	runRebuildDigest,
} from '../../scripts/ci/rebuild-digest.script';

describe('rebuild-digest CI wrapper', () => {
	it('runs the canonical digest rebuild E2E', () => {
		const commands: readonly string[][] = [];
		const mutableCommands = commands as string[][];

		const exitCode = runRebuildDigest({
			command: (command) => {
				mutableCommands.push([...command]);
				return 0;
			},
		});

		expect(exitCode).toBe(0);
		expect(commands).toEqual([REBUILD_DIGEST_COMMAND]);
	});

	it('propagates a failing E2E exit code', () => {
		expect(runRebuildDigest({ command: () => 1 })).toBe(1);
	});
});
