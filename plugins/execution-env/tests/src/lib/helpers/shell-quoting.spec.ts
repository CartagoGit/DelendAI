import { describe, expect, it } from 'vitest';

import {
	buildRemoteCommand,
	quotePosix,
	quotePowerShell,
} from '../../../../src/lib/helpers/shell-quoting.helper';

describe('quotePosix', () => {
	it('wraps a word in single quotes and escapes the quote itself', () => {
		expect(quotePosix('a b')).toBe("'a b'");
		expect(quotePosix("it's")).toBe(`'it'\\''s'`);
		expect(quotePosix('$(rm -rf /); `id`')).toBe("'$(rm -rf /); `id`'");
	});
});

describe('quotePowerShell', () => {
	it('doubles the ASCII single quote', () => {
		expect(quotePowerShell("it's")).toBe("'it''s'");
	});

	it('doubles the typographic quotes PowerShell also treats as quotes', () => {
		expect(quotePowerShell('a\u2018b\u2019c\u201Ad\u201Be')).toBe(
			"'a\u2018\u2018b\u2019\u2019c\u201A\u201Ad\u201B\u201Be'",
		);
	});

	it('leaves dollar signs and backticks inert inside single quotes', () => {
		expect(quotePowerShell('$env:SECRET `n')).toBe("'$env:SECRET `n'");
	});
});

describe('buildRemoteCommand posix', () => {
	it('quotes every word and execs, so the remote shell parses nothing from data', () => {
		expect(
			buildRemoteCommand(
				{ command: ['echo', 'a; rm -rf /', "x'y"] },
				'posix',
			),
		).toBe(`exec 'echo' 'a; rm -rf /' 'x'\\''y'`);
	});

	it('changes directory first and sets variables through env', () => {
		expect(
			buildRemoteCommand(
				{ command: ['ls'], cwd: '/srv/my app', env: { A: 'b c' } },
				'posix',
			),
		).toBe(`cd -- '/srv/my app' && exec env 'A=b c' 'ls'`);
	});

	it('refuses a program that is an option, an empty command or a bad variable name', () => {
		expect(() => buildRemoteCommand({ command: ['-rf'] }, 'posix')).toThrow(
			'dash',
		);
		expect(() => buildRemoteCommand({ command: [] }, 'posix')).toThrow(
			'needs a program',
		);
		expect(() =>
			buildRemoteCommand(
				{ command: ['ls'], env: { 'A;B': '1' } },
				'posix',
			),
		).toThrow('environment variable name');
	});
});

describe('buildRemoteCommand powershell', () => {
	it('uses the call operator with quoted words and propagates the exit code', () => {
		expect(
			buildRemoteCommand(
				{
					command: ['git', 'log', "it's"],
					cwd: 'C:\\work tree',
					env: { MODE: 'x' },
				},
				'powershell',
			),
		).toBe(
			"Set-Location -LiteralPath 'C:\\work tree'; $env:MODE = 'x'; & 'git' 'log' 'it''s'; exit $LASTEXITCODE",
		);
	});
});
