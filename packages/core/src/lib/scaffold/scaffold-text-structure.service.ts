const parseJsonOrThrow = (path: string, text: string): void => {
	try {
		JSON.parse(text);
	} catch (error) {
		throw new Error(
			`${path} failed to parse after wiring: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
};

const assertTypeScriptLikeStructure = (path: string, text: string): void => {
	const stack: string[] = [];
	let mode:
		| 'normal'
		| 'single-quote'
		| 'double-quote'
		| 'template'
		| 'line-comment'
		| 'block-comment' = 'normal';
	let escaped = false;
	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		const next = text[index + 1];
		if (mode === 'line-comment') {
			if (char === '\n') mode = 'normal';
			continue;
		}
		if (mode === 'block-comment') {
			if (char === '*' && next === '/') {
				mode = 'normal';
				index += 1;
			}
			continue;
		}
		if (mode === 'single-quote') {
			if (!escaped && char === '\\') {
				escaped = true;
				continue;
			}
			if (!escaped && char === "'") mode = 'normal';
			escaped = false;
			continue;
		}
		if (mode === 'double-quote') {
			if (!escaped && char === '\\') {
				escaped = true;
				continue;
			}
			if (!escaped && char === '"') mode = 'normal';
			escaped = false;
			continue;
		}
		if (mode === 'template') {
			if (!escaped && char === '\\') {
				escaped = true;
				continue;
			}
			if (!escaped && char === '`') mode = 'normal';
			escaped = false;
			continue;
		}
		if (char === '/' && next === '/') {
			mode = 'line-comment';
			index += 1;
			continue;
		}
		if (char === '/' && next === '*') {
			mode = 'block-comment';
			index += 1;
			continue;
		}
		if (char === "'") {
			mode = 'single-quote';
			continue;
		}
		if (char === '"') {
			mode = 'double-quote';
			continue;
		}
		if (char === '`') {
			mode = 'template';
			continue;
		}
		if (char === '{' || char === '[' || char === '(') {
			stack.push(char);
			continue;
		}
		if (char === '}' || char === ']' || char === ')') {
			const open = stack.pop();
			if (
				(open === '{' && char !== '}') ||
				(open === '[' && char !== ']') ||
				(open === '(' && char !== ')') ||
				open === undefined
			) {
				throw new Error(
					`${path} failed structural validation after edit: unexpected ${char} at offset ${index}`,
				);
			}
		}
	}
	if (mode !== 'normal' || stack.length > 0) {
		throw new Error(`${path} failed structural validation after edit`);
	}
};

export const validateStructuredText = (path: string, text: string): void => {
	if (path.endsWith('.json')) {
		parseJsonOrThrow(path, text);
		return;
	}
	assertTypeScriptLikeStructure(path, text);
};
