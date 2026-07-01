/**
 * f00046 S11 — help rendering: commands are grouped by their first word,
 * and summaries resolve through the active locale (falling back to the
 * command's own summary / English).
 */
import { describe, expect, it } from 'vitest';

import {
	HELP_TRANSLATIONS,
	SUPPORTED_HELP_LANGS,
} from '../contracts/constants/help-translation.constant';
import type { ICliCommand } from '../contracts/interfaces/cli-command.interface';
import { renderHelp } from './help.service';
import { registerAllCommands } from '../commands/registry';

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

	// f00052 S3 — the new --agent-worktree flag must have i18n parity:
	// every supported help language declares a non-empty flagAgentWorktree.
	it('declares flagAgentWorktree in all 12 supported languages', () => {
		expect(SUPPORTED_HELP_LANGS).toHaveLength(12);
		for (const lang of SUPPORTED_HELP_LANGS) {
			const t = HELP_TRANSLATIONS[lang];
			expect(t, `missing translation block for ${lang}`).toBeDefined();
			expect(
				t?.flagAgentWorktree?.length ?? 0,
				`flagAgentWorktree empty for ${lang}`,
			).toBeGreaterThan(0);
		}
	});

	it('renders the --agent-worktree flag in the global flags section', () => {
		const out = renderHelp([stub('overview')], 'en');
		expect(out).toContain('--agent-worktree');
	});
});
