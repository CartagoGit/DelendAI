/**
 * command-line.helper.ts — a command line read the way a shell reads its
 * quotes, without running a shell.
 *
 * A provider's `server` descriptor (`node "my tools/server.js" --stdio`)
 * was split on whitespace, so a quoted path with a space became two
 * arguments and the provider never started. Single quotes keep everything
 * literally; double quotes keep spaces and honour `\\"` and `\\\\`; a
 * backslash outside quotes escapes the next character.
 */
export const splitCommandLine = (line: string): readonly string[] => {
	const tokens: string[] = [];
	let current = '';
	let started = false;
	let quote: "'" | '"' | undefined;
	for (let index = 0; index < line.length; index++) {
		const char = line.charAt(index);
		if (quote === "'") {
			if (char === "'") quote = undefined;
			else current += char;
			continue;
		}
		if (quote === '"') {
			if (char === '"') quote = undefined;
			else if (char === '\\' && /["\\]/u.test(line.charAt(index + 1))) {
				index++;
				current += line.charAt(index);
			} else current += char;
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			started = true;
			continue;
		}
		if (char === '\\' && index + 1 < line.length) {
			index++;
			current += line.charAt(index);
			started = true;
			continue;
		}
		if (/\s/u.test(char)) {
			if (started) tokens.push(current);
			current = '';
			started = false;
			continue;
		}
		current += char;
		started = true;
	}
	if (started) tokens.push(current);
	return tokens;
};
