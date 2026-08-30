import z from 'zod';

import { definePlugin } from '@mcp-vertex/core/public';

import { buildChangelogGenerateToolRegistration } from './lib/tools/changelog-generate.tool';
import { buildReleasePlanToolRegistration } from './lib/tools/release-plan.tool';

const OptionsSchema = z.object({});

export default definePlugin({
	name: 'changelog',
	version: '0.1.1',
	describe:
		'Pure changelog generation + semver-bump inference + release-plan preview (f00131 S1+S2).',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`changelog plugin rejected its options: ${parsed.error.message}`,
			);
		}
		return {
			tools: [
				buildChangelogGenerateToolRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRootAbs: ctx.workspace.root,
				}),
				buildReleasePlanToolRegistration({
					namespacePrefix: ctx.namespacePrefix,
				}),
			],
			knowledge: [
				{
					id: 'release-plan-overview',
					title: 'release_plan',
					body: [
						'# release_plan',
						'',
						'Read-only preview of the next release: infer the semver bump from the supplied commit range, then walk the publish-order list to compute the per-package version transitions. Never publishes; never runs `npm publish`.',
						'',
						'- Input: `commits` (array of `{type, scope?, subject, breaking, hash}`).',
						'- Output: `{ ok, bump: major|minor|patch|none, reason, considered, from, to, entries[] }`.',
						'- Rules: breaking → major, feat → minor, fix/perf/revert → patch, otherwise none.',
					].join('\n'),
				},
			],
		};
	},
});
