#!/usr/bin/env bun
/**
 * rewrite-llm-attribution.script.ts — f00500 S8.
 *
 * Strips LLM attribution from git history: the `Co-Authored-By: <model>`
 * trailers, the `Generated with <tool>` footers, the agent branch names
 * baked into merge subjects, and the ~30 synthetic author/committer
 * identities (`copilot-minimax-m3`, `mcp-vertex@MiniMax.local`,
 * `MCP-V Bot <ci@anthropic.com>`, ...) that swarm runs recorded before
 * `commit-policy` was switched to `identity.mode: 'explicit'`.
 *
 * ## Why a fast-export pipe and not `git filter-repo --replace-message`
 *
 * filter-repo takes its message rules as a regex file and its callbacks as
 * Python. Either way the logic that RUNS during the rewrite would be a
 * second copy of the logic this repo TESTS, and this codebase has been bitten
 * repeatedly by exactly that shape — a writer and a reader that agree only
 * until one of them is edited. So the transform is one tested TypeScript
 * function, `rewriteFastExportStream`, and git only supplies and re-consumes
 * the stream around it.
 *
 * ## Why identities are an allowlist, not a denylist
 *
 * A denylist of LLM vendors is out of date the day a new model ships, and
 * the cost of a missing entry is the exact leak this proposal exists to
 * close. So: every identity that is not a KNOWN human collaborator or
 * platform bot is rewritten to the repository owner. A new agent identity,
 * a new vendor, a new hostname — all covered already, without an edit.
 *
 * ## Safety
 *
 * The rewrite is irreversible on the remote. Always take a bundle first
 * (`git bundle create <path> --all`); `--dry-run` (the default) reports what
 * would change without touching any ref.
 *
 * Usage:
 *   bun tools/scripts/git/rewrite-llm-attribution.script.ts
 *   bun tools/scripts/git/rewrite-llm-attribution.script.ts --repo <path> --apply
 */
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { llmDomainIn, llmPhraseIn } from '../lint/llm-attribution-rules';

// ---------------------------------------------------------------------------
// Identity policy
// ---------------------------------------------------------------------------

export interface IGitIdentity {
	readonly name: string;
	readonly email: string;
}

/**
 * Platform bots that are NOT the owner and are still legitimate.
 *
 * A bot whose presence carries no claim about who wrote the code belongs
 * here. Dependabot is the case: every repository on GitHub has it, and
 * erasing it would repaint automated dependency bumps as hand-written
 * commits — a worse misattribution than the one being fixed. These are
 * public bot identities, not anybody's personal details.
 */
export const ALLOWED_BOT_EMAILS: readonly string[] = [
	'49699333+dependabot[bot]@users.noreply.github.com',
];

/**
 * The owner identity is READ from the repository's own configuration, never
 * written down here.
 *
 * Two reasons. It is the maintainer's personal name and address, and a
 * source file committed to a public repository is the last place it should
 * be duplicated. And it is configuration, not policy: `commit-policy`
 * already holds the single answer to "who owns this repository's commits",
 * so a copy in this script is a second answer that can drift from the first.
 */
export const readOwnerIdentity = (repo: string): IGitIdentity => {
	const fromConfig = readConfiguredOwner(repo);
	if (fromConfig !== undefined) return fromConfig;
	const name = gitConfig(repo, 'user.name');
	const email = gitConfig(repo, 'user.email');
	if (name === undefined || email === undefined)
		throw new Error(
			'no owner identity: set plugins.commit-policy.options.identity.owner ' +
				'in mcp-vertex.config.json, or git config user.name/user.email',
		);
	return { name, email };
};

export type IIdentityVerdict = 'canonical' | 'allowed' | 'rewritten';

/**
 * Decide what happens to one author/committer identity.
 *
 * `rewritten` is the default on purpose — see the allowlist rationale in the
 * module header. It also means the owner's OTHER spellings (a second
 * machine, an old work address) need no enumeration: they are not the
 * canonical identity, so they are normalised onto it like everything else.
 */
