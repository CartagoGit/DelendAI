/**
 * `<prefix>_conventions_explain_path` — why this path, and what it may
 * import.
 *
 * Given a repo-relative path, answer four things: the role the
 * classifier assigns it, WHICH rule assigned it, the layer it sits in,
 * and what that layer may not import — so a refusal at push time can be
 * understood before the edit instead of after.
 *
 * `classifyPath` returns the role but not the rule that produced it, so
 * the matching rule is found by walking the same exported
 * `DEFAULT_TS_RULES` chain, first match wins — identical semantics, not
 * a second classifier. A spec case pins that the two never disagree.
 *
 * Pure: no I/O. The argument shape stays module-private, because an
 * exported type in a `*.tool.ts` belongs in `contracts/`.
 */
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import {
	classifyPath,
	DEFAULT_TS_RULES,
	toolError,
	toolOk,
} from '@delendai/core/public';

import { layerOf, rulesFor } from '../layers/layer-graph.service';

type IExplainPathArgs = {
	readonly path: string;
};

/**
 * The first rule in the canonical chain that matches, which is the one
 * `classifyPath` used. Deliberately not a reimplementation: the chain
 * and the order are the exported ones.
 */
const matchingRuleName = (relPath: string): string | undefined => {
	for (const rule of DEFAULT_TS_RULES) {
		try {
			if (rule.match(relPath)) return rule.name;
		} catch {
			// A rule that throws on an odd path is not a match; the
			// classifier swallows it the same way.
		}
	}
	return undefined;
};

const EXPLAIN_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	error: z
		.object({ reason: z.string(), nextAction: z.string().optional() })
		.optional(),
	path: z.string().optional(),
	role: z.string().optional(),
	matchedRule: z.string().optional(),
	layer: z.string().optional(),
	mayNotImport: z
		.array(
			z.object({
				forbids: z.string(),
				enforcedBy: z.string(),
				because: z.string(),
				unenforced: z.boolean().optional(),
			}),
		)
		.optional(),
});

export const runExplainPath = (args: IExplainPathArgs) => {
	const path = args.path.trim();
	if (path === '') {
		return toolError(
			'path is empty',
			'Pass a repo-relative path, e.g. `plugins/conventions/src/index.ts`.',
		);
	}

	const role = classifyPath(path);
	const layer = layerOf(path);
	return toolOk({
		path,
		role,
		// `other` means no rule matched; saying so beats naming a rule
		// that does not exist.
		...(role === 'other' ? {} : { matchedRule: matchingRuleName(path) }),
		...(layer === undefined ? {} : { layer }),
		mayNotImport: rulesFor(path).map((rule) => ({
			forbids: rule.forbids,
			enforcedBy: rule.enforcedBy,
			because: rule.because,
			...(rule.unenforced === true ? { unenforced: true } : {}),
		})),
	});
};

export const buildExplainPathRegistration = (
	namespacePrefix: string,
): IToolRegistration => ({
	id: 'conventions_explain_path',
	tags: ['conventions'],
	summary:
		'Explain a path: its role, the rule that assigned it, its layer, and what that layer may not import.',
	register: async (server) => {
		server.registerTool(
			`${namespacePrefix}_conventions_explain_path`,
			{
				outputSchema: EXPLAIN_OUTPUT_SCHEMA,
				description:
					'Why this path. Pass a repo-relative `path` and get the file-convention role, the name of the rule that assigned it, the layer the path sits in, and the import rules that layer is bound by — each naming the `lint:*` script that enforces it. Read-only and pure; nothing is read from disk.',
				inputSchema: z.object({ path: z.string() }),
			},
			async (args: IExplainPathArgs) => runExplainPath(args),
		);
	},
});
