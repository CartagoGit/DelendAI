/**
 * Constants for `./host-docs-landing.script`.
 */

/**
 * The documents a host loads into its model's instructions. What they say
 * is read as a rule by every agent in every project that copies them.
 */
export const HOST_INSTRUCTION_DOCS: readonly string[] = [
	'docs/delendai/AGENT-BOOTSTRAP.md',
	'AGENTS.md',
	'CLAUDE.md',
	'.github/copilot-instructions.md',
];

/** Directories whose every Markdown file is a host instruction document. */
export const HOST_INSTRUCTION_DIRS: readonly string[] = [
	'docs/delendai/host-hints',
];

/**
 * Wordings that name HOW work lands. Each is true of one development
 * profile and false of another, so none belongs in a document that every
 * profile reads: the server states the project's own route.
 */
export const LANDING_CLAIMS: readonly {
	readonly pattern: RegExp;
	readonly names: string;
}[] = [
	{ pattern: /forge:publish/u, names: 'this repository’s publish script' },
	{ pattern: /\bgh pr create\b/u, names: 'a pull request, by hand' },
	{
		pattern: /\bopens? (?:a |the )?pull requests?\b/iu,
		names: 'a pull request as the landing route',
	},
	{
		pattern:
			/\b(?:integrates?|lands?) (?:only )?(?:through|by|via) (?:a )?pull requests?\b/iu,
		names: 'a pull request as the landing route',
	},
	{
		pattern: /\bmerge (?:it |your work )?into the integration branch\b/iu,
		names: 'a merge as the landing route',
	},
];