export const classifyIdentity = (
	identity: IGitIdentity,
	owner: IGitIdentity,
	allowed: readonly string[] = ALLOWED_BOT_EMAILS,
): IIdentityVerdict => {
	const email = identity.email.toLowerCase();
	if (allowed.some((entry) => entry.toLowerCase() === email))
		return 'allowed';
	return email === owner.email.toLowerCase() && identity.name === owner.name
		? 'canonical'
		: 'rewritten';
};

/** Map an identity through the policy. */
export const canonicalIdentity = (
	identity: IGitIdentity,
	owner: IGitIdentity,
	allowed: readonly string[] = ALLOWED_BOT_EMAILS,
): IGitIdentity =>
	classifyIdentity(identity, owner, allowed) === 'allowed' ? identity : owner;

// ---------------------------------------------------------------------------
// Message policy
// ---------------------------------------------------------------------------

const TRAILER_LINE = /^([A-Za-z][\w-]*)\s*:\s*(.+)$/u;

const ATTRIBUTION_TRAILER =
	/^(?:co-?authored-by|signed-off-by|generated-?with|generated-?by|helped-?by|thanked)$/iu;

const GENERATED_FOOTER =
	/^\s*\W*\s*(?:generated|written|built|crafted|created|produced)\s+(?:with|by|using)\s+(.+)$/iu;

/**
 * Agent branch names leak the vendor into merge subjects
 * (`Merge branch 'agent/copilot-minimax-m3-s57' into develop`). The branch
 * itself is long gone; only the sentence survives, so the sentence is what
 * gets neutralised.
 */
const VENDOR_SEGMENT =
	'claude|copilot|minimax|gpt|codex|gemini|grok|llama|mistral|qwen|deepseek|anthropic|openai|m3|opus|sonnet|haiku';

// One `agent/` prefix can carry SEVERAL vendor segments in a row —
// `agent/copilot-minimax-m3-s57` names the host, the vendor and the model
// before it reaches the task id. Matching a single segment would have left
// behind `agent/minimax-m3-s57`, the same leak one word shorter, so the
// group repeats until the first segment that is not a vendor.
const AGENT_BRANCH = new RegExp(
	`\\bagent/(?:(?:${VENDOR_SEGMENT})[a-z0-9]*-)+`,
	'giu',
);

const neutraliseAgentBranches = (line: string): string =>
	line.replace(AGENT_BRANCH, 'agent/');

/**
 * True when this single line is pure LLM attribution and carries nothing
 * else — the only case where deleting the whole line is safe.
 */
export const isLlmAttributionLine = (line: string): boolean => {
	const trailer = line.match(TRAILER_LINE);
	if (trailer !== null) {
		const [, key, value] = trailer;
		if (key === undefined || value === undefined) return false;
		if (!ATTRIBUTION_TRAILER.test(key)) return false;
		return llmPhraseIn(value) !== null || llmDomainIn(value) !== null;
	}
	const footer = line.match(GENERATED_FOOTER);
	if (footer !== null) {
		const tail = footer[1] ?? '';
		return llmPhraseIn(tail) !== null || llmDomainIn(tail) !== null;
	}
	return false;
};

/**
 * Strip LLM attribution from one commit message.
 *
 * Deletes whole attribution lines, neutralises agent branch names in the
 * lines that remain, and collapses the blank runs the deletions leave
 * behind, so a message that ended in a trailer block does not end in three
 * blank lines.
 */
export const sanitizeCommitMessage = (message: string): string => {
	const kept: string[] = [];
	for (const line of message.split('\n')) {
		if (isLlmAttributionLine(line)) continue;
		kept.push(neutraliseAgentBranches(line));
	}
	const collapsed: string[] = [];
	for (const line of kept) {
		const previous = collapsed[collapsed.length - 1];
		if (
			line.trim() === '' &&
			previous !== undefined &&
			previous.trim() === ''
		)
			continue;
		collapsed.push(line);
	}
	while (
		collapsed.length > 0 &&
		(collapsed[collapsed.length - 1] ?? '').trim() === ''
	)
		collapsed.pop();
	// A commit message is a line-oriented file: git writes it with a
	// trailing newline, and an empty message must stay empty rather than
	// become a lone newline.
	return collapsed.length === 0 ? '' : `${collapsed.join('\n')}\n`;
};

// ---------------------------------------------------------------------------
// fast-export stream transform
// ---------------------------------------------------------------------------

