/**
 * acp-permission.constant.ts — how an allowed tool name reads as the
 * Agent Client Protocol's structured tool kind.
 *
 * A hop's `toolsAllow` names tools the way hosts do (`Read`, `Bash`); an
 * ACP permission request names the operation by its kind. An allowed
 * name grants the kind it stands for, and a name that is itself a kind
 * grants that kind. `other` and `think` are never granted: they say
 * nothing about what would run.
 */
export const ACP_KIND_OF_TOOL: Readonly<Record<string, string>> = {
	read: 'read',
	edit: 'edit',
	write: 'edit',
	multiedit: 'edit',
	delete: 'delete',
	move: 'move',
	search: 'search',
	grep: 'search',
	glob: 'search',
	execute: 'execute',
	bash: 'execute',
	shell: 'execute',
	fetch: 'fetch',
	webfetch: 'fetch',
	switch_mode: 'switch_mode',
};
