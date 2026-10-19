import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	gitDirtyFileCount,
	gitDirtyFilePaths,
} from '../../../../../../../plugins/commit-policy/src/lib/services/git-extra';

const cwd = mkdtempSync(join(tmpdir(), 'commit-policy-threshold-'));
execFileSync('git', ['init', '-q'], { cwd });
mkdirSync(join(cwd, 'new-dir'));
for (let index = 0; index < 12; index += 1) {
	writeFileSync(join(cwd, 'new-dir', `file-${index}.txt`), 'x');
}

const run = async (args: readonly string[]) => {
	try {
		return {
			ok: true,
			output: execFileSync('git', [...args], { cwd, encoding: 'utf8' }),
		};
	} catch (error) {
		return {
			ok: false,
			output: error instanceof Error ? error.message : String(error),
		};
	}
};

const result = {
	porcelainDefault: execFileSync('git', ['status', '--porcelain=v1'], {
		cwd,
		encoding: 'utf8',
	}).trim(),
	porcelainAllCount: execFileSync(
		'git',
		['status', '--porcelain=v1', '--untracked-files=all'],
		{ cwd, encoding: 'utf8' },
	)
		.trim()
		.split('\n').length,
	policyCount: await gitDirtyFileCount(run),
	policyPaths: await gitDirtyFilePaths(run),
};
console.log(JSON.stringify(result, null, 2));
