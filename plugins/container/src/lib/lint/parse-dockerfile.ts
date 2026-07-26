import type {
	IDockerfileInstruction,
	IDockerfileInstructionCommand,
} from './types';

const COMMANDS = new Set<IDockerfileInstructionCommand>([
	'FROM',
	'RUN',
	'CMD',
	'ENTRYPOINT',
	'ENV',
	'ARG',
	'COPY',
	'ADD',
	'WORKDIR',
	'USER',
	'EXPOSE',
	'VOLUME',
	'LABEL',
	'HEALTHCHECK',
	'SHELL',
	'MAINTAINER',
	'STOPSIGNAL',
]);

const stripContinuation = (line: string): string =>
	line.replace(/\\\s*$/u, '').trimEnd();

const hasContinuation = (line: string): boolean => /\\\s*$/u.test(line);

const joinInstructionLines = (lines: readonly string[]): string =>
	lines
		.map((line) => stripContinuation(line).trim())
		.join(' ')
		.trim();

export const parseDockerfile = (
	source: string,
): readonly IDockerfileInstruction[] => {
	const instructions: IDockerfileInstruction[] = [];
	const physicalLines = source.split(/\r?\n/u);

	for (let index = 0; index < physicalLines.length; index += 1) {
		const line = physicalLines[index] ?? '';
		const trimmed = line.trim();
		if (trimmed === '' || trimmed.startsWith('#')) continue;

		const rawLines = [line];
		const startLine = index + 1;
		while (hasContinuation(rawLines[rawLines.length - 1] ?? '')) {
			index += 1;
			if (index >= physicalLines.length) break;
			rawLines.push(physicalLines[index] ?? '');
		}

		const joined = joinInstructionLines(rawLines);
		const match = /^([A-Za-z]+)\s+(.*)$/u.exec(joined);
		if (match === null) continue;
		const command =
			match[1]!.toUpperCase() as IDockerfileInstructionCommand;
		if (!COMMANDS.has(command)) continue;

		instructions.push({
			command,
			args: match[2]!.trim(),
			line: startLine,
			raw: rawLines.join('\n').replace(/\r/g, ''),
		});
	}

	return instructions;
};
