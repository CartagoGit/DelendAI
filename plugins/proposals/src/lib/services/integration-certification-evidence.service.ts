/**
 * integration-certification-evidence.service.ts — delivered work that the
 * integration branch's full run certified is validated.
 *
 * Closing a proposal needed a green local `bun run validate` from the
 * last day, in the checkout doing the close. In a project whose work
 * reaches the integration branch through pull requests, that is the
 * weaker of two proofs: the work already landed, and the integration
 * branch's full CI run certified the tree it landed in. It is also one a
 * reviewer cannot produce: 128 steps in a fresh worktree fail on what the
 * worktree lacks (built packages, generated files), not on the work. On
 * 2026-09-26 no proposal could be closed; the newest local run on record
 * was a failure from five days earlier.
 *
 * So the certification the owner machine records is accepted too, on three
 * conditions: the NEWEST recorded certification is green (an older green
 * one cannot vouch for a tree that has since gone red), it is of the
 * integration branch's CURRENT commit (a record of an earlier tip says
 * nothing about a merge not certified yet), and it contains every commit
 * the proposal shipped in.
 */
import { basename, dirname, join } from 'node:path';

import { SafeWorkspaceReader, sharedCheckout } from '@delendai/core/public';

import { INTEGRATION_CERTIFICATION_LOG_RELATIVE_PATH } from '../contracts/constants/proposal-paths.constant';
import type { IGitRunner } from '../shared/git-runner';
import type { IValidateEvidence } from './transition-evidence';

interface ICertificationRecord {
	readonly sha: string;
	readonly state: string;
	readonly timestamp: string;
}

const parseRecords = (text: string): readonly ICertificationRecord[] =>
	text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.flatMap((line) => {
			try {
				const parsed = JSON.parse(
					line,
				) as Partial<ICertificationRecord>;
				return typeof parsed.sha === 'string' &&
					typeof parsed.state === 'string' &&
					typeof parsed.timestamp === 'string'
					? [parsed as ICertificationRecord]
					: [];
			} catch {
				return [];
			}
		});

/** The certification log's path, shared by every worktree of the clone. */
export const integrationCertificationLogPath = (
	workspaceRoot: string,
): string =>
	join(
		sharedCheckout(workspaceRoot) ?? workspaceRoot,
		INTEGRATION_CERTIFICATION_LOG_RELATIVE_PATH,
	);

export const resolveIntegrationCertificationEvidence = async (input: {
	readonly workspaceRoot: string;
	/** The commits the proposal shipped in (its `shipped-in`). */
	readonly shas: readonly string[];
	readonly git: IGitRunner;
	/**
	 * The integration branch's current commit. The newest certification
	 * must be of THIS commit: a record of an earlier tip says nothing about
	 * a branch that has moved since and may not be certified yet.
	 */
	readonly integrationTip: string | undefined;
	/** Injectable for tests; reads the log by default. */
	readonly read?: (path: string) => Promise<string | undefined>;
}): Promise<IValidateEvidence | null> => {
	// No tip, no evidence: "not known yet" is the answer a closing gate
	// gives, never "the last thing seen was green".
	if (input.shas.length === 0 || input.integrationTip === undefined) {
		return null;
	}
	const logPath = integrationCertificationLogPath(input.workspaceRoot);
	const read =
		input.read ??
		((path: string) =>
			new SafeWorkspaceReader(dirname(path))
				.readText(basename(path))
				.then((value) => value.content)
				.catch(() => undefined));
	const newest = parseRecords((await read(logPath)) ?? '').at(-1);
	if (
		newest === undefined ||
		newest.state !== 'certified' ||
		newest.sha !== input.integrationTip
	) {
		return null;
	}
	for (const sha of input.shas) {
		const contained = await input.git([
			'merge-base',
			'--is-ancestor',
			sha,
			newest.sha,
		]);
		if (!contained.ok) return null;
	}
	return {
		timestamp: newest.timestamp,
		exitCode: 0,
		logPath,
		scope: 'global',
	};
};
