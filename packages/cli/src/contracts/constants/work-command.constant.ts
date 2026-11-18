/**
 * What `work` says about itself: shared by the command and by the lazy
 * entry that loads it, so its help and its flags cannot drift apart
 * (x00721). Each names the command itself, where the registry's readers
 * look for it.
 */
export const WORK_COMMAND = {
	// The work engine runs in the CLI process; only `deliver` calls the
	// server, for its proposal transitions (x01035).
	offline: (args: readonly string[]): boolean =>
		args[0] !== 'deliver' && args[0] !== 'revalidate',
	summary:
		'Persist work to its own ref without moving the shared checkout, and report whether the checkout is where the policy requires; `revalidate` re-validates the shipped proposals sent back for fresh evidence in one batch.',
	usage: 'work <status|progress|swarm|doctor|claim|enter|checkpoint|prove|deliver|revalidate|publish|retire|retired|reap|rescue> [--proposal=<id>] [--slice=<id>] [--paths=<a,b>] [--message=<text>] [--agent=<who>] [--generation=<n>] [--topic=<text>] [--urgent=<reason>] [--only=<gate>[,<gate>]] [--alongside] [--print-path] [--all] [--watch] [--agents] [--workspace=<path>]',
	flags: [
		'proposal',
		// `work revalidate --proposals=<id,id>` names the batch instead of selecting it.
		'proposals',
		'slice',
		'kind',
		'agent',
		'as',
		'session',
		'generation',
		'alongside',
		'topic',
		'dir',
		'worktrees',
		'ref',
		'message',
		'locate',
		'paths',
		'keep-work-ref',
		'reason',
		'urgent',
		// `work prove --only=<gate>` runs those gates of the proof, never proving the unit.
		'only',
		'drop',
		'unowned',
		'with-worktree',
		// `work swarm --all` lists the ended units it otherwise folds.
		'all',
		'no-pull-request',
		'forge',
		'allow-scope-narrowing',
		'apply',
		// `work progress --watch` redraws in place; `--agents` shows only who is at work.
		'watch',
		'agents',
		// `work enter --print-path` prints the worktree and nothing else, so
		// `W=$(delendai work enter … --print-path) || exit 1` stops on a refusal.
		'print-path',
	],
} as const;
