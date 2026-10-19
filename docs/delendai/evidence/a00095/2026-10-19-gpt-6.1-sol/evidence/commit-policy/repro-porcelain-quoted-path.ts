import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const projectRoot = pathToFileURL(`${process.cwd()}/`);
const { gitDirtyFilePaths } = await import(
	new URL('plugins/commit-policy/src/lib/services/git-extra.ts', projectRoot)
		.href
);

const execFileAsync = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'commit-policy-porcelain-'));

try {
	await execFileAsync('git', ['init', '-q'], { cwd: root });
	await execFileAsync(
		'git',
		[
			'-c',
			'user.name=Audit',
			'-c',
			'user.email=audit@example.test',
			'commit',
			'--allow-empty',
			'-m',
			'chore: fixture',
		],
		{ cwd: root },
	);
	await writeFile(join(root, 'a b.txt'), 'fixture\n');

	const run = async (args: readonly string[]) => {
		try {
			const result = await execFileAsync('git', [...args], { cwd: root });
			return { ok: true, output: result.stdout };
		} catch (error) {
			const failure = error as { stdout?: string; stderr?: string };
			return {
				ok: false,
				output: failure.stdout ?? '',
				stderr: failure.stderr ?? '',
			};
		}
	};
	const status = await run(['status', '--porcelain=v1']);
	const paths = await gitDirtyFilePaths(run);
	const add = await run(['add', '--', ...paths]);
	console.log(
		JSON.stringify(
			{
				status: status.output,
				parsedPaths: paths,
				gitAddOk: add.ok,
				gitAddError: add.ok ? undefined : add.stderr.trim(),
			},
			null,
			2,
		),
	);
} finally {
	await rm(root, { recursive: true, force: true });
}
