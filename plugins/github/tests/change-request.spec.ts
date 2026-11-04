import { describe, expect, it } from 'vitest';

import { githubChangeRequestForge as forge } from '../src/lib/change-request.helper';

type ICall = readonly [string, readonly string[]];

const runner = (answer: (args: readonly string[]) => string | undefined) => {
	const calls: ICall[] = [];
	return {
		calls,
		run: {
			text: (bin: string, args: readonly string[]) => {
				calls.push([bin, args]);
				return answer(args);
			},
			json: (bin: string, args: readonly string[]) => {
				calls.push([bin, args]);
				const raw = answer(args);
				try {
					return raw === undefined ? undefined : JSON.parse(raw);
				} catch {
					return undefined;
				}
			},
		},
	};
};

import plugin from '../src/index';

describe('the GitHub change-request forge', () => {
	it('claims GitHub remotes and no other host', () => {
		expect(forge.handles('git@github.com:o/r.git')).toBe(true);
		expect(forge.handles('https://github.com/o/r')).toBe(true);
		expect(forge.handles('https://gitlab.com/o/r')).toBe(false);
		expect(forge.handles('https://evilgithub.com/o/r')).toBe(false);
	});

	it('finds the open pull request of a branch', () => {
		const { run, calls } = runner(() =>
			JSON.stringify([
				{ url: 'https://github.com/o/r/pull/7', number: 7 },
			]),
		);
		expect(forge.findOpen(run, 'b')).toEqual({
			url: 'https://github.com/o/r/pull/7',
			id: '7',
		});
		expect(calls[0]?.[0]).toBe('gh');
		expect(
			forge.findOpen({ text: () => '[]', json: () => [] }, 'b'),
		).toBeUndefined();
	});

	it('reads the text through the REST API', () => {
		const { run, calls } = runner(() => JSON.stringify(['t', 'b']));
		const ref = { url: 'u', id: '7' };
		expect(forge.read(run, ref)).toEqual({ title: 't', body: 'b' });
		expect(calls[0]?.[1]).toContain('repos/{owner}/{repo}/pulls/7');
		expect(
			forge.read({ text: () => undefined, json: () => undefined }, ref),
		).toBeUndefined();
	});

	it('rewrites title and body with a PATCH, and says when it failed', () => {
		const ok = runner(() => 'https://github.com/o/r/pull/7');
		const ref = { url: 'u', id: '7' };
		expect(forge.update(ok.run, ref, { title: 'T', body: 'B' })).toBe(true);
		const args = ok.calls[0]?.[1] ?? [];
		expect(args).toEqual(
			expect.arrayContaining(['-X', 'PATCH', 'title=T', 'body=B']),
		);
		expect(
			forge.update(
				{ text: () => undefined, json: () => undefined },
				ref,
				{ title: 'T', body: 'B' },
			),
		).toBe(false);
	});

	it('is the adapter the plugin exposes to the core', () => {
		expect(plugin.changeRequestForge).toBe(forge);
	});

	it('reads nothing from a malformed answer', () => {
		const odd = { text: () => 'x', json: () => ({ url: 1 }) };
		expect(
			forge.findOpen({ ...odd, json: () => [1] }, 'b'),
		).toBeUndefined();
		expect(
			forge.findOpen({ ...odd, json: () => [{ url: 'u' }] }, 'b'),
		).toBeUndefined();
		expect(
			forge.read({ ...odd, json: () => ['t'] }, { url: 'u', id: '1' }),
		).toBeUndefined();
		expect(
			forge.update(
				{ ...odd, text: () => '' },
				{ url: 'u', id: '1' },
				{ title: 't', body: 'b' },
			),
		).toBe(false);
	});
});
