import type { IDockerLogLine } from './types';

const TIMESTAMPED_LOG_LINE = /^(\S+)\s(.*)$/u;

const toIsoTimestamp = (value: string): string | undefined => {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return undefined;
	}
	return parsed.toISOString();
};

export const parseDockerLogs = (
	raw: string,
	stream: IDockerLogLine['stream'] = 'unknown',
): readonly IDockerLogLine[] => {
	const lines: IDockerLogLine[] = [];
	for (const line of raw.split(/\r?\n/u)) {
		if (line.trim() === '') continue;
		const match = TIMESTAMPED_LOG_LINE.exec(line);
		if (match === null) continue;
		if (match[1] === undefined) continue;
		const timestamp = toIsoTimestamp(match[1]);
		if (timestamp === undefined) continue;
		lines.push({
			timestamp,
			stream,
			message: match[2] ?? line,
		});
	}
	return lines;
};
