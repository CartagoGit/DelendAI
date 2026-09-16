/**
 * work-ref.tool.ts — `commit_policy_work_ref`.
 *
 * The shared-checkout-pr model has one safe persistence primitive: a WIP ref
 * built by the core WIP engine. This tool is the host-neutral bridge to that
 * primitive. It deliberately accepts only policy-derived ref identities and
 * never exposes a branch, checkout or generic git command escape hatch.
 */

import { execFile } from 'node:child_process';
import {
	chmod,
	lstat,
	mkdir,
	readdir,
	readFile,
	rm,
	symlink,
	unlink,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { validateScopePaths } from '@delendai/core/plugin';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';

import {
	anchorFromPolicy,
	anchorRefusal,
	compactOutputSchema,
	type createWipEngine,
	observeAnchor,
	resolveWorkRef,
	type IResolvedDevelopmentPolicy,
	type IToolRegistration,
	toolError,
	toolOk,
	writeFileAtomic,
} from '@delendai/core/public';

type IWipEngine = NonNullable<Awaited<ReturnType<typeof createWipEngine>>>;

const ID = z.string().trim().min(1).max(200);
const PATH = z.string().trim().min(1).max(1000);

const InputSchema = z
	.object({
		action: z.enum(['checkpoint', 'materialize', 'recover']),
		proposal: ID,
		slice: ID,
		generation: z.number().int().positive().max(1_000_000),
		paths: z.array(PATH).min(1).max(10_000),
		message: z.string().trim().min(1).max(20_000).optional(),
		commit: z
			.string()
			.regex(/^[0-9a-f]{40,64}$/u)
			.optional(),
		cleanAfterCheckpoint: z.boolean().optional(),
	})
	.strict()
	.superRefine((value, context) => {
		if (value.action === 'checkpoint' && value.message === undefined) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['message'],
				message: 'message is required for checkpoint',
			});
		}
		if (
			value.action !== 'checkpoint' &&
			value.cleanAfterCheckpoint === true
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['cleanAfterCheckpoint'],
				message: 'cleanAfterCheckpoint is valid only for checkpoint',
			});
		}
		if (value.action === 'recover' && value.commit === undefined) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['commit'],
				message: 'commit is required for recovery',
			});
		}
	});

type WorkRefInput = z.infer<typeof InputSchema>;

export interface IWorkRefToolOptions {
	readonly namespacePrefix: string;
	readonly policy: IResolvedDevelopmentPolicy | undefined;
	readonly wip: IWipEngine | undefined;
	/** Host-resolved identity; callers cannot select another agent's ref. */
	readonly agentId: string;
	/** Explicit policy-configured remote; never guess from remote ordering. */
	readonly remote?: string | undefined;
}

interface IRepoSnapshot {
	readonly head: string | undefined;
	readonly branch: string | undefined;
	readonly index: Uint8Array | null;
}

interface IBaseEntry {
	readonly mode: string;
	readonly type: string;
}

interface ICleanPlan {
	readonly path: string;
	readonly entry: IBaseEntry | undefined;
	readonly blob: Uint8Array | undefined;
}

const runOutput = async (
	run: IWipEngine['context']['run'],
	args: readonly string[],
): Promise<string | undefined> => {
	const result = await run(args);
	return result.ok ? result.output.trim() : undefined;
};

const readIndex = async (
	root: string,
	run: IWipEngine['context']['run'],
): Promise<Uint8Array | null> => {
	const indexPath = await runOutput(run, [
		'rev-parse',
		'--git-path',
		'index',
	]);
	if (indexPath === undefined || indexPath.length === 0) return null;
	try {
		return await readFile(
			isAbsolute(indexPath) ? indexPath : resolve(root, indexPath),
		);
	} catch {
		return null;
	}
};

const snapshot = async (engine: IWipEngine): Promise<IRepoSnapshot> => ({
	head: await runOutput(engine.context.run, ['rev-parse', 'HEAD']),
	branch: await runOutput(engine.context.run, [
		'symbolic-ref',
		'--quiet',
		'--short',
		'HEAD',
	]),
	index: await readIndex(engine.context.root, engine.context.run),
});

