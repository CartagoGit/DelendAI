/**
 * init-render-convention.spec.ts — f00088 S4.
 *
 * Verifies that the rendered `delendai.config.json` carries a
 * `convention` block when the S1 detector picks a non-default root,
 * and omits it otherwise (preserving f00084 behaviour for greenfield).
 */
import { describe, expect, it } from 'vitest';

import { InitAnswers } from './init-answers.schema';
import { renderDelendaiConfig } from './init-render.service';

const parseAnswers = (detected?: Record<string, unknown>) =>
	InitAnswers.parse({
		preset: 'swarm',
		workspaceRoot: '/tmp',
		...(detected !== undefined ? { detected } : {}),
	});

describe('renderDelendaiConfig (f00088 S4)', () => {
	it('emits a convention block when detection picks pluginPathsRoot = libs', () => {
		const file = renderDelendaiConfig(
			parseAnswers({
				language: 'typescript',
				framework: 'angular',
				packageManager: 'bun',
				monorepoTool: 'bun/npm-workspaces',
				hasMcpProject: false,
				mcpEvidence: [],
				pluginPathsRoot: 'libs',
				sourceRoot: 'libs',
				hostEntrySource: 'unresolved',
			}),
			['proposals', 'git'],
		);
		const parsed = JSON.parse(file.content) as Record<string, unknown>;
		expect(parsed.convention).toEqual({
			pluginPathsRoot: 'libs',
			sourceRoot: 'libs',
		});
	});

	it('omits the convention block when the detected root is the default plugins/', () => {
		const file = renderDelendaiConfig(
			parseAnswers({
				language: 'unknown',
				packageManager: 'unknown',
				hasMcpProject: false,
				mcpEvidence: [],
				pluginPathsRoot: 'plugins',
				sourceRoot: 'plugins',
				hostEntrySource: 'unresolved',
			}),
			['git'],
		);
		const parsed = JSON.parse(file.content) as Record<string, unknown>;
		expect(parsed.convention).toBeUndefined();
	});

	it('omits the convention block when no detection ran (legacy greenfield)', () => {
		const file = renderDelendaiConfig(parseAnswers(), ['git']);
		const parsed = JSON.parse(file.content) as Record<string, unknown>;
		expect(parsed.convention).toBeUndefined();
	});

	it('does not contain a hardcoded /home/cartago/... path in any field', () => {
		const file = renderDelendaiConfig(parseAnswers(), ['git']);
		expect(file.content).not.toContain('/home/cartago/');
	});
});
