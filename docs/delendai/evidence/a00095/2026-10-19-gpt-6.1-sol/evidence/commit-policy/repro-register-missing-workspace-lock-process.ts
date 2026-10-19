import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { commitWithGuard } from '../../../../../../../plugins/commit-policy/src/lib/services/commit-driver';

const execFileAsync = promisify(execFile);
const role = process.argv[2];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (marker: string): Promise<void> => {
	const deadline = Date.now() + 10_000;
	while (!existsSync(marker)) {
		if (Date.now() >= deadline)
			throw new Error(`timed out waiting for ${marker}`);
		await pause(10);
	}
};

if (role === 'worker') {
	const workspace = process.env.AUDIT_REPO ?? '';
	const barrier = process.env.AUDIT_BARRIER ?? '';
	const worker = process.env.AUDIT_WORKER ?? '';
	const run = async (args: readonly string[]) => {
		if (args[0] === 'add' && worker === 'B') {
			await waitFor(join(barrier, 'a-added'));
		}
		try {
			const result = await execFileAsync('git', [...args], {
				cwd: workspace,
				encoding: 'utf8',
			});
			if (args[0] === 'reset' && args[1] === 'HEAD') {
				writeFileSync(join(barrier, `reset-${worker}`), 'done');
				await waitFor(join(barrier, 'reset-A'));
				await waitFor(join(barrier, 'reset-B'));
			}
			if (args[0] === 'add' && worker === 'A') {
				writeFileSync(join(barrier, 'a-added'), 'done');
				await waitFor(join(barrier, 'b-reset'));
			}
			if (args[0] === 'add' && worker === 'B') {
				writeFileSync(join(barrier, 'b-added'), 'done');
			}
			if (
				args[0] === 'reset' &&
				args[1] === 'HEAD' &&
				worker === 'B' &&
				existsSync(join(barrier, 'b-added'))
			) {
				writeFileSync(join(barrier, 'b-reset'), 'done');
			}
			return { ok: true, output: result.stdout };
		} catch (error) {
			const failure = error as Error & { stderr?: string };
			return {
				ok: false,
				output: failure.stderr || failure.message,
				reason: failure.stderr || failure.message,
			};
		}
	};
	const file = worker === 'A' ? 'agent-a.txt' : 'agent-b.txt';
	const result = await commitWithGuard({
		run,
		message: `fix: ${worker.toLowerCase()} scoped commit`,
		authorFlag: 'Audit <audit@example.test>',
		allowList: [file],
		enforceSubset: true,
		branch: 'main',
	});
	console.log(JSON.stringify({ worker, ...result }));
} else {
	const workspace = mkdtempSync(
		join(tmpdir(), 'commit-policy-process-race-'),
	);
	const barrier = mkdtempSync(
		join(tmpdir(), 'commit-policy-process-barrier-'),
	);
	const git = async (...args: string[]) => {
		await execFileAsync('git', args, { cwd: workspace });
	};
	await git('init', '-q', '-b', 'main');
	await git('config', 'user.name', 'Audit');
	await git('config', 'user.email', 'audit@example.test');
	writeFileSync(join(workspace, 'agent-a.txt'), 'base a\n');
	writeFileSync(join(workspace, 'agent-b.txt'), 'base b\n');
	await git('add', '--', 'agent-a.txt', 'agent-b.txt');
	await git('commit', '-q', '-m', 'chore: base');
	writeFileSync(join(workspace, 'agent-a.txt'), 'changed a\n');
	writeFileSync(join(workspace, 'agent-b.txt'), 'changed b\n');

	const children = ['A', 'B'].map((worker) =>
		Bun.spawn([process.execPath, import.meta.path, 'worker'], {
			env: {
				...process.env,
				AUDIT_REPO: workspace,
				AUDIT_BARRIER: barrier,
				AUDIT_WORKER: worker,
			},
			stdout: 'pipe',
			stderr: 'pipe',
		}),
	);
	const results = await Promise.all(
		children.map(async (child) => ({
			exitCode: await child.exited,
			stdout: await new Response(child.stdout).text(),
			stderr: await new Response(child.stderr).text(),
		})),
	);
	const status = (
		await execFileAsync('git', ['status', '--short'], { cwd: workspace })
	).stdout.trim();
	const staged = (
		await execFileAsync('git', ['diff', '--cached', '--name-only'], {
			cwd: workspace,
		})
	).stdout.trim();
	console.log(JSON.stringify({ results, status, staged }, null, 2));
	rmSync(workspace, { recursive: true, force: true });
	rmSync(barrier, { recursive: true, force: true });
}
