/**
 * The proposals workflow plugin. It turns delendai into a multi-agent
 * proposal runner: a file-based proposal store, file-level write locks
 * and a persistent task queue (the "swarm" coordination layer).
 *
 * Load it with `delendai --plugins=proposals`. Paths come from the
 * core's resolved roots: cache/state under `<cacheDir>/proposals`,
 * human-edited proposals under `<docsDir>/proposals`. Override the docs
 * root with `--docsDir`, the cache root with `--cacheDir`.
 *
 * Every tool is namespaced by the plugin (`proposals_*` by default)
 * and returns structured JSON so any agent or model consumes it the
 * same way.
 */
/**
 * r00003 S9 (F9, O + L + I): the proposals plugin's options schema, named
 * so `register()` can `safeParse(ctx.options)` against the SAME contract
 * the loader validates — the configured and validated plugin are one
 * (LSP), and `proposalFolders` / `proposalNarrativePatterns` are typed
 * fields, not `ctx.options.X as Y` casts.
 */

import type {
	IMcpPluginContext,
	IPromptRegistration,
} from '@delendai/core/public';

/** The prompts the proposals plugin offers to hosts. */
export const buildProposalsPrompts = (
	ctx: IMcpPluginContext,
): readonly IPromptRegistration[] => [
	{
		id: 'work',
		register: async (server) => {
			server.registerPrompt(
				`${ctx.namespacePrefix}_work`,
				{
					description:
						'Start (or continue) proposal work efficiently in this project.',
				},
				async () => ({
					messages: [
						{
							role: 'user' as const,
							content: {
								type: 'text' as const,
								text: [
									`Call \`${ctx.namespacePrefix}_auto_work\` to get the next proposal and a step plan.`,
									'If the returned orchestration policy says the slice is non-trivial, call `continue_proposal mode:"plan"` and `delegate` before doing the heavy inspection in the main thread.',
									'Then: claim files with `agent_lock`, do one atomic slice, validate, `sync_proposals`, release the lock.',
									'Report `lock-conflict` instead of retrying a blocked claim. Keep it small and low-token.',
								].join('\n'),
							},
						},
					],
				}),
			);
		},
	},
	{
		id: 'orchestrate',
		register: async (server) => {
			server.registerPrompt(
				`${ctx.namespacePrefix}_orchestrate`,
				{
					description:
						'Coordinate multiple subagents over a proposal split into disjoint slices.',
				},
				async () => ({
					messages: [
						{
							role: 'user' as const,
							content: {
								type: 'text' as const,
								text: [
									`Call \`${ctx.namespacePrefix}_proposal_board\` to see proposals, slices and claims.`,
									`Use \`${ctx.namespacePrefix}_plan\` to validate disjoint slices, then \`${ctx.namespacePrefix}_delegate\` one claimable slice per subagent (assigns name + lock).`,
									`Each subagent does its slice then \`${ctx.namespacePrefix}_close_slice\` (marks done + releases lock). When all close, run the global gate once.`,
									'Keep slices file-disjoint; never give two agents overlapping files.',
								].join('\n'),
							},
						},
					],
				}),
			);
		},
	},
];
