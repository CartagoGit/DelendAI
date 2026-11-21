/**
 * init-hosts-flag.spec.ts — `init --hosts` names the project's hosts, and
 * the choice is written into the configuration.
 */
import { describe, expect, it } from 'vitest';

import { parseJsonc } from '@delendai/core/cli';

import { InitAnswers } from '../../lib/init/init-answers.schema';
import { renderInitBundle } from '../../lib/init/init-render.service';
import { parseFlags } from './init.command';

describe('init --hosts', () => {
	it('reads the hosts, trimmed, and leaves them out when not given', () => {
		expect(parseFlags(['--hosts=cursor, opencode,']).hosts).toEqual([
			'cursor',
			'opencode',
		]);
		expect(parseFlags(['--force']).hosts).toBeUndefined();
	});

	it('writes the declared hosts into delendai.config.json, and agents only for them', async () => {
		const bundle = await renderInitBundle(
			InitAnswers.parse({
				workspaceRoot: '/tmp/hosts-flag-ws',
				hosts: ['opencode'],
			}),
		);
		const config = parseJsonc(
			bundle.files.find((file) => file.relPath === 'delendai.config.json')
				?.content ?? '{}',
		).value as { hosts?: readonly string[] };
		expect(config.hosts).toEqual(['opencode']);
		const agents = bundle.files.filter((file) =>
			/^\.(github|claude|codex|opencode)\/agents?\//u.test(file.relPath),
		);
		expect(agents.length).toBeGreaterThan(0);
		expect(
			agents.every((file) => file.relPath.startsWith('.opencode/agent/')),
		).toBe(true);
	});
});