const IDENTITY_LINE = /^(author|committer|tagger) (.*) <([^>]*)> (.*)$/u;

export interface IRewriteStats {
	readonly commits: number;
	readonly identitiesRewritten: number;
	readonly messagesChanged: number;
}

/**
 * Rewrite a `git fast-export` stream in place.
 *
 * Works on bytes, not on a decoded string: a `data <n>` header counts BYTES,
 * so sanitising a message that contains any non-ASCII character (this
 * repository's messages are half Spanish) and re-emitting the original count
 * would desynchronise the stream and corrupt every commit after it.
 *
 * A `data` block is treated as a message only when it directly follows an
 * identity line, which is what distinguishes it from a blob.
 */
export const rewriteFastExportStream = (
	input: Buffer,
	owner: IGitIdentity,
): { readonly output: Buffer; readonly stats: IRewriteStats } => {
	const chunks: Buffer[] = [];
	let commits = 0;
	let identitiesRewritten = 0;
	let messagesChanged = 0;
	let afterIdentity = false;
	let offset = 0;

	while (offset < input.length) {
		const newlineAt = input.indexOf(0x0a, offset);
		const lineEnd = newlineAt === -1 ? input.length : newlineAt;
		const line = input.subarray(offset, lineEnd).toString('utf8');
		offset = lineEnd + 1;

		if (line.startsWith('commit ')) commits += 1;

		const identity = line.match(IDENTITY_LINE);
		if (identity !== null) {
			const [, role, name, email, when] = identity;
			const mapped = canonicalIdentity(
				{ name: name ?? '', email: email ?? '' },
				owner,
			);
			if (mapped.name !== name || mapped.email !== email)
				identitiesRewritten += 1;
			chunks.push(
				Buffer.from(
					`${role ?? ''} ${mapped.name} <${mapped.email}> ${when ?? ''}\n`,
					'utf8',
				),
			);
			afterIdentity = true;
			continue;
		}

		const data = line.match(/^data (\d+)$/u);
		if (data !== null && afterIdentity) {
			const size = Number(data[1]);
			const payload = input.subarray(offset, offset + size);
			offset += size;
			const original = payload.toString('utf8');
			const sanitized = sanitizeCommitMessage(original);
			if (sanitized !== original) messagesChanged += 1;
			const body = Buffer.from(sanitized, 'utf8');
			chunks.push(Buffer.from(`data ${body.length}\n`, 'utf8'), body);
			afterIdentity = false;
			continue;
		}

		// `encoding`/`original-oid` sit between the identity and its data
		// block, so they must not clear the flag.
		if (!line.startsWith('encoding ') && !line.startsWith('original-oid '))
			afterIdentity = false;
		chunks.push(Buffer.from(`${line}\n`, 'utf8'));
	}

	return {
		output: Buffer.concat(chunks),
		stats: { commits, identitiesRewritten, messagesChanged },
	};
};

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

