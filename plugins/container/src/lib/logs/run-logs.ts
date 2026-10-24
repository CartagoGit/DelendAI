import { parseDockerLogs } from './parse-docker-logs';
import type {
	IDockerLogLine,
	IDockerLogsDeps,
	IDockerLogsInput,
	IDockerLogsResult,
} from './types';

const DEFAULT_TAIL = 100;

const mergeLines = (
	stdout: readonly IDockerLogLine[],
	stderr: readonly IDockerLogLine[],
): readonly IDockerLogLine[] =>
	[...stdout, ...stderr].sort((left, right) =>
		left.timestamp.localeCompare(right.timestamp),
	);

export const runLogs = async (
	input: IDockerLogsInput,
	deps: IDockerLogsDeps,
): Promise<IDockerLogsResult> => {
	const probe = await deps.probeBinary('docker');
	if (!probe.present) {
		return {
			kind: 'skipped',
			hint: probe.hint ?? '`docker` not found on PATH.',
		};
	}

	const cmd = [
		'docker',
		'logs',
		input.container,
		'--tail',
		String(input.tail ?? DEFAULT_TAIL),
		'--timestamps',
	] as const;
	const fullCmd =
		input.since === undefined
			? cmd
			: ([...cmd, '--since', input.since] as const);
	const result = await deps.exec(fullCmd);
	return {
		kind: 'docker-logs',
		container: input.container,
		lines: mergeLines(
			parseDockerLogs(result.stdout, 'stdout'),
			parseDockerLogs(result.stderr, 'stderr'),
		),
	};
};
