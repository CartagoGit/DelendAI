/**
 * `integration pass` — runs one integrator pass in this project: the
 * policy and the forge CLI are resolved here, and the pass itself (its
 * decisions and its ports) is the integration plugin's `runIntegrationPass`.
 */
import { readWorkspacePolicy } from '@delendai/core/cli';
import {
	runIntegrationPass,
	type IIntegrationPassInput,
	type IRehearsalCommandRunner,
} from '@delendai/integration/public';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	ICliCommandContext,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';

/** `GITHUB_REPOSITORY` when the runner sets it, else the repository `gh` names for the checkout. */
const repositoryOf = async (
	runGh: IRehearsalCommandRunner,
	env: NodeJS.ProcessEnv,
): Promise<string | undefined> => {
	if (env.GITHUB_REPOSITORY !== undefined) return env.GITHUB_REPOSITORY;
	const named = await runGh([
		'repo',
		'view',
		'--json',
		'nameWithOwner',
		'--jq',
		'.nameWithOwner',
	]);
	const slug = named.stdout.trim();
	return named.exitCode === 0 && slug !== '' ? slug : undefined;
};

export const runIntegrationPassCommand = async (
	ctx: ICliCommandContext,
	runGh: IRehearsalCommandRunner,
	env: NodeJS.ProcessEnv = process.env,
	ports?: IIntegrationPassInput['ports'],
): Promise<ICliCommandResult> => {
	const lines: string[] = [];
	const errors: string[] = [];
	const slug = await repositoryOf(runGh, env);
	const code = await runIntegrationPass({
		root: ctx.cwd,
		policy: await readWorkspacePolicy(ctx.cwd),
		env: slug === undefined ? env : { ...env, GITHUB_REPOSITORY: slug },
		runGh,
		...(ports === undefined ? {} : { ports }),
		log: (line) => lines.push(line),
		error: (line) => errors.push(line),
	});
	return {
		code: code === 0 ? EXIT_CODE.OK : EXIT_CODE.RUNTIME,
		text: lines.join('\n'),
		...(errors.length === 0 ? {} : { error: errors.join('\n') }),
	};
};