const git = (repo: string, args: readonly string[]): string => {
	const res = spawnSync('git', ['-C', repo, ...args], {
		encoding: 'utf8',
		maxBuffer: 1024 * 1024 * 512,
	});
	if (res.status !== 0)
		throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`);
	return res.stdout;
};

function gitConfig(repo: string, key: string): string | undefined {
	const res = spawnSync('git', ['-C', repo, 'config', '--get', key], {
		encoding: 'utf8',
	});
	const value = (res.stdout ?? '').trim();
	return res.status === 0 && value.length > 0 ? value : undefined;
}

/**
 * The owner declared by `commit-policy` in `mcp-vertex.config.json`.
 *
 * Returns `undefined` rather than throwing when the file is absent or the
 * field is unset: this script must also work in a bare clone (the safest
 * place to run a rewrite), where there is no working tree to read it from,
 * and the git-config fallback answers there.
 */
function readConfiguredOwner(repo: string): IGitIdentity | undefined {
	const raw = ((): string | undefined => {
		try {
			return readFileSync(join(repo, 'mcp-vertex.config.json'), 'utf8');
		} catch {
			return undefined;
		}
	})();
	if (raw === undefined) return undefined;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return undefined;
	}
	const owner = readPath(parsed, [
		'plugins',
		'commit-policy',
		'options',
		'identity',
		'owner',
	]);
	const name = readPath(owner, ['name']);
	const email = readPath(owner, ['email']);
	return typeof name === 'string' && typeof email === 'string'
		? { name, email }
		: undefined;
}

/** Walk a parsed-JSON value by key path, yielding `undefined` at any miss. */
function readPath(value: unknown, path: readonly string[]): unknown {
	let current = value;
	for (const key of path) {
		if (typeof current !== 'object' || current === null) return undefined;
		current = (current as Record<string, unknown>)[key];
	}
	return current;
}

const exportStream = async (repo: string): Promise<Buffer> =>
	new Promise((resolve, reject) => {
		const child = spawn(
			'git',
			[
				'-C',
				repo,
				'fast-export',
				'--all',
				'--no-data',
				'--reencode=yes',
				'--signed-tags=strip',
				'--tag-of-filtered-object=rewrite',
				'--use-done-feature',
			],
			{ stdio: ['ignore', 'pipe', 'inherit'] },
		);
		const parts: Buffer[] = [];
		child.stdout.on('data', (chunk: Buffer) => parts.push(chunk));
		child.on('error', reject);
		child.on('close', (code) =>
			code === 0
				? resolve(Buffer.concat(parts))
				: reject(new Error(`fast-export exited ${String(code)}`)),
		);
	});

const importStream = async (repo: string, stream: Buffer): Promise<void> =>
	new Promise((resolve, reject) => {
		const child = spawn(
			'git',
			['-C', repo, 'fast-import', '--force', '--quiet'],
			{ stdio: ['pipe', 'inherit', 'inherit'] },
		);
		child.on('error', reject);
		child.on('close', (code) =>
			code === 0
				? resolve()
				: reject(new Error(`fast-import exited ${String(code)}`)),
		);
		child.stdin.end(stream);
	});

export interface IIdentityAuditRow {
	readonly identity: IGitIdentity;
	readonly verdict: IIdentityVerdict;
	readonly commits: number;
}

/** Every author/committer identity in the repository, with its verdict. */
export const auditIdentities = (
	repo: string,
	owner: IGitIdentity,
): readonly IIdentityAuditRow[] => {
	const seen = new Map<string, { identity: IGitIdentity; commits: number }>();
	for (const role of ['%an <%ae>', '%cn <%ce>']) {
		const log = git(repo, ['log', '--all', `--format=${role}`]);
		for (const raw of log.split('\n')) {
			const match = raw.match(/^(.*) <([^>]*)>$/u);
			if (match === null) continue;
			const identity = { name: match[1] ?? '', email: match[2] ?? '' };
			const key = `${identity.name} ${identity.email}`;
			const entry = seen.get(key) ?? { identity, commits: 0 };
			entry.commits += 1;
			seen.set(key, entry);
		}
	}
	return [...seen.values()]
		.map((entry) => ({
			...entry,
			verdict: classifyIdentity(entry.identity, owner),
		}))
		.sort((left, right) => right.commits - left.commits);
};

const main = async (): Promise<number> => {
	const args = process.argv.slice(2);
	const repoAt = args.indexOf('--repo');
	const repo = repoAt === -1 ? process.cwd() : (args[repoAt + 1] ?? '.');
	const apply = args.includes('--apply');

	const owner = readOwnerIdentity(repo);
	for (const row of auditIdentities(repo, owner))
		console.log(
			`  ${row.verdict.padEnd(9)} ${String(row.commits).padStart(5)}  ${row.identity.name} <${row.identity.email}>`,
		);

	const stream = await exportStream(repo);
	const { output, stats } = rewriteFastExportStream(stream, owner);
	console.log(
		`commits=${stats.commits} identities-rewritten=${stats.identitiesRewritten} messages-changed=${stats.messagesChanged}`,
	);

	if (!apply) {
		console.log('dry run: no refs touched (pass --apply to rewrite)');
		return 0;
	}

	await importStream(repo, output);
	console.log('rewrite applied. Verify, then force-push.');
	return 0;
};

if (import.meta.main) {
	main()
		.then((code) => process.exit(code))
		.catch((error: unknown) => {
			console.error(`rewrite-llm-attribution: ${String(error)}`);
			process.exit(1);
		});
}
