import { DURABILITY_REMOTE_MISSING } from '../contracts/constants/durability-remote.constant';
import { resolveDurabilityRemote } from '../persistence/durability-remote.service';

import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';
import type { IWipEngine } from '../contracts/interfaces/work-ref-tool.interface';
import { integrationBase, runOutput } from './work-ref-repo.service';

export const verifyCheckpoint = async (
	engine: IWipEngine,
	ref: string,
	commit: string,
): Promise<boolean> =>
	(await runOutput(engine.context.run, [
		'rev-parse',
		'--verify',
		`${ref}^{}`,
	])) === commit;

export const publishCheckpoint = async (
	engine: IWipEngine,
	policy: IResolvedDevelopmentPolicy,
	remoteOption: string | undefined,
	ref: string,
	commit: string,
	expectedOld: string | undefined,
): Promise<{ readonly published: boolean; readonly remote: string }> => {
	if (!policy.persistence.autoPushAfterCommit)
		return { published: false, remote: '' };
	const remote = await resolveDurabilityRemote(
		engine.context.run,
		remoteOption,
	);
	if (remote === undefined) throw new Error(DURABILITY_REMOTE_MISSING);
	const before = await engine.context.run(['ls-remote', remote, ref]);
	if (!before.ok)
		throw new Error(before.reason ?? `could not inspect ${remote}/${ref}`);
	const remoteSha = before.output.trim().split(/\s+/u)[0] || undefined;
	if (remoteSha === commit) return { published: true, remote };
	if (remoteSha !== undefined && remoteSha !== expectedOld)
		throw new Error(
			`remote work ref ${ref} moved concurrently (expected ${expectedOld ?? 'absence'}, found ${remoteSha})`,
		);
	// Push the immutable commit id, not the local ref name. A concurrent
	// hydration fetch is allowed to refresh refs/wip/* and may prune a
	// just-created local ref before this process reaches the network; the
	// object id remains valid and is the exact object we verified above.
	const pushed = await engine.context.run([
		'push',
		'--porcelain',
		`--force-with-lease=${ref}:${remoteSha ?? ''}`,
		remote,
		`${commit}:${ref}`,
	]);
	if (!pushed.ok)
		throw new Error(
			`could not publish durable work ref ${ref}: ${pushed.reason ?? 'git push failed'}`,
		);
	const observed = await engine.context.run([
		'ls-remote',
		'--exit-code',
		remote,
		ref,
	]);
	const observedSha = observed.ok
		? observed.output.trim().split(/\s+/u)[0]
		: undefined;
	if (observedSha !== commit)
		throw new Error(
			`published work ref ${ref} could not be verified at ${remote}`,
		);
	return { published: true, remote };
};

export const recoverCheckpoint = async (
	engine: IWipEngine,
	policy: IResolvedDevelopmentPolicy,
	remote: string | undefined,
	ref: string,
	commit: string,
	paths: readonly string[],
): Promise<{ readonly published: boolean; readonly remote: string }> => {
	const objectType = await runOutput(engine.context.run, [
		'cat-file',
		'-t',
		commit,
	]);
	if (objectType !== 'commit')
		throw new Error(`recovery object ${commit} is not a commit`);
	const baseSha = await integrationBase(engine, policy);
	if (baseSha === undefined)
		throw new Error('the integration base could not be resolved');
	const parents = await runOutput(engine.context.run, [
		'rev-list',
		'--parents',
		'-n',
		'1',
		commit,
	]);
	if (parents !== `${commit} ${baseSha}`)
		throw new Error(
			`recovery commit ${commit} is not a single-parent checkpoint on ${baseSha}`,
		);
	const raw = await runOutput(engine.context.run, ['cat-file', '-p', commit]);
	const recordedScope = (raw ?? '')
		.split(/\r?\n/u)
		.filter((line) => line.startsWith('Delendai-Wip-Scope: '))
		.map((line) => line.slice('Delendai-Wip-Scope: '.length))
		.sort();
	const expectedScope = [...paths].sort();
	if (
		recordedScope.length !== expectedScope.length ||
		recordedScope.some((path, index) => path !== expectedScope[index])
	)
		throw new Error(
			`recovery scope does not match the checkpoint metadata in ${commit}`,
		);
	const current = await runOutput(engine.context.run, [
		'rev-parse',
		'--verify',
		`${ref}^{}`,
	]);
	if (current !== undefined && current !== commit)
		throw new Error(`ref ${ref} already points to a different commit`);
	const updated = await engine.context.run([
		'update-ref',
		ref,
		commit,
		current ?? '',
	]);
	if (!updated.ok)
		throw new Error(
			`could not restore local ref ${ref}: ${updated.reason ?? 'git update-ref failed'}`,
		);
	if (!(await verifyCheckpoint(engine, ref, commit)))
		throw new Error(
			`local ref ${ref} did not retain recovered commit ${commit}`,
		);
	return publishCheckpoint(engine, policy, remote, ref, commit, current);
};
