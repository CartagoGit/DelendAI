/**
 * work-unit-roots.helper.spec.ts — which client roots count as this
 * project, asked without a repository.
 */
import { describe, expect, it } from 'vitest';

import {
	clientRootUris,
	describeRootsElsewhere,
	rootsElsewhere,
	writesToRepository,
} from '@delendai/core/lib/tools/work-unit-roots.helper';
import { createFakeToolServer } from '@delendai/test-kit';

const noRepository = (): undefined => undefined;

describe('rootsElsewhere', () => {
	it('accepts a root that is the workspace, holds it, or lies inside it', () => {
		for (const root of ['/p/app', '/p', '/p/app/packages/core']) {
			expect(
				rootsElsewhere([`file://${root}`], '/p/app', noRepository),
			).toBeUndefined();
		}
	});

	it('names the roots when none of them is this project', () => {
		expect(
			rootsElsewhere(
				['file:///q/other', 'file:///r/more'],
				'/p/app',
				noRepository,
			),
		).toEqual(['/q/other', '/r/more']);
	});

	it('accepts a worktree of the same repository living elsewhere', () => {
		const repository = (directory: string) =>
			directory === '/wt/unit' || directory === '/p/app'
				? '/p/app/.git'
				: '/q/.git';
		expect(
			rootsElsewhere(['file:///wt/unit'], '/p/app', repository),
		).toBeUndefined();
	});

	it('judges nothing when the client names no directory', () => {
		expect(rootsElsewhere([], '/p/app', noRepository)).toBeUndefined();
		expect(
			rootsElsewhere(['https://example.com/x'], '/p/app', noRepository),
		).toBeUndefined();
	});
});

describe('the rest of the guard', () => {
	it('writes only for the actions that change the repository', () => {
		expect(
			['claim', 'enter', 'checkpoint', 'publish'].every(
				writesToRepository,
			),
		).toBe(true);
		expect(['status', 'swarm', 'doctor'].some(writesToRepository)).toBe(
			false,
		);
	});

	it('tells the client where it is and how to start the right server', () => {
		const said = describeRootsElsewhere(['/q/other'], '/p/app');
		expect(said).toContain('/p/app');
		expect(said).toContain('/q/other');
		expect(said).toContain('--workspace=');
	});

	it('reads the client roots only when the client offers them', async () => {
		expect(await clientRootUris(createFakeToolServer())).toBeUndefined();
		expect(
			await clientRootUris(
				createFakeToolServer({ clientRoots: ['file:///p'] }),
			),
		).toEqual(['file:///p']);
	});

	it('does not judge a client that fails to answer', async () => {
		const server = createFakeToolServer({ clientRoots: [] });
		server.server.listRoots = async () => {
			throw new Error('timed out');
		};
		expect(await clientRootUris(server)).toBeUndefined();
	});
});
