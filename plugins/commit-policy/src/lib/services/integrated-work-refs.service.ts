/**
 * A work ref ends when its work is integrated.
 *
 * Nothing used to remove one. In an adopter project every slice left a
 * ref on the remote, while the agent committed the same changes straight
 * to the integration branch as separate commits; the graph filled with
 * refs whose work was long merged. A ref is removed here only on proof:
 * its tip is an ancestor of the integration head, or every path it
 * changed already has the same content there. Anything else stays, so
 * unintegrated work is never lost.
 */
import type { IGitRunner } from '@delendai/core/public';

import type {
	IReapIntegratedWorkRefsInput,
	IReapIntegratedWorkRefsResult,
} from '../contracts/interfaces/integrated-work-refs.interface';

const qualify = (prefix: string): string =>
	prefix.startsWith('refs/') ? prefix : `refs/${prefix}`;

const lines = (output: string): string[] =>
	output
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

/** True only when git proves the tip's changes are in the integration head. */
export const isWorkIntegrated = async (
	run: IGitRunner,
	tip: string,
	integrationSha: string,
): Promise<boolean> => {
	const ancestor = await run([
		'merge-base',
		'--is-ancestor',
		tip,
		integrationSha,
	]);
	if (ancestor.ok) return true;
	const base = await run(['merge-base', tip, integrationSha]);
	if (!base.ok || base.output.trim() === '') return false;
	const changed = await run(['diff', '--name-only', base.output.trim(), tip]);
	if (!changed.ok) return false;
	const paths = lines(changed.output);
	if (paths.length === 0) return false;
	const same = await run([
		'diff',
		'--quiet',
		tip,
		integrationSha,
		'--',
		...paths,
	]);
	return same.ok;
};

const localWorkRefs = async (
	run: IGitRunner,
	namespace: string,
): Promise<Array<{ ref: string; sha: string }>> => {
	const listed = await run([
		'for-each-ref',
		'--format=%(refname) %(objectname)',
		namespace,
	]);
	if (!listed.ok) return [];
	return lines(listed.output).flatMap((line) => {
		const [ref, sha] = line.split(' ');
		return ref !== undefined && sha !== undefined ? [{ ref, sha }] : [];
	});
};

const remoteWorkRefs = async (
	run: IGitRunner,
	remote: string,
	namespace: string,
): Promise<Array<{ ref: string; sha: string }>> => {
	const listed = await run(['ls-remote', remote, `${namespace}*`]);
	if (!listed.ok) return [];
	return lines(listed.output).flatMap((line) => {
		const [sha, ref] = line.split(/\s+/u);
		return ref !== undefined && sha !== undefined ? [{ ref, sha }] : [];
	});
};

const objectKnown = async (run: IGitRunner, sha: string): Promise<boolean> =>
	(await run(['cat-file', '-e', `${sha}^{commit}`])).ok;

/**
 * Remove every work ref whose work is integrated, locally and on the
 * remote. A remote ref is judged only when its commit is known locally:
 * one this machine cannot read is left for its owner.
 */
export const reapIntegratedWorkRefs = async (
	input: IReapIntegratedWorkRefsInput,
): Promise<IReapIntegratedWorkRefsResult> => {
	const namespace = qualify(input.workRefPrefix);
	const keep = new Set(input.keep);
	const removedLocal: string[] = [];
	const removedRemote: string[] = [];
	const failures: string[] = [];

	for (const { ref, sha } of await localWorkRefs(input.run, namespace)) {
		if (keep.has(ref)) continue;
		if (!(await isWorkIntegrated(input.run, sha, input.integrationSha)))
			continue;
		// The expected old value makes this a no-op if the ref moved.
		const deleted = await input.run(['update-ref', '-d', ref, sha]);
		if (deleted.ok) removedLocal.push(ref);
		else failures.push(`${ref}: ${deleted.reason ?? 'update-ref failed'}`);
	}

	if (input.remote !== undefined) {
		for (const { ref, sha } of await remoteWorkRefs(
			input.run,
			input.remote,
			namespace,
		)) {
			if (keep.has(ref)) continue;
			if (!(await objectKnown(input.run, sha))) continue;
			if (!(await isWorkIntegrated(input.run, sha, input.integrationSha)))
				continue;
			// A lease on the observed value: a ref someone moved since is kept.
			const deleted = await input.run([
				'push',
				'--porcelain',
				`--force-with-lease=${ref}:${sha}`,
				input.remote,
				`:${ref}`,
			]);
			if (deleted.ok) removedRemote.push(ref);
			else
				failures.push(
					`${input.remote} ${ref}: ${deleted.reason ?? 'push --delete failed'}`,
				);
		}
	}

	return { removedLocal, removedRemote, failures };
};
