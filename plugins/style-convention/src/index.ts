/**
 * @delendai/style-convention — who may define a selector, what consumes
 * it, and whether a hard-coded value already has a design token.
 *
 * A project that declares no stylesheet root gets no tool and no
 * diagnostic: there is nothing here to guess about somebody's styles.
 */
import { definePlugin } from '@delendai/core/plugin';
import { callerCheckout } from '@delendai/core/public';

import { styleOptionsSchema } from './lib/contracts/schemas/style-options.schema';
import { resolveStyleProfile } from './lib/profile/style-profile.service';
import { openStyleWorkspace } from './lib/profile/style-workspace.service';
import { buildStyleCheckTool } from './lib/tools/style-check.tool';
import { buildStyleImpactTool } from './lib/tools/style-impact.tool';
import { buildStyleProfileTool } from './lib/tools/style-profile.tool';

export * from './public/index';

export default definePlugin({
	name: 'style-convention',
	version: '0.1.0',
	describe:
		'The style surface: the architecture a project declares, what a change to a selector reaches, and a check for selectors another layer owns and values a design token already names. Read-only.',
	optionsSchema: styleOptionsSchema,
	register(ctx) {
		const parsed = styleOptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`style-convention plugin rejected its options: ${parsed.error.message}`,
			);
		}
		// No stylesheet root declared: nothing to serve, and nothing to say.
		if ((parsed.data.styleRoots ?? []).length === 0) return { tools: [] };
		const profile = resolveStyleProfile(parsed.data);
		const options = {
			namespacePrefix: ctx.namespacePrefix,
			// Read when the call runs, in the checkout the call is bound to:
			// an agent asks about the stylesheet it is editing.
			workspace: () =>
				openStyleWorkspace(
					callerCheckout.executionRootOr(ctx.workspace.root),
					profile,
				),
		};
		return {
			tools: [
				buildStyleProfileTool(options),
				buildStyleImpactTool(options),
				buildStyleCheckTool(options),
			],
		};
	},
});
