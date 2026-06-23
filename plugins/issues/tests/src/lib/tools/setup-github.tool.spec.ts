/**
 * Specs for the setup-github MCP tool (f00030 S2). Drives the run
 * function with injected detection deps and asserts the envelope shape.
 */
import { describe, expect, it } from 'vitest';

import type { IGithubSetupDeps } from '../../../../src/lib/github-setup';
import { runSetupGithubTool } from '../../../../src/lib/tools/setup-github.tool';

const deps = (over: Partial<IGithubSetupDeps> = {}): IGithubSetupDeps => ({
	originUrl: () => 'https://github.com/owner/name.git',
	hasGhCli: () => true,
	githubToken: () => undefined,
	readConfig: () => undefined,
	configPath: 'mcp-vertex.config.json',
	...over,
});

const body = (result: { content: Array<{ text: string }> }) =>
	JSON.parse(result.content[0]?.text ?? '{}');

describe('runSetupGithubTool', () => {
	it('returns the detected context + steps + guide', () => {
		const out = body(
			runSetupGithubTool({ namespacePrefix: 'issues', deps: deps() }),
		);
		expect(out.ok).toBe(true);
		expect(out.repo).toBe('owner/name');
		expect(out.tier).toBe('gh');
		expect(out.configured).toBe(false);
		expect(Array.isArray(out.steps)).toBe(true);
		expect(out.guide).toContain('# GitHub issues — setup guide');
	});

	it('reflects an already-configured workspace', () => {
		const out = body(
			runSetupGithubTool({
				namespacePrefix: 'issues',
				deps: deps({
					readConfig: () => '{"plugins":{"issues":{"options":{}}}}',
				}),
			}),
		);
		expect(out.configured).toBe(true);
	});
});
