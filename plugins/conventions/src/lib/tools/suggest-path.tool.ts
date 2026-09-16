/**
 * `<prefix>_conventions_suggest_path` — where a new file belongs.
 *
 * Given a role, a package and a name, answer with the path the
 * classifier will agree with, plus the naming and co-location rules that
 * apply to it. The answer is CHECKED before it is returned: the path is
 * run back through `classifyPath`, so this tool can never suggest a path
 * its own classifier would call `other`. An answer that fails that check
 * is reported as an error naming both roles rather than returned as a
 * confident guess.
 *
 * Pure: no I/O, no scan. The placement table and the argument shape stay
 * module-private on purpose — an exported type or constant here would
 * belong in `contracts/`, and this file is a tool.
 */
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { classifyPath, toolError, toolOk } from '@delendai/core/public';

type ISuggestPathArgs = {
	readonly role: string;
	/** Package or plugin directory, e.g. `plugins/conventions`. */
	readonly package: string;
	/** Human name of the thing, e.g. `layer graph`. */
	readonly name: string;
};

/**
 * Folder and suffix per role, transcribed from the canonical table in
 * `docs/delendai/FILE-CONVENTIONS.md`: the suffix is singular because it
 * describes the file's role, the folder is plural because it groups
 * many.
 */
const PLACEMENTS: Readonly<
	Record<string, { readonly folder: string; readonly suffix: string }>
> = {
	interface: { folder: 'contracts/interfaces/', suffix: 'interface.ts' },
	constant: { folder: 'contracts/constants/', suffix: 'constant.ts' },
	service: { folder: 'services/', suffix: 'service.ts' },
	tool: { folder: 'tools/', suffix: 'tool.ts' },
	registry: { folder: 'registries/', suffix: 'registry.ts' },
	register: { folder: 'register/', suffix: 'register.ts' },
	factory: { folder: 'factories/', suffix: 'factory.ts' },
	builder: { folder: 'builders/', suffix: 'builder.ts' },
	helper: { folder: 'helpers/', suffix: 'helper.ts' },
};

/** `Layer Graph` / `layer_graph` / `layerGraph` -> `layer-graph`. */
const slugify = (name: string): string =>
	name
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.replace(/[^a-zA-Z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.toLowerCase();

/**
 * The NAMING and co-location rules that apply to the answer, quoted from
 * the convention doc rather than summarised, so an agent is told what
 * the gates enforce.
 *
 * Deliberately not `rulesFor`: the layer graph exports a `rulesFor` that
 * answers a different question — what a layer may IMPORT — and two
 * implementations of one name in a package means each one's tests only
 * cover its own copy.
 */
const namingRulesFor = (role: string): readonly string[] => {
	const rules = [
		'Always dot, never hyphen: exactly one dot between the basename and the role suffix.',
		'Every exported interface and type alias starts with `I` (the type-naming ratchet enforces it).',
	];
	if (role === 'tool') {
		rules.push(
			'A `*.tool.ts` MUST live under a `tools/` folder, even if it is the only tool.',
		);
	}
	if (role === 'interface' || role === 'constant') {
		rules.push(
			'A `*.interface.ts` or `*.constant.ts` MUST live under the matching `contracts/` subfolder; there is no top-level `*.interface.ts`.',
		);
	}
	return rules;
};

const SUGGEST_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	error: z
		.object({ reason: z.string(), nextAction: z.string().optional() })
		.optional(),
	path: z.string().optional(),
	specPath: z.string().optional(),
	role: z.string().optional(),
	rules: z.array(z.string()).optional(),
});

export const runSuggestPath = (args: ISuggestPathArgs) => {
	const placement = PLACEMENTS[args.role];
	if (placement === undefined) {
		return toolError(
			`no placement rule for role "${args.role}"`,
			`Known roles: ${Object.keys(PLACEMENTS).sort().join(', ')}.`,
		);
	}
	const slug = slugify(args.name);
	if (slug === '') {
		return toolError(
			'name produced an empty slug',
			'Pass a name with at least one letter or digit.',
		);
	}
	const pkg = args.package.replace(/\/+$/, '');
	const path = `${pkg}/src/lib/${placement.folder}${slug}.${placement.suffix}`;

	// The invariant this tool exists for: never answer with a path the
	// classifier disagrees with.
	const classified = classifyPath(path);
	if (classified !== args.role) {
		return toolError(
			`the suggested path classifies as "${classified}", not "${args.role}"`,
			'Report this as a plugin bug — the placement table and the classifier disagree.',
		);
	}

	return toolOk({
		path,
		specPath: path
			.replace('/src/lib/', '/tests/src/lib/')
			.replace(/\.ts$/, '.spec.ts'),
		role: classified,
		rules: namingRulesFor(args.role),
	});
};

export const buildSuggestPathRegistration = (
	namespacePrefix: string,
): IToolRegistration => ({
	id: 'conventions_suggest_path',
	tags: ['conventions'],
	summary:
		'Given a role, a package and a name, answer with the path the classifier agrees with.',
	register: async (server) => {
		server.registerTool(
			`${namespacePrefix}_conventions_suggest_path`,
			{
				outputSchema: SUGGEST_OUTPUT_SCHEMA,
				description:
					'Where a new file belongs. Pass `role` (interface | constant | service | tool | registry | register | factory | builder | helper), `package` (e.g. `plugins/conventions`) and `name`. Returns the path, where its spec goes, and the naming and co-location rules that apply. The path is verified against `classifyPath` before it is returned, so it can never be one the classifier calls `other`.',
				inputSchema: z.object({
					role: z.string(),
					package: z.string(),
					name: z.string(),
				}),
			},
			async (args: ISuggestPathArgs) => runSuggestPath(args),
		);
	},
});
