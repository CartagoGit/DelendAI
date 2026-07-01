/**
 * Specs for the markdown guide renderer (f00030 S2).
 */
import { describe, expect, it } from 'vitest';

import { renderCrossProjectGuide } from '../../../../src/lib/setup/cross-project-guide';
import {
	buildGithubSetupSteps,
	type IGithubSetupContext,
} from '../../../../src/lib/setup/setup-steps';

const ctx = (over: Partial<IGithubSetupContext> = {}): IGithubSetupContext => ({
	repo: 'owner/name',
	tier: 'gh',
	configured: false,
	configPath: 'mcp-vertex.config.json',
	...over,
});

describe('renderCrossProjectGuide', async () => {
	it('renders a numbered guide with the repo + tier header', async () => {
		const c = ctx();
		const md = renderCrossProjectGuide(c, await buildGithubSetupSteps(c));
		expect(md).toContain('# GitHub issues — setup guide');
		expect(md).toContain('Repository: `owner/name`');
		expect(md).toContain('gh` CLI');
		expect(md).toContain('1. **');
	});

	it('marks optional steps and renders command fences', async () => {
		const c = ctx({ tier: 'token' });
		const md = renderCrossProjectGuide(c, await buildGithubSetupSteps(c));
		expect(md).toContain('_(optional)_');
		expect(md).toContain('```');
	});

	it('flags a missing repo in the header', async () => {
		const c = ctx({ repo: null });
		const md = renderCrossProjectGuide(c, await buildGithubSetupSteps(c));
		expect(md).toContain('not detected');
	});

	it('notes when issues is already declared', async () => {
		const c = ctx({ configured: true });
		const md = renderCrossProjectGuide(c, await buildGithubSetupSteps(c));
		expect(md).toContain('issues already declared');
	});
});
