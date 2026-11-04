import { describe, expect, it } from 'vitest';

import { splitCommandLine } from '@delendai/core/lib/shared/command-line.helper';

describe('splitCommandLine', () => {
	it.each([
		['codex mcp-server', ['codex', 'mcp-server']],
		['  node   a  ', ['node', 'a']],
		[
			'node "my tools/server.js" --stdio',
			['node', 'my tools/server.js', '--stdio'],
		],
		["bun 'it''s here'", ['bun', 'its here']],
		['say "a \\"quoted\\" word"', ['say', 'a "quoted" word']],
		['path\\ with\\ spaces', ['path with spaces']],
		['empty "" arg', ['empty', '', 'arg']],
		['', []],
	])('reads %j', (line, expected) => {
		expect(splitCommandLine(line)).toEqual(expected);
	});
});
