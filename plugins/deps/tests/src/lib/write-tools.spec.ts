import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	buildDepsWriteToolRegistrations,
	buildInstallCommand,
	manifestAbsPath,
	packageInstall,
	packageRunScript,
} from '@mcp-vertex/deps/lib/tools/write-tools';

describe('buildInstallCommand (pure, no spawn)', () => {
	it('builds a simple dependencies install command', () => {
		const result = buildInstallCommand({ name: 'left-pad' });
		expect(result.error).toBeUndefined();
		expect(result.command).toBe('bun add left-pad');
	});

	it('builds a devDependencies install command with the --dev flag', () => {
		const result = buildInstallCommand({
			name: 'vitest',
			range: '^4.0.0',
			section: 'devDependencies',
		});
		expect(result.error).toBeUndefined();
		expect(result.command).toBe('bun add vitest@^4.0.0 --dev');
	});

	it('rejects an invalid/unsafe version range', () => {
		const result = buildInstallCommand({
			name: 'left-pad',
			range: '; rm -rf /',
		});
		expect(result.command).toBeUndefined();
		expect(result.error).toContain('unsafe version range');
	});
});

describe('packageInstall / packageRunScript (S11, offline fixtures, no network)', () => {
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
});

describe('buildDepsWriteToolRegistrations', () => {
	it('registers package_install and package_run_script with their declared effects', () => {
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
