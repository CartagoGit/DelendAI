import type { ICliGlobalOptions } from '../contracts/interfaces/cli-command.interface';

export const buildServerArgs = (
	globals: ICliGlobalOptions,
	extraPlugins: readonly string[] = [],
): string[] => {
	const args = ['__serve', '--workspace', globals.workspace];
	if (globals.config !== undefined) args.push('--config', globals.config);
	if (globals.preset !== undefined) args.push('--preset', globals.preset);
	const plugins = [...new Set([...globals.plugins, ...extraPlugins])];
	if (plugins.length > 0) args.push('--plugins', plugins.join(','));
	return args;
};
