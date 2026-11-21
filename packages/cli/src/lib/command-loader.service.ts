import type { ICliCommand } from '../contracts/interfaces/cli-command.interface';

/**
 * The commands a run needs, loading only the module of the family it
 * names.
 *
 * `registerAllCommands` imports the module of every command there is; on a
 * fixture that is 0.28 s on top of the 0.27 s the core costs, paid by
 * `work`, `guard` and `proposals` for modules they never touch. These
 * three families are the ones git hooks and agents call all day, so they
 * name their own module. Everything else, `--help` and `--version`
 * included, still gets the full registry.
 */
const FAMILY_LOADERS: Readonly<
	Record<string, () => Promise<readonly ICliCommand[]>>
> = {
	work: async () => [(await import('../commands/work.command')).workCommand],
	guard: async () => [
		(await import('../commands/guard.command')).guardCommand,
	],
	proposals: async () =>
		(await import('../commands/groups/proposals')).proposalsCommands,
};

/** Flags and `--help`/`--version` need the whole command list. */
const wantsEveryCommand = (argv: readonly string[]): boolean =>
	argv.some(
		(arg) =>
			arg === '--help' ||
			arg === '-h' ||
			arg === '--version' ||
			arg === '-v',
	);

export const loadCommandsFor = async (
	argv: readonly string[],
): Promise<readonly ICliCommand[]> => {
	const family = argv[0];
	const load =
		family === undefined || wantsEveryCommand(argv)
			? undefined
			: FAMILY_LOADERS[family];
	if (load !== undefined) return load();
	const { registerAllCommands } = await import('../commands/registry');
	return registerAllCommands();
};
