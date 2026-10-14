/**
 * docker-command.service.ts — one way every container tool runs docker.
 *
 * The consent rules are the plugin's: a command that changes something
 * runs only with `confirm: true`, `dryRun: true` shows the argv and runs
 * nothing, a command whose settings reach the host also needs
 * `confirmRisk: true`, and a missing CLI is a typed answer, not a crash.
 * Reading commands (`ps`, `logs`, `ls`, `inspect`) need no consent. In a
 * repository with no Docker signal, every change is refused: the plugin
 * stays passive there, whatever the caller consents to.
 */
import {
	probeTool,
	realProbeDeps,
	runExternalTool,
} from '@delendai/core/public';

import {
	DOCKER_COMMAND_TIMEOUT_MS,
	DOCKER_OUTPUT_MAX_CHARS,
} from '../contracts/constants/docker-signals.constant';
import type {
	IDockerCommand,
	IDockerConsent,
	IDockerDeps,
} from '../contracts/interfaces/docker-command.interface';
import { DOCKER_TOOL } from '../inspect/cli-tools';

const clip = (text: string): string =>
	text.length > DOCKER_OUTPUT_MAX_CHARS
		? `${text.slice(0, DOCKER_OUTPUT_MAX_CHARS)}… (${String(text.length - DOCKER_OUTPUT_MAX_CHARS)} more chars)`
		: text;

export const runDocker = async (
	deps: IDockerDeps,
	command: IDockerCommand,
	consent: IDockerConsent = {},
): Promise<Record<string, unknown>> => {
	const shown = `docker ${command.argv.join(' ')}`;
	if (consent.dryRun === true)
		return {
			ok: 'dry-run',
			command: shown,
			...(command.risks.length > 0 ? { risks: [...command.risks] } : {}),
		};
	if (
		command.mutating &&
		deps.usesDocker !== undefined &&
		!(await deps.usesDocker())
	)
		return {
			ok: false,
			reason: 'this repository shows no sign of using Docker (no root Dockerfile, compose file or .devcontainer/)',
			nextAction:
				'The Docker tools only read here. Add the file that says the project uses Docker, or run the command yourself.',
		};
	if (command.mutating && consent.confirm !== true)
		return {
			ok: false,
			reason: 'mutation requires confirm: true',
			nextAction:
				'Pass `confirm: true` (or `dryRun: true` to see the command) and retry.',
		};
	if (command.risks.length > 0 && consent.confirmRisk !== true)
		return {
			ok: false,
			reason: `this container reaches beyond itself: ${command.risks.join('; ')}`,
			nextAction:
				'Ask the person to approve exactly this, then retry with `confirmRisk: true`. `confirm` alone never allows it.',
		};
	const probe = await probeTool(
		DOCKER_TOOL,
		deps.probeDeps ?? realProbeDeps(),
	);
	if (!probe.available)
		return {
			ok: false,
			isError: true,
			error: {
				reason: 'install-missing',
				...(probe.installHint?.command === undefined
					? {}
					: { nextAction: probe.installHint.command }),
			},
		};
	const run = await runExternalTool(
		{
			tool: DOCKER_TOOL,
			args: command.argv,
			timeoutMs: DOCKER_COMMAND_TIMEOUT_MS,
			...(deps.cwd === undefined ? {} : { cwd: deps.cwd }),
		},
		deps.runExec,
	);
	return {
		ok: !run.unavailable && run.ok,
		command: shown,
		exitCode: run.code,
		stdout: clip(run.stdout),
		stderr: clip(run.stderr),
	};
};
