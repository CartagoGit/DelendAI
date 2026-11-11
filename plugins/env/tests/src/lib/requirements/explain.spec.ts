/**
 * explain.spec.ts — diff a parsed .env against a list of env-var requirements.
 */
import { describe, expect, it } from 'vitest';

import { parseEnv } from '@delendai/env/lib/env/check-env';
import { explain } from '@delendai/env/lib/requirements/explain';
import type { IEnvRequirement } from '@delendai/env/lib/requirements/types';

const REQ_GH: IEnvRequirement = {
	var: 'GH_TOKEN',
	plugin: 'github',
	capability: 'GitHub API auth',
	provider: 'github',
	required: true,
};

const REQ_SLACK: IEnvRequirement = {
	var: 'SLACK_TOKEN',
	plugin: 'slack',
	capability: 'Slack API auth',
	provider: 'slack',
	required: true,
};

const REQ_OPTIONAL: IEnvRequirement = {
	var: 'OPTIONAL_VAR',
	plugin: 'misc',
	capability: 'Optional feature',
	required: false,
};

describe('explain', () => {
	it('reports a capability as unlocked when its required var is present', () => {
		const parsed = parseEnv('GH_TOKEN=abc\n');
		const result = explain(parsed, [REQ_GH]);
		expect(result.unlocked).toHaveLength(1);
		expect(result.unlocked[0]?.plugin).toBe('github');
		expect(result.blocked).toHaveLength(0);
	});

	it('reports a capability as blocked when its required var is missing', () => {
		const parsed = parseEnv('');
		const result = explain(parsed, [REQ_GH]);
		expect(result.blocked).toHaveLength(1);
		expect(result.blocked[0]?.missing).toEqual(['GH_TOKEN']);
		expect(result.unlocked).toHaveLength(0);
	});

	it('reports a capability as blocked when the required var is empty', () => {
		const parsed = parseEnv('GH_TOKEN=\n');
		const result = explain(parsed, [REQ_GH]);
		expect(result.blocked).toHaveLength(1);
		expect(result.blocked[0]?.missing).toEqual(['GH_TOKEN']);
	});

	it('does NOT block a capability when only its optional var is missing', () => {
		const parsed = parseEnv('');
		const result = explain(parsed, [REQ_OPTIONAL]);
		expect(result.unlocked).toHaveLength(1);
		expect(result.blocked).toHaveLength(0);
	});

	it('lists completelyMissing across the catalog', () => {
		const parsed = parseEnv('GH_TOKEN=abc\n');
		const result = explain(parsed, [REQ_GH, REQ_SLACK]);
		expect(result.completelyMissing).toEqual(['SLACK_TOKEN']);
	});

	it('groups multiple requirements into the same capability', () => {
		const multi: IEnvRequirement = {
			var: 'GH_TOKEN_2',
			plugin: 'github',
			capability: 'GitHub API auth',
			provider: 'github',
			required: true,
		};
		const parsed = parseEnv('GH_TOKEN=abc\nGH_TOKEN_2=xyz\n');
		const result = explain(parsed, [REQ_GH, multi]);
		expect(result.unlocked).toHaveLength(1);
		expect(result.unlocked[0]?.satisfiedBy).toEqual([
			'GH_TOKEN',
			'GH_TOKEN_2',
		]);
	});

	it('returns sorted capabilities for determinism', () => {
		const parsed = parseEnv('GH_TOKEN=abc\nSLACK_TOKEN=xyz\n');
		const result = explain(parsed, [REQ_SLACK, REQ_GH]);
		expect(result.unlocked.map((c) => c.plugin)).toEqual([
			'github',
			'slack',
		]);
	});

	it('returns empty arrays when there are no requirements', () => {
		const result = explain(parseEnv('GH_TOKEN=abc\n'), []);
		expect(result.unlocked).toEqual([]);
		expect(result.blocked).toEqual([]);
		expect(result.completelyMissing).toEqual([]);
	});
});
