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

/** `COMMAND args` split without an expression (linear on any input). */
const splitInstruction = (
	joined: string,
): { readonly word: string; readonly args: string } | null => {
	let end = 0;
	while (/[A-Za-z]/u.test(joined.charAt(end))) end += 1;
	if (end === 0 || joined.charAt(end).trim() !== '' || end >= joined.length) {
		return null;
	}
	let argsAt = end;
	while (argsAt < joined.length && joined.charAt(argsAt).trim() === '') {
		argsAt += 1;
	}
	const args = joined.slice(argsAt);
	return /[\n\r\u2028\u2029]/u.test(args)
		? null
		: { word: joined.slice(0, end), args };
};

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
		const match = splitInstruction(joined);
		if (match === null) continue;
		const command =
			match.word.toUpperCase() as IDockerfileInstructionCommand;
		if (!COMMANDS.has(command)) continue;

		instructions.push({
			command,
			args: match.args.trim(),
			line: startLine,
			raw: rawLines.join('\n').replace(/\r/g, ''),
		});
	}

	return instructions;
};
