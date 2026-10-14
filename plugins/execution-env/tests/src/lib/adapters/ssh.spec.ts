import { describe, expect, it } from 'vitest';

import { SshExecutionEnvironment } from '../../../../src/lib/adapters/ssh.service';
import type { ISshExecutionOptions } from '../../../../src/lib/contracts/interfaces/ssh-execution.interface';
import { FakeProcessRunner } from './fake-process-runner';

const build = (
	runner: FakeProcessRunner,
	options: Partial<ISshExecutionOptions> = {},
): SshExecutionEnvironment =>
	new SshExecutionEnvironment({ host: 'build.example', runner, ...options });

describe('SshExecutionEnvironment connection defaults', () => {
	it('never prompts, checks host keys, does not forward the agent and keeps the link alive', async () => {
		const runner = new FakeProcessRunner();
		await build(runner).exec(['uname', '-a']);
		expect(runner.calls[0]?.argv).toEqual([
			'ssh',
			'-o',
			'BatchMode=yes',
			'-o',
			'ServerAliveInterval=30',
			'-o',
			'ServerAliveCountMax=4',
			'-o',
			'StrictHostKeyChecking=yes',
			'-o',
			'ForwardAgent=no',
			'--',
			'build.example',
			"exec 'uname' '-a'",
		]);
	});

	it('takes an identity file, a user, a port and a custom keepalive', async () => {
		const runner = new FakeProcessRunner();
		await build(runner, {
			identityFile: '/keys/id',
			user: 'deploy',
			port: 2222,
			keepAliveIntervalSec: 10,
			keepAliveCountMax: 2,
			useAgent: false,
			knownHostsFile: '/etc/known',
		}).exec(['true']);
		const argv = runner.calls[0]?.argv ?? [];
		expect(argv).toEqual(
			expect.arrayContaining([
				'-i',
				'/keys/id',
				'IdentitiesOnly=yes',
				'-l',
				'deploy',
				'-p',
				'2222',
				'ServerAliveInterval=10',
				'ServerAliveCountMax=2',
				'IdentityAgent=none',
				'UserKnownHostsFile=/etc/known',
			]),
		);
	});

	it('reaches the host through a jump host', async () => {
		const runner = new FakeProcessRunner();
		await build(runner, {
			jumpHost: { host: 'bastion', user: 'me', port: 22 },
		}).exec(['true']);
		const argv = runner.calls[0]?.argv ?? [];
		expect(argv[argv.indexOf('-J') + 1]).toBe('me@bastion:22');
	});

	it('reaches the host through a proxy command whose words are quoted', async () => {
		const runner = new FakeProcessRunner();
		await build(runner, {
			proxyCommand: ['nc', '-X', 'connect', '%h', '%p'],
		}).exec(['true']);
		const argv = runner.calls[0]?.argv ?? [];
		expect(argv).toContain("ProxyCommand='nc' '-X' 'connect' '%h' '%p'");
	});

	it('refuses a jump host together with a proxy command', () => {
		expect(() =>
			build(new FakeProcessRunner(), {
				jumpHost: { host: 'b' },
				proxyCommand: ['nc'],
			}),
		).toThrow('not both');
	});

	it('refuses a host, user or port that could be read as an option', () => {
		const runner = new FakeProcessRunner();
		expect(() => build(runner, { host: '-oProxyCommand=evil' })).toThrow(
			'not a valid ssh host',
		);
		expect(() => build(runner, { user: '-x' })).toThrow('ssh user');
		expect(() => build(runner, { port: 70_000 })).toThrow('ssh port');
		expect(() => build(runner, { jumpHost: { host: '-J' } })).toThrow(
			'jump host',
		);
	});
});

describe('SshExecutionEnvironment capabilities', () => {
	it('forwards secrets only when the agent is forwarded', () => {
		const runner = new FakeProcessRunner();
		expect(build(runner).capabilities()).not.toContain('forward-secrets');
		const forwarding = build(runner, { forwardAgent: true });
		expect(forwarding.capabilities()).toContain('forward-secrets');
	});

	it('turns agent forwarding on in the command only when asked', async () => {
		const runner = new FakeProcessRunner();
		await build(runner, { forwardAgent: true }).exec(['true']);
		expect(runner.calls[0]?.argv).toContain('ForwardAgent=yes');
	});

	it('names the shell it speaks', () => {
		const runner = new FakeProcessRunner();
		expect(build(runner).capabilities()).toContain('shell-bash');
		expect(
			build(runner, { remoteDialect: 'powershell' }).capabilities(),
		).toContain('shell-pwsh');
	});
});

