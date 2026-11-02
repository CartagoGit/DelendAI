import { existsSync, rmSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

import { createDtsTempDir, resolveWorkspaceBinary } from './build.script';

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe('build.script hermeticity', () => {
	it('resolves TypeScript from the workspace binary instead of bunx', () => {
		const binaryPath = resolveWorkspaceBinary('tsc');
		expect(binaryPath).toContain('/node_modules/.bin/');
		expect(
			binaryPath.endsWith(
				process.platform === 'win32' ? 'tsc.cmd' : 'tsc',
			),
		).toBe(true);
		expect(existsSync(binaryPath)).toBe(true);
	});

	it('creates declaration tempdirs under the system tmp directory', () => {
		const directory = createDtsTempDir();
		temporaryDirectories.push(directory);
		expect(directory).toContain('/tmp/');
		expect(directory).not.toContain('/node_modules/.cache/');
		expect(existsSync(directory)).toBe(true);
	});
});
