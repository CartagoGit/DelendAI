/**
 * What `work` says about itself: shared by the command and by the lazy
 * entry that loads it, so its help and its flags cannot drift apart
 * (x00721). Each names the command itself, where the registry's readers
 * look for it.
 */
export const WORK_COMMAND = {
	summary:
		'Persist work to its own ref without moving the shared checkout, and report whether the checkout is where the policy requires.',
	usage: 'work <status|swarm|doctor|claim|enter|checkpoint|publish|retire|reap> [--proposal=<id>] [--slice=<id>] [--paths=<a,b>] [--message=<text>] [--agent=<who>] [--generation=<n>] [--topic=<text>] [--alongside] [--workspace=<path>]',
	flags: [
		'proposal',
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
		'paths',
		'keep-work-ref',
		'reason',
		'unowned',
		'with-worktree',
		'no-pull-request',
		'forge',
		'allow-scope-narrowing',
		'apply',
	],
} as const;
