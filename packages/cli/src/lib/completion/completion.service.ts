/**
 * completion.service.ts — shell-completion script generators (f00046 S10).
 *
 * Derived dynamically from the command-name list so the completion can
 * never drift from `registerAllCommands()`. Commands are multi-word
 * (e.g. `git status`, `memory save`); we expose the set of first words
 * (top-level groups) and, per group, its second words (verbs), plus the
 * single-word commands. Pure string builders — no I/O.
 *
 * Type contracts (`Shell`, `ICompletionModel`) live in
 * `contracts/interfaces/completion.interface.ts` per f00037.
 */

import type {
	ICompletionModel,
	Shell,
} from '../../contracts/interfaces/completion.interface';

export type {
	ICompletionModel,
	Shell,
} from '../../contracts/interfaces/completion.interface';

/** Build the completion model from the flat list of command names. */
export const buildCompletionModel = (
	commandNames: readonly string[],
): ICompletionModel => {
	const leaves: string[] = [];
	const groups = new Map<string, string[]>();
	for (const name of commandNames) {
		const idx = name.indexOf(' ');
		if (idx === -1) {
			leaves.push(name);
			continue;
		}
		const group = name.slice(0, idx);
		const verb = name.slice(idx + 1);
		const verbs = groups.get(group) ?? [];
		verbs.push(verb);
		groups.set(group, verbs);
	}
	const firstWords = [...new Set([...leaves, ...groups.keys()])].sort();
	return { leaves: leaves.sort(), groups, firstWords };
};

const uniqueSorted = (values: readonly string[]): string[] =>
	[...new Set(values)].sort();

/** Generate a completion script for the requested shell. */
export const generateCompletion = (
	shell: Shell,
	commandNames: readonly string[],
): string => {
	const model = buildCompletionModel(commandNames);
	switch (shell) {
		case 'bash':
			return bashCompletion(model);
		case 'zsh':
			return zshCompletion(model);
		case 'fish':
			return fishCompletion(model);
	}
};

const bashCompletion = (model: ICompletionModel): string => {
	const firstWords = model.firstWords.join(' ');
	const caseArms = [...model.groups.entries()]
		.map(
			([group, verbs]) =>
				`      ${group}) COMPREPLY=( $(compgen -W "${uniqueSorted(verbs).join(' ')}" -- "$cur") ) ;;`,
		)
		.join('\n');
	return `# mcp-vertex bash completion (generated)
_mcpv_complete() {
  local cur prev words cword
  _init_completion 2>/dev/null || { cur="\${COMP_WORDS[COMP_CWORD]}"; prev="\${COMP_WORDS[COMP_CWORD-1]}"; }
  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${firstWords}" -- "$cur") )
    return 0
  fi
  case "\${COMP_WORDS[1]}" in
${caseArms}
      *) COMPREPLY=() ;;
  esac
}
complete -F _mcpv_complete mcpv
`;
};

const zshCompletion = (model: ICompletionModel): string => {
	const firstWords = model.firstWords.join(' ');
	const caseArms = [...model.groups.entries()]
		.map(
			([group, verbs]) =>
				`    ${group}) compadd ${uniqueSorted(verbs).join(' ')} ;;`,
		)
		.join('\n');
	return `# mcp-vertex zsh completion (generated)
_mcpv() {
  if (( CURRENT == 2 )); then
    compadd ${firstWords}
    return
  fi
  case "\${words[2]}" in
${caseArms}
  esac
}
compdef _mcpv mcpv
`;
};

const fishCompletion = (model: ICompletionModel): string => {
	const lines: string[] = ['# mcp-vertex fish completion (generated)'];
	for (const word of model.firstWords) {
		lines.push(`complete -c mcpv -n '__fish_use_subcommand' -a '${word}'`);
	}
	for (const [group, verbs] of model.groups.entries()) {
		for (const verb of uniqueSorted(verbs)) {
			lines.push(
				`complete -c mcpv -n '__fish_seen_subcommand_from ${group}' -a '${verb}'`,
			);
		}
	}
	return `${lines.join('\n')}\n`;
};
