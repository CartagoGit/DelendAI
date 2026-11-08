import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { timeBudgetRunnerPath } from '../../../packages/test-kit/src/public/index';
import { sharedTestOptions } from '../../../vitest.shared';
import { repoRoot } from '../lib/repo-root';

const projectConfigs = (): string[] => {
	return execFileSync('git', ['ls-files', '-z'], {
		cwd: repoRoot(),
		encoding: 'utf8',
	})
		.split('\0')
		.filter(
			(file) =>
				/(?:^|\/)vitest(?:\.\w+)?\.config\.ts$/u.test(file) &&
				!file.startsWith('docs/'),
		);
};

describe('the time-budget runner is loaded by every vitest project', () => {
	it('[<100ms] sits in the options every project spreads, and exists', () => {
		expect(sharedTestOptions.runner).toBe(timeBudgetRunnerPath());
		expect(existsSync(sharedTestOptions.runner)).toBe(true);
	});

	it('[<500ms] is reached by every project config, through the shared options or the isolation split', () => {
		const root = repoRoot();
		const bypassing = projectConfigs().filter((file) => {
			// The root config only lists projects; none of them inherits its
			// `test` block, so it needs none of its own.
			if (file === 'vitest.config.ts') return false;
			const text = readFileSync(join(root, file), 'utf8');
			return !/sharedTestOptions|isolationSplit|coreConfig|toolsConfig/u.test(
				text,
			);
		});
		expect(bypassing).toEqual([]);
	});

	it('[<500ms] is not overridden by a project that sets its own runner', () => {
		const root = repoRoot();
		const overriding = projectConfigs().filter((file) =>
			/\brunner\s*:/u.test(readFileSync(join(root, file), 'utf8')),
		);
		expect(overriding).toEqual([]);
	});
});
