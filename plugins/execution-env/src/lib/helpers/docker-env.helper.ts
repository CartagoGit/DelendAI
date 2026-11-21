import {
	DOCKER_BINARY,
	DOCKER_INSPECT_ENV_FORMAT,
} from '../contracts/constants/docker-cli.constant';
import type { IProcessRunner } from '../contracts/interfaces/process-runner.interface';

/** Split `KEY=value` entries; the value may itself contain `=`. */
export const parseEnvironmentEntries = (
	entries: readonly string[],
): Readonly<Record<string, string>> => {
	const out: Record<string, string> = {};
	for (const entry of entries) {
		const at = entry.indexOf('=');
		if (at <= 0) continue;
		out[entry.slice(0, at)] = entry.slice(at + 1);
	}
	return out;
};

/** Read a container's environment with `docker inspect`. */
export const inspectContainerEnvironment = async (
	runner: IProcessRunner,
	containerName: string,
): Promise<Readonly<Record<string, string>>> => {
	const result = await runner.run([
		DOCKER_BINARY,
		'inspect',
		`--format=${DOCKER_INSPECT_ENV_FORMAT}`,
		'--',
		containerName,
	]);
	if (result.exitCode !== 0) {
		throw new Error(
			`docker inspect failed for ${containerName}: ${result.stderr.trim()}`,
		);
	}
	const parsed: unknown = JSON.parse(result.stdout.trim() || 'null');
	if (!Array.isArray(parsed)) return {};
	return parseEnvironmentEntries(
		parsed.filter((entry): entry is string => typeof entry === 'string'),
	);
};
