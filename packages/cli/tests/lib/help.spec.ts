/**
 * f00046 S11 — help rendering: commands are grouped by their first word,
 * and summaries resolve through the active locale (falling back to the
 * command's own summary / English).
 */
import { describe, expect, it } from 'vitest';

import type { ICliCommand } from '../../src/contracts/interfaces/cli-command.interface';
import { renderHelp } from '../../src/lib/help';
import { registerAllCommands } from '../../src/commands/registry';

const stub = (name: string): ICliCommand => ({
	name,
	summary: `summary for ${name}`,
	async run() {
		return { code: 0 };
	},
});

describe('renderHelp (f00046 S11)', async () => {
	it('groups commands under their first word, single-word under general', async () => {
		const out = renderHelp([
			stub('status'),
			stub('git status'),
			stub('git log'),
			stub('memory save'),
		]);
		expect(out).toContain('general:');
		expect(out).toContain('git:');
		expect(out).toContain('memory:');
		// The verbs appear indented beneath their group header.
		expect(out).toMatch(/git:[\s\S]*git status[\s\S]*git log/);
	});

	it('renders the full live command surface without throwing', async () => {
		const out = renderHelp(await registerAllCommands(), 'es');
		expect(out).toContain('mcp-vertex');
		expect(out).toContain('proposals:');
		expect(out).toContain('Comandos:'); // Spanish locale header
	});
});
