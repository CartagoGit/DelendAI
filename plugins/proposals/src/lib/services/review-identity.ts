import { mkdir } from 'node:fs/promises';
import { hostname as readHostname } from 'node:os';
import { basename, dirname, join } from 'node:path';

import {
	SafeWorkspaceReader,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

export interface IReviewIdentity {
	readonly host: string;
	readonly pid: number;
	readonly agent: string;
}

export interface IReviewIdentityRecord {
	readonly proposalId: string;
	readonly sliceId: string;
	readonly host: string;
	readonly pid: number;
	readonly agent: string;
	readonly ts: string;
}

export interface IReviewIdentityDeps {
	readonly appendLine: (path: string, line: string) => Promise<void>;
	readonly ensureDir: (path: string) => Promise<void>;
	readonly readText: (path: string) => Promise<string>;
	readonly now: () => string;
	readonly hostname: () => string;
	readonly pid: () => number;
	readonly envHost?: () => string | undefined;
	readonly withLock?: <T>(path: string, work: () => Promise<T>) => Promise<T>;
}

export type IApproveIdentityCheckResult =
	| { ok: true; submitter: IReviewIdentityRecord }
	| {
			ok: false;
			reason: 'missing-submit-identity' | 'self-approve';
			nextAction: string;
			submitter?: IReviewIdentityRecord;
	  };

export const REVIEW_IDENTITY_RELATIVE_PATH = join(
	'.cache',
	'mcp-vertex',
	'review-identity.jsonl',
);

const parseIdentityLine = (line: string): IReviewIdentityRecord | null => {
	if (line.trim() === '') return null;
	try {
		const value = JSON.parse(line) as Partial<IReviewIdentityRecord>;
		if (
			typeof value.proposalId !== 'string' ||
			typeof value.sliceId !== 'string' ||
			typeof value.host !== 'string' ||
			typeof value.pid !== 'number' ||
			typeof value.agent !== 'string' ||
			typeof value.ts !== 'string'
		) {
			return null;
		}
		return {
			proposalId: value.proposalId,
			sliceId: value.sliceId,
			host: value.host,
			pid: value.pid,
			agent: value.agent,
			ts: value.ts,
		};
	} catch {
		return null;
	}
};

export const createReviewIdentityDeps = (): IReviewIdentityDeps => {
	return {
		appendLine: async (path, line) => {
			const existing = await new SafeWorkspaceReader(dirname(path))
				.readText(basename(path))
				.then((value) => value.content)
				.catch((error: unknown) => {
					if (
						error &&
						typeof error === 'object' &&
						'code' in error &&
						error.code === 'ENOENT'
					) {
						return '';
					}
					throw error;
				});
			const prefix =
				existing === '' || existing.endsWith('\n')
					? existing
					: `${existing}\n`;
			await writeFileAtomic(path, `${prefix}${line}\n`);
		},
		ensureDir: async (path) => {
			await mkdir(path, { recursive: true });
		},
		readText: async (path) =>
			new SafeWorkspaceReader(dirname(path))
				.readText(basename(path))
				.then((value) => value.content)
				.catch((error: unknown) => {
					if (
						error &&
						typeof error === 'object' &&
						'code' in error &&
						error.code === 'ENOENT'
					) {
						return '';
					}
					throw error;
				}),
		now: () => new Date().toISOString(),
		hostname: () => readHostname(),
		pid: () => process.pid,
		envHost: () => process.env.MCP_HOST,
		withLock: async (path, work) => withFileMutex(path, work),
	};
};

export const buildReviewIdentity = (
	agent: string,
	deps: Pick<IReviewIdentityDeps, 'hostname' | 'pid' | 'envHost'>,
): IReviewIdentity => ({
	host: deps.envHost?.()?.trim() || deps.hostname(),
	pid: deps.pid(),
	agent: agent.trim(),
});

export const recordReviewSubmitIdentity = async (input: {
	readonly workspaceRoot: string;
	readonly proposalId: string;
	readonly sliceId: string;
	readonly agent: string;
	readonly deps?: IReviewIdentityDeps;
}): Promise<IReviewIdentityRecord> => {
	const deps = input.deps ?? createReviewIdentityDeps();
	const path = join(input.workspaceRoot, REVIEW_IDENTITY_RELATIVE_PATH);
	const identity = buildReviewIdentity(input.agent, deps);
	const record: IReviewIdentityRecord = {
		proposalId: input.proposalId,
		sliceId: input.sliceId,
		...identity,
		ts: deps.now(),
	};
	await deps.ensureDir(dirname(path));
	const write = async () => {
		await deps.appendLine(path, JSON.stringify(record));
	};
	if (deps.withLock !== undefined) {
		await deps.withLock(path, write);
	} else {
		await write();
	}
	return record;
};

export const readLatestSubmitIdentity = async (input: {
	readonly workspaceRoot: string;
	readonly proposalId: string;
	readonly sliceId: string;
	readonly deps?: IReviewIdentityDeps;
}): Promise<IReviewIdentityRecord | null> => {
	const deps = input.deps ?? createReviewIdentityDeps();
	const path = join(input.workspaceRoot, REVIEW_IDENTITY_RELATIVE_PATH);
	const raw = await deps.readText(path);
	if (raw.trim() === '') return null;
	const matches = raw
		.split(/\r?\n/)
		.map(parseIdentityLine)
		.filter((entry): entry is IReviewIdentityRecord => entry !== null)
		.filter(
			(entry) =>
				entry.proposalId === input.proposalId &&
				entry.sliceId === input.sliceId,
		);
	return matches.at(-1) ?? null;
};

export const checkApproveIdentity = async (input: {
	readonly workspaceRoot: string;
	readonly proposalId: string;
	readonly sliceId: string;
	readonly approver: IReviewIdentity;
	readonly deps?: IReviewIdentityDeps;
}): Promise<IApproveIdentityCheckResult> => {
	const submitter = await readLatestSubmitIdentity(input);
	if (submitter === null) {
		// Moving a proposal into `review/` does not by itself open a
		// review round, so a reviewer arriving straight afterwards finds
		// nothing to approve. The reviewer cannot fix this alone either —
		// submitting under its own name would make it the implementer and
		// then bar it from approving. Naming the exact command, and whose
		// it is, is the difference between an agent handing the round back
		// and an agent stalling on a refusal it cannot act on.
		return {
			ok: false,
			reason: 'missing-submit-identity',
			nextAction:
				`no review round is open for ${input.proposalId} ${input.sliceId}. The IMPLEMENTER (not you, the reviewer) must open it first: ` +
				`mcp-vertex_proposal_review { action: "submit", proposalId: "${input.proposalId}", sliceId: "${input.sliceId}", agent: "<implementer>", note: "<what was built>" } ` +
				`— or from a terminal: bun tools/scripts/review/proposal-review.script.ts --id=${input.proposalId} --slice=${input.sliceId} --agent=<implementer> --action=submit --note="<what was built>". ` +
				'Then retry this approve as a different agent.',
		};
	}
	// f00157-fix: independence is keyed on the AGENT, not the process. A
	// single-host orchestration hands the review to a differently-named
	// agent (a subagent), which must count as a legitimate peer. Only a
	// self-approval (the same agent that submitted the slice) is refused.
	const sameAgent =
		submitter.agent.trim().toLowerCase() ===
		input.approver.agent.trim().toLowerCase();
	if (sameAgent) {
		return {
			ok: false,
			reason: 'self-approve',
			nextAction: `"${input.approver.agent}" submitted this slice, so it cannot also approve it. A DIFFERENT agent must run approve for ${input.proposalId} ${input.sliceId} — hand the round to a reviewer rather than renaming yourself, which is the same self-approval the gate exists to refuse.`,
			submitter,
		};
	}
	return { ok: true, submitter };
};
