/**
 * `integration adopt` — renders the integrator workflow, the rehearsal
 * workflow and the CI signal job from this project's policy. The workflows
 * are written; the signal job is printed, to be appended to the project's
 * own CI, which this command never edits.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { readWorkspacePolicy, scalarArg } from '@delendai/core/cli';
import { renderAdoption } from '@delendai/integration/public';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import { CLI_VERSION } from '../contracts/constants/version.constant';
import type {
	ICliCommandContext,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';

/** Write the adoption files under the working directory and print the signal job. */
export const runIntegrationAdopt = async (
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
	const policy = await readWorkspacePolicy(ctx.cwd);
	const needs = (
		scalarArg(args, 'needs') ?? policy.integration.requiredChecks.join(',')
	)
		.split(',')
		.filter((job) => job !== '');
	if (needs.length === 0)
		return {
			code: EXIT_CODE.USAGE,
			error: 'name the project CI jobs the signal waits on: --needs=<job,job> (or set development.integration.requiredChecks).',
		};
	const adoption = renderAdoption({
		integrationBranch: policy.branches.integration,
		releaseBranch: policy.branches.release,
		identity: policy.integration.identity,
		cron: policy.integration.watchdog.cron,
		requiredJobs: needs,
		version: CLI_VERSION,
	});
	for (const file of adoption.files) {
		if (file.content === null) continue;
		await mkdir(dirname(join(ctx.cwd, file.path)), { recursive: true });
		await writeFile(join(ctx.cwd, file.path), file.content);
	}
	return {
		code: EXIT_CODE.OK,
		data: { written: adoption.files.map((file) => file.path) },
		text: `wrote ${adoption.files.map((file) => file.path).join(', ')}\n\nAppend this job to the jobs of your CI:\n\n${adoption.signalJob}`,
	};
};
