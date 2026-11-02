/**
 * init-hosts.helper.spec.ts — init writes the instructions block of every
 * host it writes for, from core's host catalog, once per file.
 */
import { describe, expect, it } from 'vitest';

import { AGENT_HOSTS } from '@delendai/core/cli';

import {
	hostInstructionTargets,
	hostInstructionsBody,
	initInstructionTargets,
} from './init-hosts.helper';

describe('hostInstructionTargets', () => {
	it('gives every host that reads an instructions file its block, once per file', () => {
		const targets = hostInstructionTargets(AGENT_HOSTS);
		for (const host of AGENT_HOSTS) {
			if (host.instructions === undefined) continue;
			expect(
				targets.find((each) => each.relPath === host.instructions)
					?.hosts,
				host.id,
			).toContain(host.id);
		}
		const paths = targets.map((each) => each.relPath);
		expect(new Set(paths).size).toBe(paths.length);
		expect(paths).toContain('.windsurfrules');
	});

	it('names the bootstrap part in effect for the hosts reading each file', () => {
		const targets = hostInstructionTargets(AGENT_HOSTS);
		const appendixOf = (relPath: string): string =>
			targets.find((each) => each.relPath === relPath)?.appendix ?? '';
		expect(appendixOf('.github/copilot-instructions.md')).toContain('§8.1');
		expect(appendixOf('CLAUDE.md')).toContain('§8.2');
		expect(appendixOf('AGENTS.md')).toContain('§7');
		const claude = targets.find((each) => each.relPath === 'CLAUDE.md');
		expect(claude && hostInstructionsBody(claude)).toMatch(/§8\.2/u);
	});
});

describe('initInstructionTargets', () => {
	it('writes for the hosts a project declares, and only those', async () => {
		const targets = await initInstructionTargets('/nonexistent/project', {
			hosts: ['windsurf'],
		});
		expect(targets.map((each) => each.relPath)).toEqual(['.windsurfrules']);
	});

	it('writes for Copilot, Claude Code and AGENTS.md agents when it finds nothing', async () => {
		const targets = await initInstructionTargets(
			'/nonexistent/project',
			{},
		);
		expect(targets.map((each) => each.relPath)).toEqual([
			'.github/copilot-instructions.md',
			'CLAUDE.md',
			'AGENTS.md',
		]);
	});

	it('writes for every host it knows when asked to', async () => {
		const targets = await initInstructionTargets('/nonexistent/project', {
			everyHost: true,
		});
		expect(targets).toEqual(hostInstructionTargets(AGENT_HOSTS));
	});
});
