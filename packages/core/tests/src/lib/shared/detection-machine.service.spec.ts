/**
 * detection-machine.service.spec.ts — reading the machine: PATH, global
 * packages and IDE extension folders, against a temp home.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { IClientCommandRunner } from '../../../../src/lib/contracts/interfaces/known-client.interface';
import {
	firstWords,
	ideExtensionDirs,
	npmGlobalNames,
	realDetectionMachine,
} from '../../../../src/lib/shared/detection-machine.service';

describe('parsers', () => {
	it('reads package names from npm-shaped JSON and first words of list output', () => {
		expect(npmGlobalNames('{"dependencies":{"a":{},"@b/c":{}}}')).toEqual([
			'a',
			'@b/c',
		]);
		expect(npmGlobalNames('nope')).toEqual([]);
		expect(firstWords('fast-agent 1.0\n  - fast-agent\n\nllm 0.2')).toEqual(
			['fast-agent', 'llm'],
		);
	});

	it('looks in every IDE folder, on both sides of WSL', () => {
		const dirs = ideExtensionDirs('/h', ['/mnt/c/Users/p']);
		expect(dirs.map((each) => each.dir)).toContain(
			join('/h', '.cursor', 'extensions'),
		);
		expect(dirs.map((each) => each.dir)).toContain(
			join('/mnt/c/Users/p', '.vscode', 'extensions'),
		);
		expect(dirs.some((each) => each.ide === 'JetBrains')).toBe(true);
	});
});

describe('realDetectionMachine', () => {
	it('reads PATH, package managers and extensions, and runs help with a deadline', async () => {
		const home = mkdtempSync(join(tmpdir(), 'machine-'));
		const bin = join(home, 'bin');
		mkdirSync(bin);
		writeFileSync(join(bin, 'agent-x'), '');
		mkdirSync(join(home, '.bun', 'install', 'global'), { recursive: true });
		writeFileSync(
			join(home, '.bun', 'install', 'global', 'package.json'),
			'{"dependencies":{"bun-agent":"1"}}',
		);
		const ext = join(home, '.vscode', 'extensions', 'pub.thing-1.0.0');
		mkdirSync(ext, { recursive: true });
		writeFileSync(join(ext, 'package.json'), '{"categories":["AI"]}');
		const commands: string[] = [];
		const run: IClientCommandRunner = async (command) => {
			commands.push(command);
			if (command.startsWith('npm ls'))
				return { code: 0, output: '{"dependencies":{"npm-agent":{}}}' };
			if (command.startsWith('pnpm ls'))
				return {
					code: 0,
					output: '[{"dependencies":{"pnpm-agent":{}}}]',
				};
			if (command.startsWith('pipx'))
				return { code: 0, output: 'pipx-agent 1.0' };
			if (command.includes('--help'))
				return { code: 0, output: 'help text' };
			return { code: 127, output: '' };
		};
		const machine = realDetectionMachine({
			env: { PATH: `${bin}:${join(home, 'none')}` },
			run,
			home,
		});
		expect(await machine.executables()).toEqual(['agent-x']);
		expect(await machine.globalPackages()).toEqual([
			'npm-agent',
			'bun-agent',
			'pnpm-agent',
			'pipx-agent',
		]);
		const extensions = await machine.ideExtensions();
		expect(
			extensions.find((each) => each.id === 'pub.thing-1.0.0')?.manifest,
		).toContain('AI');
		expect(await machine.help("it's")).toBe('help text');
		expect(commands.at(-1)).toBe(`'it'\\''s' --help 2>&1`);
	});
});
