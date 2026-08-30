import {
	authorExternalPlugin,
	createWorkspacePathProvider,
} from '@mcp-vertex/core/public';

import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type { ICliCommand } from '../../contracts/interfaces/cli-command.interface';
import { hasFlag, positionalArg, scalarArg, usage } from './group-helpers';

export const pluginAuthorCommand: ICliCommand = {
	name: 'plugin author',
	summary: 'Create or repair a project-owned external plugin.',
	async run(args, ctx) {
		const name = positionalArg(args);
		if (name === undefined) {
			return usage(
				'plugin author <name> [--description=...] [--namespace=...] [--mode=create|inspect|repair] [--dry-run] [--keep-legacy]',
			);
		}
		const mode = scalarArg(args, 'mode');
		if (
			mode !== undefined &&
			mode !== 'create' &&
			mode !== 'inspect' &&
			mode !== 'repair'
		) {
			return {
				code: EXIT_CODE.USAGE,
				error: '--mode must be create, inspect or repair',
			};
		}
		try {
			const result = await authorExternalPlugin(
				{
					name,
					...(scalarArg(args, 'description') !== undefined
						? { description: scalarArg(args, 'description') }
						: {}),
					...(scalarArg(args, 'namespace') !== undefined
						? { namespace: scalarArg(args, 'namespace') }
						: {}),
					mode:
						mode === 'repair'
							? 'repair'
							: mode === 'inspect'
								? 'inspect'
								: 'create',
					...(hasFlag(args, 'dry-run') ? { dryRun: true } : {}),
					...(hasFlag(args, 'keep-legacy')
						? { keepLegacy: true }
						: {}),
				},
				{
					namespacePrefix: 'mcp-vertex',
					workspace: createWorkspacePathProvider(
						ctx.globals.workspace,
					),
				},
			);
			if (ctx.globals.json || ctx.globals.format === 'json') {
				return { code: EXIT_CODE.OK, data: result };
			}
			return {
				code: EXIT_CODE.OK,
				data: result,
				text: `${result.nextSteps}\n`,
			};
		} catch (error) {
			return {
				code: EXIT_CODE.VALIDATION,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	},
};
