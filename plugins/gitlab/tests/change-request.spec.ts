import { describe, expect, it } from 'vitest';

import { gitlabChangeRequestForge as forge } from '../src/lib/change-request.helper';

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

describe('the GitLab change-request forge', () => {
	it('claims GitLab remotes, self-hosted included, and no other host', () => {
		expect(forge.handles('git@gitlab.com:o/r.git')).toBe(true);
		expect(forge.handles('https://gitlab.corp.example/o/r')).toBe(true);
		expect(forge.handles('https://github.com/o/r')).toBe(false);
	});

	it('finds the open merge request of a branch by its iid', () => {
		const { run, calls } = runner(() =>
			JSON.stringify([
				{
					web_url: 'https://gitlab.com/o/r/-/merge_requests/4',
					iid: 4,
				},
			]),
		);
		expect(forge.findOpen(run, 'feat/x')).toEqual({
			url: 'https://gitlab.com/o/r/-/merge_requests/4',
			id: '4',
		});
		expect(calls[0]?.[0]).toBe('glab');
		expect(calls[0]?.[1].join(' ')).toContain('source_branch=feat%2Fx');
		expect(
			forge.findOpen({ text: () => '[]', json: () => [] }, 'b'),
		).toBeUndefined();
	});

	it('reads title and description', () => {
		const ref = { url: 'u', id: '4' };
		const { run, calls } = runner(() =>
			JSON.stringify({ title: 't', description: null }),
		);
		expect(forge.read(run, ref)).toEqual({ title: 't', body: '' });
		expect(calls[0]?.[1]).toContain('projects/:id/merge_requests/4');
	});

	it('rewrites title and description with a PUT, and says when it failed', () => {
		const ok = runner(() => JSON.stringify({ iid: 4 }));
		const ref = { url: 'u', id: '4' };
		expect(forge.update(ok.run, ref, { title: 'T', body: 'B' })).toBe(true);
		expect(ok.calls[0]?.[1]).toEqual(
			expect.arrayContaining(['-X', 'PUT', 'title=T', 'description=B']),
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
});
