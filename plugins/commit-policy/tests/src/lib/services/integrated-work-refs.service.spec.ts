/**
 * The reaper's refusals. Deleting a work ref is only safe on proof, so
 * every git answer short of proof — a failed listing, merge-base or diff,
 * a refused delete, an unknown remote commit — must leave the ref alone
 * and, where something was attempted, say so.
 */
import { describe, expect, it } from 'vitest';

import type { IGitRunner, IGitRunResult } from '@delendai/core/public';

import {
	isWorkIntegrated,
	reapIntegratedWorkRefs,
} from '../../../../src/lib/services/integrated-work-refs.service';

type Answer = IGitRunResult | ((args: readonly string[]) => IGitRunResult);

/** A runner that answers by the git subcommand, recording every call. */
const scripted = (answers: Readonly<Record<string, Answer>>) => {
	const calls: string[][] = [];
	const run: IGitRunner = async (args) => {
		calls.push([...args]);
		const answer = answers[args[0] ?? ''];
		if (answer === undefined)
			return { ok: false, output: '', reason: 'unscripted' };
		return typeof answer === 'function' ? answer(args) : answer;
	};
	return { run, calls };
};

const ok = (output = ''): IGitRunResult => ({ ok: true, output });
const fail = (reason?: string): IGitRunResult => ({
	ok: false,
	output: '',
	...(reason !== undefined ? { reason } : {}),
});

describe('isWorkIntegrated never guesses', () => {
	it('is false when merge-base cannot be found', async () => {
		const { run } = scripted({ 'merge-base': fail() });
		expect(await isWorkIntegrated(run, 'tip', 'head')).toBe(false);
	});

	it('is false when the changed paths cannot be listed', async () => {
		const { run } = scripted({
			'merge-base': (args) =>
				args[1] === '--is-ancestor' ? fail() : ok('base\n'),
			diff: fail(),
		});
		expect(await isWorkIntegrated(run, 'tip', 'head')).toBe(false);
	});

	it('is false when the tip changed nothing it could prove', async () => {
		const { run } = scripted({
			'merge-base': (args) =>
				args[1] === '--is-ancestor' ? fail() : ok('base\n'),
			diff: ok(''),
		});
		expect(await isWorkIntegrated(run, 'tip', 'head')).toBe(false);
	});

	it('is false when merge-base answers nothing', async () => {
		const { run } = scripted({
			'merge-base': (args) =>
				args[1] === '--is-ancestor' ? fail() : ok(''),
		});
		expect(await isWorkIntegrated(run, 'tip', 'head')).toBe(false);
	});
});

describe('reapIntegratedWorkRefs', () => {
	const integrated: Answer = ok();

	it('keeps the protected ref, and reports a refused local delete', async () => {
		const { run, calls } = scripted({
			'for-each-ref': ok(
				'refs/heads/wip/a/x-S1-g1-t sha1\nrefs/heads/wip/a/x-S2-g1-t sha2\nmalformed\n',
			),
			'merge-base': integrated,
			'update-ref': fail('locked'),
		});
		const result = await reapIntegratedWorkRefs({
			run,
			workRefPrefix: 'heads/wip/',
			integrationSha: 'head',
			keep: ['refs/heads/wip/a/x-S1-g1-t'],
		});
		expect(result.removedLocal).toEqual([]);
		expect(result.failures).toEqual(['refs/heads/wip/a/x-S2-g1-t: locked']);
		// Only the unprotected ref was ever judged or deleted.
		expect(calls.filter((c) => c[0] === 'update-ref')).toEqual([
			['update-ref', '-d', 'refs/heads/wip/a/x-S2-g1-t', 'sha2'],
		]);
	});

	it('names a failure even when git gives no reason', async () => {
		const { run } = scripted({
			'for-each-ref': ok('refs/heads/wip/a/x sha1\n'),
			'merge-base': integrated,
			'update-ref': fail(),
		});
		const result = await reapIntegratedWorkRefs({
			run,
			workRefPrefix: 'refs/heads/wip/',
			integrationSha: 'head',
			keep: [],
		});
		expect(result.failures).toEqual([
			'refs/heads/wip/a/x: update-ref failed',
		]);
	});

	it('does nothing when the refs cannot be listed', async () => {
		const { run, calls } = scripted({
			'for-each-ref': fail(),
			'ls-remote': fail(),
		});
		const result = await reapIntegratedWorkRefs({
			run,
			workRefPrefix: 'heads/wip/',
			integrationSha: 'head',
			remote: 'origin',
			keep: [],
		});
		expect(result).toEqual({
			removedLocal: [],
			removedRemote: [],
			failures: [],
		});
		expect(calls.map((c) => c[0])).toEqual(['for-each-ref', 'ls-remote']);
	});

	it('leaves remote refs it cannot read, cannot prove, or may not touch', async () => {
		const { run, calls } = scripted({
			'for-each-ref': ok(''),
			'ls-remote': ok(
				[
					'sha-kept\trefs/heads/wip/a/kept',
					'sha-unknown\trefs/heads/wip/b/unknown',
					'sha-live\trefs/heads/wip/c/live',
					'sha-done\trefs/heads/wip/d/done',
					'garbage',
				].join('\n'),
			),
			'cat-file': (args) =>
				args[2] === 'sha-unknown^{commit}' ? fail() : ok(),
			'merge-base': (args) =>
				args[2] === 'sha-live'
					? args[1] === '--is-ancestor'
						? fail()
						: ok('base')
					: ok(),
			diff: (args) => (args[1] === '--name-only' ? ok('f.ts\n') : fail()),
			push: fail('stale info'),
		});
		const result = await reapIntegratedWorkRefs({
			run,
			workRefPrefix: 'heads/wip/',
			integrationSha: 'head',
			remote: 'origin',
			keep: ['refs/heads/wip/a/kept'],
		});
		expect(result.removedRemote).toEqual([]);
		expect(result.failures).toEqual([
			'origin refs/heads/wip/d/done: stale info',
		]);
		const pushes = calls.filter((c) => c[0] === 'push');
		expect(pushes).toEqual([
			[
				'push',
				'--porcelain',
				'--force-with-lease=refs/heads/wip/d/done:sha-done',
				'origin',
				':refs/heads/wip/d/done',
			],
		]);
	});

	it('removes an integrated remote ref, and names a reasonless failure', async () => {
		const removing = scripted({
			'for-each-ref': ok(''),
			'ls-remote': ok('sha\trefs/heads/wip/a/done'),
			'cat-file': ok(),
			'merge-base': integrated,
			push: ok(),
		});
		expect(
			(
				await reapIntegratedWorkRefs({
					run: removing.run,
					workRefPrefix: 'heads/wip/',
					integrationSha: 'head',
					remote: 'origin',
					keep: [],
				})
			).removedRemote,
		).toEqual(['refs/heads/wip/a/done']);
		const refused = scripted({
			'for-each-ref': ok(''),
			'ls-remote': ok('sha\trefs/heads/wip/a/done'),
			'cat-file': ok(),
			'merge-base': integrated,
			push: fail(),
		});
		expect(
			(
				await reapIntegratedWorkRefs({
					run: refused.run,
					workRefPrefix: 'heads/wip/',
					integrationSha: 'head',
					remote: 'origin',
					keep: [],
				})
			).failures,
		).toEqual(['origin refs/heads/wip/a/done: push --delete failed']);
	});
});
