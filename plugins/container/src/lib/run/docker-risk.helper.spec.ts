import { describe, expect, it } from 'vitest';

import { containerRisks } from './docker-risk.helper';

const ROOT = '/work/project';

describe('containerRisks — host folders bound in', () => {
	it.each([
		'/:/host',
		'/etc:/etc:ro',
		'~/.ssh:/keys',
		'$HOME:/home',
		'../up:/x',
	])('names a bind of %s as a risk', (mount) => {
		expect(containerRisks({ mounts: [mount] }, ROOT)).toEqual([
			`binds a host folder outside the workspace (${mount})`,
		]);
	});

	it.each(['./data:/data', '/work/project/src:/src', 'cache:/cache'])(
		'lets %s through: inside the workspace, or a named volume',
		(mount) => {
			expect(containerRisks({ mounts: [mount] }, ROOT)).toEqual([]);
		},
	);

	it('names the docker socket once, as the socket', () => {
		expect(
			containerRisks(
				{ mounts: ['/var/run/docker.sock:/var/run/docker.sock'] },
				ROOT,
			),
		).toEqual([
			'mounts the docker socket (/var/run/docker.sock:/var/run/docker.sock)',
		]);
	});
});
