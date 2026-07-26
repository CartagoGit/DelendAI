/**
 * dockerfile-parser.ts — f00133 S2: pure Dockerfile parser.
 */
export interface IDockerfileInstruction {
	readonly line: number;
	readonly command: string;
	readonly args: readonly string[];
}

const joinedLines = (raw: string): readonly string[] => {
	const out: string[] = [];
	let buffer = '';
	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (trimmed === '' || trimmed.startsWith('#')) {
			if (buffer !== '') {
				out.push(buffer.trim());
				buffer = '';
			}
			continue;
		}
		if (trimmed.endsWith('\\')) {
			buffer += `${trimmed.slice(0, -1)} `;
			continue;
		}
		out.push((buffer + trimmed).trim());
		buffer = '';
	}
	if (buffer !== '') out.push(buffer.trim());
	return out;
};

const splitInstruction = (
	line: string,
): { command: string; args: string[] } | null => {
	const trimmed = line.trimStart();
	if (trimmed === '') return null;
	const match = /^([A-Za-z]+)\s+(.*)$/.exec(trimmed);
	if (match === null) return null;
	const command = match[1] ?? '';
	const rest = match[2] ?? '';
	if (rest.startsWith('[') && rest.endsWith(']')) {
		const inner = rest.slice(1, -1);
		const args = inner
			.split(',')
			.map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
			.filter((entry) => entry.length > 0);
		return { command, args };
	}
	return {
		command,
		args: rest.split(/\s+/).filter((entry) => entry.length > 0),
	};
};

export const parseDockerfile = (
	raw: string,
): readonly IDockerfileInstruction[] => {
	const instructions: IDockerfileInstruction[] = [];
	let lineNo = 0;
	for (const line of joinedLines(raw)) {
		lineNo += 1;
		const parsed = splitInstruction(line);
		if (parsed === null) continue;
		instructions.push({
			line: lineNo,
			command: parsed.command,
			args: parsed.args,
		});
	}
	return instructions;
};
