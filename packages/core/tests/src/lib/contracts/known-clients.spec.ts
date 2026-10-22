/**
 * known-clients.spec.ts — the vendor clients delendai knows are listed
 * once, and no plugin keeps a list of its own.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { KNOWN_CLIENTS } from '../../../../src/lib/contracts/constants/known-clients.constant';
import { knownClientOf } from '../../../../src/lib/shared/known-client.helper';

const REPO = resolve(__dirname, '../../../../../..');

const sourcesUnder = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return sourcesUnder(path);
		return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
	});

describe('the catalogue of known clients', () => {
	it('names each client once, and flags every installer that pipes into a shell', () => {
		const commands = KNOWN_CLIENTS.map((client) => client.command);
		const ids = KNOWN_CLIENTS.map((client) => client.id);
		expect(new Set(commands).size).toBe(commands.length);
		expect(new Set(ids).size).toBe(ids.length);
		for (const client of KNOWN_CLIENTS) {
			expect(client.install.dangerous).toBe(
				client.install.pipeTo !== undefined,
			);
		}
		expect(commands).toEqual(
			expect.arrayContaining(['claude', 'codex', 'opencode']),
		);
	});

	it('finds the client a command runs, whatever its path or suffix', () => {
		expect(knownClientOf('/usr/local/bin/claude')?.id).toBe('claude-cli');
		expect(knownClientOf('C:\\tools\\codex.exe')?.profileVariable).toBe(
			'CODEX_HOME',
		);
		expect(knownClientOf('not-a-client')).toBeUndefined();
	});

	it('is the only list: no plugin source that probes or launches clients enumerates them', () => {
		const commands = KNOWN_CLIENTS.map((client) => client.command);
		const plugins = join(REPO, 'plugins');
		const offenders = readdirSync(plugins)
			.map((name) => join(plugins, name, 'src'))
			.filter((dir) => {
				try {
					return statSync(dir).isDirectory();
				} catch {
					return false;
				}
			})
			.flatMap(sourcesUnder)
			.filter((path) => {
				const text = readFileSync(path, 'utf8');
				// Only code that finds, installs or isolates a client could
				// keep a catalogue of its own: word lists and host-name maps
				// name clients for other reasons.
				if (
					!/command -v|auth status|login status|installHint|profile director/u.test(
						text,
					)
				)
					return false;
				// A literal list or table naming three or more known clients.
				const named = commands.filter((command) =>
					new RegExp(
						`(?:^|[\\s,[{])'${command}'\\s*[,:\\]]`,
						'mu',
					).test(text),
				);
				return named.length >= 3;
			})
			.map((path) => path.slice(REPO.length + 1));
		expect(offenders).toEqual([]);
	});
});