const sameBytes = (
	left: Uint8Array | null,
	right: Uint8Array | null,
): boolean => {
	if (left === null || right === null) return left === right;
	if (left.byteLength !== right.byteLength) return false;
	for (let index = 0; index < left.byteLength; index += 1) {
		if (left[index] !== right[index]) return false;
	}
	return true;
};

const snapshotUnchanged = (
	before: IRepoSnapshot,
	after: IRepoSnapshot,
): boolean =>
	before.head === after.head &&
	before.branch === after.branch &&
	sameBytes(before.index, after.index);

const refusal = (reason: string, nextAction: string) =>
	toolError(reason, nextAction);

const validatePolicyAndRef = (
	options: IWorkRefToolOptions,
	input: WorkRefInput,
): { readonly ref: string } | { readonly reason: string } => {
	const policy = options.policy;
	if (policy === undefined) {
		return {
			reason: 'WORK_REF_POLICY_REQUIRED: no resolved development policy is available',
		};
	}
	if (
		!policy.persistence.usesWipRefs ||
		policy.persistence.strategy !== 'wip-ref'
	) {
		return {
			reason: `WORK_REF_POLICY_UNSUPPORTED: profile ${policy.profile} does not resolve to persistence.strategy=wip-ref`,
		};
	}
	if (!policy.persistence.exactScope) {
		return {
			reason: 'WORK_REF_POLICY_UNSUPPORTED: exact-scope persistence is required',
		};
	}
	const template = policy.branches.workRefTemplate;
	const prefix = policy.branches.workRefPrefix;
	if (template.length === 0 || prefix.length === 0) {
		return {
			reason: 'WORK_REF_POLICY_INVALID: workRefTemplate and workRefPrefix are required',
		};
	}
	const ref = resolveWorkRef(template, {
		agent: options.agentId,
		proposal: input.proposal,
		slice: input.slice,
		generation: input.generation,
	});
	const shortRef = ref.startsWith('refs/') ? ref.slice('refs/'.length) : ref;
	const normalizedPrefix = prefix.startsWith('refs/')
		? prefix.slice('refs/'.length)
		: prefix;
	const visible = policy.branches.workRefVisibility === 'visible';
	const integrationRef = `refs/heads/${policy.branches.integration}`;
	const releaseRef = `refs/heads/${policy.branches.release}`;
	const publicationPrefix = `refs/heads/${policy.branches.publicationRefPrefix}`;
	if (
		!/^refs\/[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(ref) ||
		ref.includes('..') ||
		ref.includes('@{') ||
		ref.includes('//') ||
		!shortRef.startsWith(normalizedPrefix) ||
		(visible
			? !ref.startsWith('refs/heads/')
			: ref.startsWith('refs/heads/')) ||
		ref === integrationRef ||
		ref === releaseRef ||
		ref.startsWith(publicationPrefix)
	) {
		return {
			reason: `WORK_REF_INVALID: resolved ref ${JSON.stringify(ref)} is outside the policy work namespace or overlaps a protected branch`,
		};
	}
	if (options.wip === undefined) {
		return {
			reason: 'WORK_REF_ENGINE_UNAVAILABLE: the WIP engine could not bind this repository',
		};
	}
	const expectedAnchor = anchorFromPolicy(policy);
	const boundAnchor = options.wip.context.anchor;
	if (
		boundAnchor.required !== expectedAnchor.required ||
		boundAnchor.branch !== expectedAnchor.branch
	) {
		return {
			reason: 'WORK_REF_ANCHOR_MISMATCH: the bound WIP engine does not match the resolved development policy',
		};
	}
	return { ref };
};

const integrationBase = async (
	engine: IWipEngine,
	policy: IResolvedDevelopmentPolicy,
): Promise<string | undefined> =>
	runOutput(engine.context.run, [
		'rev-parse',
		'--verify',
		`${policy.branches.integration}^{commit}`,
	]);

const readBaseEntry = async (
	run: IWipEngine['context']['run'],
	baseSha: string,
	path: string,
): Promise<IBaseEntry | undefined> => {
	const result = await run([
		'--literal-pathspecs',
		'ls-tree',
		'-z',
		baseSha,
		'--',
		path,
	]);
	if (!result.ok) return undefined;
	const line = result.output.split('\0')[0] ?? '';
	const match = /^(\d+)\s+(\w+)\s+[0-9a-f]+\t/u.exec(line);
	return match?.[1] !== undefined && match[2] !== undefined
		? { mode: match[1], type: match[2] }
		: undefined;
};

const readBaseBlob = async (
	root: string,
	baseSha: string,
	path: string,
): Promise<Uint8Array> =>
	new Promise((resolveBlob, rejectBlob) => {
		execFile(
			'git',
			['show', `${baseSha}:${path}`],
			{
				cwd: root,
				encoding: 'buffer',
				maxBuffer: 128 * 1024 * 1024,
			},
			(error, stdout) => {
				if (error !== null) {
					rejectBlob(error);
					return;
				}
				resolveBlob(stdout as Uint8Array);
			},
		);
	});

const removeDeclaredPath = async (absolute: string): Promise<boolean> => {
	let info: Awaited<ReturnType<typeof lstat>>;
	try {
		info = await lstat(absolute);
	} catch {
		return false;
	}
	if (info.isDirectory() && !info.isSymbolicLink()) {
		const children = await readdir(absolute);
		if (children.length > 0) {
			throw new Error(
				`refusing to remove non-empty directory ${absolute}`,
			);
		}
		await rm(absolute, { recursive: false });
		return true;
	}
	await unlink(absolute);
	return true;
};

const cleanToBase = async (
	engine: IWipEngine,
	baseSha: string,
	paths: readonly string[],
): Promise<{
	readonly cleaned: readonly string[];
	readonly deleted: readonly string[];
}> => {
	const plans: ICleanPlan[] = [];
	for (const path of paths) {
		await assertContainedParent(engine.context.root, path);
		const entry = await readBaseEntry(engine.context.run, baseSha, path);
		if (entry === undefined) {
			plans.push({ path, entry: undefined, blob: undefined });
			continue;
		}
		if (entry.type !== 'blob') {
			throw new Error(
				`cannot clean unsupported git tree entry ${path} (${entry.type})`,
			);
		}
		plans.push({
			path,
			entry,
			blob: await readBaseBlob(engine.context.root, baseSha, path),
		});
	}

	const cleaned: string[] = [];
	const deleted: string[] = [];
	for (const plan of plans) {
		const absolute = join(engine.context.root, plan.path);
		await assertContainedParent(engine.context.root, plan.path);
		if (plan.entry === undefined) {
			if (await removeDeclaredPath(absolute)) deleted.push(plan.path);
			continue;
		}
		let info: Awaited<ReturnType<typeof lstat>> | undefined;
		try {
			info = await lstat(absolute);
		} catch {
			info = undefined;
		}
		if (info?.isDirectory() && !info.isSymbolicLink()) {
			throw new Error(
				`refusing to replace directory ${plan.path} with a base file`,
			);
		}
		await mkdir(dirname(absolute), { recursive: true });
		if (info?.isSymbolicLink()) await unlink(absolute);
		if (plan.entry.mode === '120000') {
			await symlink(
				Buffer.from(plan.blob ?? []).toString('utf8'),
				absolute,
			);
		} else {
			// writeFileAtomic, not writeFile: a torn checkout file is a
			// worse failure than a slow one, and it takes `Uint8Array`
			// verbatim so a binary blob survives the round trip.
			await writeFileAtomic(absolute, plan.blob ?? new Uint8Array());
			await chmod(
				absolute,
				plan.entry.mode.endsWith('755') ? 0o755 : 0o644,
			);
		}
		cleaned.push(plan.path);
	}
	return { cleaned, deleted };
};

const verifyCheckpoint = async (
	engine: IWipEngine,
	ref: string,
	commit: string,
): Promise<boolean> =>
	(await runOutput(engine.context.run, [
		'rev-parse',
		'--verify',
		`${ref}^{}`,
	])) === commit;

const publishCheckpoint = async (
	engine: IWipEngine,
	policy: IResolvedDevelopmentPolicy,
	remoteOption: string | undefined,
	ref: string,
	commit: string,
	expectedOld: string | undefined,
): Promise<{ readonly published: boolean; readonly remote: string }> => {
	if (!policy.persistence.autoPushAfterCommit)
		return { published: false, remote: '' };
	const remote = remoteOption?.trim();
	if (remote === undefined || remote.length === 0)
		throw new Error(
			'policy requires autoPushAfterCommit but commit-policy push.remote is not configured',
		);
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

const recoverCheckpoint = async (
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

export const runCommitPolicyWorkRef = async (
	args: unknown,
	options: IWorkRefToolOptions,
): Promise<ReturnType<typeof toolOk> | ReturnType<typeof toolError>> => {
	const parsed = InputSchema.safeParse(args ?? {});
	if (!parsed.success)
		return refusal(
			`WORK_REF_INVALID_INPUT: ${parsed.error.message}`,
			'Provide action, identity fields and an exact path scope.',
		);
	const input = parsed.data;
	const policyResult = validatePolicyAndRef(options, input);
	if ('reason' in policyResult)
		return refusal(
			policyResult.reason,
			'Inspect the resolved development policy and bind the WIP engine before retrying.',
		);
	const engine = options.wip;
	if (engine === undefined)
		return refusal(
			'WORK_REF_ENGINE_UNAVAILABLE: no WIP engine is bound',
			'Run this tool in a git workspace with a WIP-ref development policy.',
		);
	const scopeValidation = validateScopePaths(input.paths);
	if (scopeValidation.invalid.length > 0)
		return refusal(
			`WORK_REF_INVALID_SCOPE: ${scopeValidation.invalid.map((entry) => `${entry.path} (${entry.reason})`).join(', ')}`,
			'Use repository-relative paths without traversal or .git.',
		);
	const validPaths = scopeValidation.valid;
	const before = await snapshot(engine);
	try {
		const policy = options.policy;
		if (policy === undefined)
			return refusal(
				'WORK_REF_POLICY_REQUIRED: no resolved development policy is available',
				'Bind the resolved development policy before retrying.',
			);
		const anchor = anchorRefusal(
			await observeAnchor(engine.context.run, anchorFromPolicy(policy)),
		);
		if (anchor !== undefined)
			return refusal(
				`WORK_REF_ANCHOR_REFUSED: ${anchor}`,
				'Keep the shared checkout attached to the policy integration branch.',
			);
		const baseSha = await integrationBase(engine, policy);
		if (baseSha === undefined)
			return refusal(
				'WORK_REF_BASE_UNRESOLVED: the policy integration branch could not be resolved.',
				'Fetch or create the configured integration branch, then retry.',
			);
		for (const path of validPaths)
			await assertContainedPath(engine.context.root, path);
		if (input.action === 'recover') {
			const commit = input.commit!;
			const publication = await recoverCheckpoint(
				engine,
				policy,
				options.remote,
				policyResult.ref,
				commit,
				validPaths,
			);
			const after = await snapshot(engine);
			if (!snapshotUnchanged(before, after))
				return refusal(
					'WORK_REF_INVARIANT_FAILED: recovery changed HEAD, branch or the real index.',
					'Stop and inspect the workspace before retrying.',
				);
			return toolOk({
				action: input.action,
				ref: policyResult.ref,
				commit,
				scope: validPaths,
				cleaned: [],
				restored: [],
				deleted: [],
				published: publication.published,
				remote: publication.remote,
				headMoved: false,
				indexTouched: false,
			});
		}
		if (input.action === 'materialize') {
			const result = await engine.restorePathsFromRef({
				ref: policyResult.ref,
				paths: validPaths,
			});
			if (result.status !== 'restored')
				return refusal(
					`WORK_REF_MATERIALIZE_REFUSED: ${result.reason ?? result.status}`,
					'Use only paths recorded in the checkpoint scope.',
				);
			const commit =
				(await runOutput(engine.context.run, [
					'rev-parse',
					'--verify',
					`${policyResult.ref}^{}`,
				])) ?? '';
			const after = await snapshot(engine);
			if (!snapshotUnchanged(before, after))
				return refusal(
					'WORK_REF_INVARIANT_FAILED: materialize changed HEAD, branch or the real index.',
					'Stop and inspect the workspace before retrying.',
				);
			return toolOk({
				action: input.action,
				ref: policyResult.ref,
				commit,
				scope: validPaths,
				cleaned: [],
				restored: result.restored,
				deleted: result.deleted,
				published: false,
				remote: '',
				headMoved: false,
				indexTouched: false,
			});
		}
		const expandedScope = await expandClaimedScope(
			engine,
			baseSha,
			validPaths,
		);
		if (input.cleanAfterCheckpoint === true) {
			// Preflight every target before reporting durability. A
			// type-conflicting directory or symlinked parent must not be
			// discovered halfway through cleanup.
			for (const path of expandedScope) {
				await assertContainedParent(engine.context.root, path);
				const info = await lstat(join(engine.context.root, path)).catch(
					() => undefined,
				);
				const entry = await readBaseEntry(
					engine.context.run,
					baseSha,
					path,
				);
				if (
					entry !== undefined &&
					info?.isDirectory() &&
					!info.isSymbolicLink()
				) {
					throw new Error(
						`refusing to clean directory ${path} as a base file`,
					);
				}
			}
		}
		const checkpoint = await engine.createOrUpdateWipRef({
			baseSha,
			paths: expandedScope,
			ref: policyResult.ref,
			message: input.message!,
		});
		if (
			checkpoint.status !== 'created' &&
			checkpoint.status !== 'unchanged'
		)
			return refusal(
				`WORK_REF_CHECKPOINT_REFUSED: ${checkpoint.reason ?? checkpoint.status}`,
				'Keep the complete claimed scope and retry the checkpoint.',
			);
		if (
			!(await verifyCheckpoint(
				engine,
				policyResult.ref,
				checkpoint.commit,
			))
		)
			return refusal(
				'WORK_REF_CHECKPOINT_UNVERIFIED: the work ref did not resolve to the checkpoint commit.',
				'Do not clean the worktree; inspect the WIP ref and retry.',
			);
		const publication = await publishCheckpoint(
			engine,
			policy,
			options.remote,
			policyResult.ref,
			checkpoint.commit,
			checkpoint.status === 'created'
				? checkpoint.parent
				: checkpoint.commit,
		);
		let cleaned: readonly string[] = [];
		let deleted: readonly string[] = [];
		if (input.cleanAfterCheckpoint === true) {
			const clean = await cleanToBase(engine, baseSha, checkpoint.scope);
			cleaned = clean.cleaned;
			deleted = clean.deleted;
		}
		const after = await snapshot(engine);
		if (!snapshotUnchanged(before, after))
			return refusal(
				'WORK_REF_INVARIANT_FAILED: checkpoint changed HEAD, branch or the real index.',
				'Stop and inspect the workspace before retrying.',
			);
		return toolOk({
			action: input.action,
			ref: policyResult.ref,
			commit: checkpoint.commit,
			scope: checkpoint.scope,
			cleaned,
			restored: [],
			deleted,
			published: publication.published,
			remote: publication.remote,
			headMoved: false,
			indexTouched: false,
		});
	} catch (error: unknown) {
		return refusal(
			`WORK_REF_FAILED: ${error instanceof Error ? error.message : String(error)}`,
			'No branch, checkout or direct git commit is permitted; inspect the contained failure and retry.',
		);
	}
};

export const buildWorkRefToolRegistration = (
	options: IWorkRefToolOptions,
): IToolRegistration => ({
	id: 'commit_policy_work_ref',
	summary:
		'Checkpoint exact claimed files to a policy-derived non-head WIP ref or materialize them back without moving HEAD or the real index.',
	tags: ['commit-policy', 'wip-ref', 'write'],
	effects: ['write', 'destructive'],
	disclosure: 'contextual',
	register: async (server: McpServer) => {
		server.registerTool(
			`${options.namespacePrefix}_commit_policy_work_ref`,
			{
				description:
					'Policy-gated shared-checkout persistence. action=checkpoint writes only the exact paths to a non-head work ref, publishes it when policy requires durable remote recovery, and may clean those paths back to the integration base; action=materialize restores only paths recorded in that ref; action=recover reattaches and republishes a verified orphan checkpoint object. It never switches branches, changes HEAD, touches the real git index or commits the integration branch.',
				inputSchema: InputSchema,
				outputSchema: compactOutputSchema(),
			},
			async (args) => runCommitPolicyWorkRef(args, options),
		);
	},
});

/**
 * Verify that every existing parent is a real directory, never a symlink.
 * `join(root, path)` is lexically contained but would still escape through a
 * symlinked parent. Missing parents are safe: `mkdir` creates them below the
 * already-validated prefix.
 */
const assertContainedParent = async (
	root: string,
	path: string,
): Promise<void> => {
	let current = root;
	const parent = dirname(path);
	for (const component of parent.split('/').filter(Boolean)) {
		current = join(current, component);
		try {
			const info = await lstat(current);
			if (info.isSymbolicLink() || !info.isDirectory()) {
				throw new Error(`path parent is not a real directory: ${path}`);
			}
		} catch (error: unknown) {
			if (
				error instanceof Error &&
				'code' in error &&
				(error as NodeJS.ErrnoException).code === 'ENOENT'
			) {
				return;
			}
			throw error;
		}
	}
};

const assertContainedPath = async (
	root: string,
	path: string,
): Promise<void> => {
	await assertContainedParent(root, path);
	try {
		if ((await lstat(join(root, path))).isSymbolicLink()) {
			throw new Error(`symlinked scope path is not claimable: ${path}`);
		}
	} catch (error: unknown) {
		if (
			error instanceof Error &&
			'code' in error &&
			(error as NodeJS.ErrnoException).code === 'ENOENT'
		) {
			return;
		}
		throw error;
	}
};

/** Expand a claim before checkpointing so clean-up can be preflighted. */
const expandClaimedScope = async (
	engine: IWipEngine,
	baseSha: string,
	paths: readonly string[],
): Promise<readonly string[]> => {
	const files = new Set<string>();
	const visit = async (path: string): Promise<void> => {
		const absolute = join(engine.context.root, path);
		try {
			const info = await lstat(absolute);
			if (info.isSymbolicLink()) {
				throw new Error(
					`symlinked scope path is not claimable: ${path}`,
				);
			}
			if (info.isDirectory() && !info.isSymbolicLink()) {
				for (const child of await readdir(absolute)) {
					await visit(`${path}/${child}`);
				}
				return;
			}
		} catch (error: unknown) {
			if (
				!(error instanceof Error) ||
				!('code' in error) ||
				(error as NodeJS.ErrnoException).code !== 'ENOENT'
			) {
				throw error;
			}
			// A missing path may still be a tracked deletion in the base.
		}
		files.add(path);
	};
	for (const path of paths) await visit(path);
	const tracked = await engine.context.run([
		'--literal-pathspecs',
		'ls-tree',
		'-r',
		'-z',
		'--name-only',
		baseSha,
		'--',
		...paths,
	]);
	for (const path of (tracked.ok ? tracked.output : '').split('\0')) {
		if (path.length > 0) files.add(path);
	}
	return [...files].sort();
};