describe('SshExecutionEnvironment commands', () => {
	it('quotes data for the remote shell so it cannot become syntax', async () => {
		const runner = new FakeProcessRunner([
			{ exitCode: 0, stdout: 'ok', stderr: '' },
		]);
		const result = await build(runner).exec(['echo', '$(id); rm -rf /'], {
			cwd: '/srv',
			env: { A: "it's" },
			stdin: 'in',
		});
		expect(result.stdout).toBe('ok');
		const last = runner.calls[0]?.argv.at(-1);
		expect(last).toBe(
			`cd -- '/srv' && exec env 'A=it'\\''s' 'echo' '$(id); rm -rf /'`,
		);
		expect(runner.calls[0]?.options?.stdin).toBe('in');
	});

	it('uses PowerShell quoting for a Windows host', async () => {
		const runner = new FakeProcessRunner();
		await build(runner, { remoteDialect: 'powershell' }).exec([
			'echo',
			"a'b",
		]);
		expect(runner.calls[0]?.argv.at(-1)).toBe(
			"& 'echo' 'a''b'; exit $LASTEXITCODE",
		);
	});

	it('plans without connecting in a dry run', async () => {
		const runner = new FakeProcessRunner();
		const env = build(runner, { dryRun: true });
		const prepared = await env.prepare();
		expect(prepared.dryRun).toBe(true);
		expect(prepared.plannedArgv?.[0]?.at(-1)).toBe("exec 'true'");
		expect(runner.calls).toHaveLength(0);
	});

	it('reports a refused connection from prepare', async () => {
		const runner = new FakeProcessRunner([
			{
				exitCode: 255,
				stdout: '',
				stderr: 'Host key verification failed.\n',
			},
		]);
		expect(await build(runner).prepare()).toMatchObject({
			ok: false,
			reason: 'Host key verification failed.',
		});
	});

	it('has nothing to release at teardown', async () => {
		const runner = new FakeProcessRunner();
		expect((await build(runner).teardown()).ok).toBe(true);
		expect(runner.calls).toHaveLength(0);
	});
});

describe('SshExecutionEnvironment files and environment', () => {
	it('moves files with the constant script and the path as a parameter on a posix host', async () => {
		const runner = new FakeProcessRunner([
			{ exitCode: 0, stdout: '', stderr: '' },
			{ exitCode: 0, stdout: 'body', stderr: '' },
		]);
		const env = build(runner);
		await env.putFile('/tmp/a b', 'body');
		expect(runner.calls[0]?.options?.stdin).toBe('body');
		expect(runner.calls[0]?.argv.at(-1)).toContain("'/tmp/a b'");
		expect(await env.getFile('/tmp/a b')).toBe('body');
	});

	it('passes the path to a Windows host through a variable, not through the script text', async () => {
		const runner = new FakeProcessRunner([
			{ exitCode: 0, stdout: '', stderr: '' },
		]);
		await build(runner, { remoteDialect: 'powershell' }).putFile(
			"C:\\x'; Remove-Item *",
			'data',
		);
		const remote = runner.calls[0]?.argv.at(-1) ?? '';
		expect(remote).toContain(
			"$env:DELENDAI_REMOTE_PATH = 'C:\\x''; Remove-Item *'",
		);
		expect(remote).toContain("'-Command' 'New-Item");
	});

	it('reads the remote environment and hides secrets', async () => {
		const runner = new FakeProcessRunner([
			{
				exitCode: 0,
				stdout: 'PATH=/bin\nDB_PASSWORD=pw\n',
				stderr: '',
			},
		]);
		expect(await build(runner).env()).toEqual({
			PATH: '/bin',
			DB_PASSWORD: '[redacted]',
		});
	});
});
