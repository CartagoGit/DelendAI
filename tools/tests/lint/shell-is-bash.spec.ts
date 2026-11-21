import { describe, expect, it } from 'vitest';

import { findShellViolations } from '../../scripts/lint/shell-is-bash.script';

/**
 * AGENT-BOOTSTRAP §6 states the rule for every host and runner, and it
 * had already drifted once: `quality-policy`'s settlement runner shelled
 * the entire `validate` command through `sh -c`, so what "validate"
 * meant depended on whether the machine's `/bin/sh` was dash, ash or an
 * old bash.
 */
describe('shell-is-bash gate', () => {
	const at = (line: string) => findShellViolations('a.ts', line);

	describe('what it catches', () => {
		it('the exact regression it was written for', () => {
			expect(at("await execFileAsync('sh', ['-c', cmd], {")).toHaveLength(
				1,
			);
		});

		it('every spawn API, both quote styles, with or without /bin', () => {
			expect(at('spawn("zsh", args)')).toHaveLength(1);
			expect(at("spawnSync('/bin/sh', ['-c', cmd])")).toHaveLength(1);
			expect(at("execFileSync('sh', args)")).toHaveLength(1);
			expect(at("exec('sh', args)")).toHaveLength(1);
		});

		it('the shell option of a spawn', () => {
			expect(at("const opts = { shell: '/bin/zsh' };")).toHaveLength(1);
		});

		it('reports the line number so the finding is actionable', () => {
			const found = findShellViolations(
				'a.ts',
				['const a = 1;', '', "spawn('sh', args);"].join('\n'),
			);

			expect(found[0]?.line).toBe(3);
		});
	});

	describe('what it must not catch', () => {
		it('a string that is data, not a command', () => {
			// Real lines from this repo: a language id in the search
			// engine's extension table and a framework name in the rules
			// presets. Flagging these would make the gate noise.
			expect(at("\t'sh',")).toEqual([]);
			expect(at("framework: 'sh',")).toEqual([]);
			expect(at("language: 'sh',")).toEqual([]);
		});

		it('bash itself, which is the whole point', () => {
			expect(at("await execFileAsync('bash', ['-c', cmd], {")).toEqual(
				[],
			);
			expect(at("spawn('/bin/bash', args)")).toEqual([]);
		});

		it('a word that merely contains the letters', () => {
			expect(at("import { push } from './shell-helpers';")).toEqual([]);
			expect(at("const shPath = resolve('shell.ts');")).toEqual([]);
		});

		it('prose in a comment that names the rule', () => {
			expect(at("// never spawn('sh', …) — use bash")).toEqual([]);
			expect(at(' * `sh` is dash on Debian.')).toEqual([]);
		});
	});
});
