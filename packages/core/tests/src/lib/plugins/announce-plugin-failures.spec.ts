import { describe, expect, it } from 'vitest';

import {
	announcePluginFailures,
	asRegisterErrorInfo,
	buildPluginFailureAnnouncement,
} from '../../../../src/lib/plugins/announce-plugin-failures';

describe('buildPluginFailureAnnouncement', () => {
	it('says nothing when every plugin loaded', () => {
		const announcement = buildPluginFailureAnnouncement({
			loadErrors: [],
			registerErrors: [],
			loadedCount: 12,
		});
		expect(announcement.lines).toEqual([]);
		expect(announcement.failedCount).toBe(0);
	});

	it('names the plugin and the reason for a load failure', () => {
		const announcement = buildPluginFailureAnnouncement({
			loadErrors: [
				{
					specifier: 'github',
					message: 'missing token in GITHUB_TOKEN',
				},
			],
			registerErrors: [],
			loadedCount: 11,
		});
		expect(announcement.failedCount).toBe(1);
		expect(announcement.lines[0]).toContain('github');
		expect(announcement.lines[0]).toContain('missing token');
	});

	it('names the phase for a register failure', () => {
		const announcement = buildPluginFailureAnnouncement({
			loadErrors: [],
			registerErrors: [
				{
					pluginName: 'gitlab',
					resolvedSpecifier: '@mcp-vertex/gitlab',
					phase: 'register',
					error: new Error('boom'),
				},
			],
			loadedCount: 11,
		});
		expect(announcement.lines[0]).toContain('gitlab');
		expect(announcement.lines[0]).toContain('register');
		expect(announcement.lines[0]).toContain('boom');
	});

	it('states that the server started anyway, and that the gap is not work', () => {
		// Without this an operator cannot tell a degraded start from a fatal
		// one, and an agent cannot tell whether to keep going or to "fix"
		// the missing tools.
		const announcement = buildPluginFailureAnnouncement({
			loadErrors: [{ specifier: 'github', message: 'no token' }],
			registerErrors: [],
			loadedCount: 11,
		});
		const closing = announcement.lines.at(-1) ?? '';
		expect(closing).toContain('started anyway');
		expect(closing).toContain('11 working plugin(s)');
		expect(closing).toContain('do not retry');
	});

	it('counts load and register failures together', () => {
		const announcement = buildPluginFailureAnnouncement({
			loadErrors: [{ specifier: 'a', message: 'x' }],
			registerErrors: [
				{
					pluginName: 'b',
					resolvedSpecifier: 'b',
					phase: 'register',
					error: 'y',
				},
			],
			loadedCount: 3,
		});
		expect(announcement.failedCount).toBe(2);
	});
});

describe('announcePluginFailures', () => {
	it('writes every line through the injected writer', () => {
		const written: string[] = [];
		announcePluginFailures(
			buildPluginFailureAnnouncement({
				loadErrors: [{ specifier: 'github', message: 'no token' }],
				registerErrors: [],
				loadedCount: 1,
			}),
			(line) => written.push(line),
		);
		expect(written).toHaveLength(2);
		expect(written[0]?.endsWith('\n')).toBe(true);
	});

	it('never throws when the writer does', () => {
		// A failure to report a failure must not become a third failure
		// that stops the server.
		expect(() =>
			announcePluginFailures(
				buildPluginFailureAnnouncement({
					loadErrors: [{ specifier: 'a', message: 'x' }],
					registerErrors: [],
					loadedCount: 0,
				}),
				() => {
					throw new Error('stderr is closed');
				},
			),
		).not.toThrow();
	});
});

describe('asRegisterErrorInfo', () => {
	it('lets a load failure reach the onRegisterError observers', () => {
		// A plugin that could not be resolved never reaches `register()`, so
		// it produced no register-error info and was invisible to every
		// observer — including the error-reporting plugin.
		const info = asRegisterErrorInfo({
			specifier: '@mcp-vertex/github',
			message: 'could not load plugin',
		});
		expect(info.pluginName).toBe('@mcp-vertex/github');
		expect(info.phase).toBe('register');
		expect((info.error as Error).message).toBe('could not load plugin');
	});
});
