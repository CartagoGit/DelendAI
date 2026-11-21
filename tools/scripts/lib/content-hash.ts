/**
 * content-hash.ts — a hash of exactly the files a check reads, and a record
 * of the last verdict under it.
 *
 * A check whose verdict depends on repository-wide inputs cannot judge only
 * the changed files, but it need not run again when nothing it reads has
 * changed. Its inputs are named as git pathspecs and hashed as they are in
 * the working tree, tracked and untracked alike (ignored files are never an
 * input), so an edit not yet committed changes the hash as a commit would.
 * Only a pass is recorded: a failure always runs again.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

/** Where the recorded verdicts live, under the checkout. */
export const VERDICTS_DIR = '.cache/delendai/verify/verdicts';

const sha = (data: string | Buffer): string =>
	createHash('sha256').update(data).digest('hex');

/** The files `pathspecs` name in the working tree, tracked or not, sorted. */
export const filesUnder = (
	root: string,
	pathspecs: readonly string[],
): readonly string[] =>
	execFileSync(
		'git',
		['ls-files', '-z', '-co', '--exclude-standard', '--', ...pathspecs],
		{ cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 },
	)
		.split('\0')
		.filter((path) => path.length > 0)
		.sort();

/** A hash of the content of `files` (repository-relative) and their names. */
export const hashOfFiles = (root: string, files: readonly string[]): string => {
	const hash = createHash('sha256');
	for (const file of files) {
		let content: Buffer | string;
		try {
			content = readFileSync(join(root, file));
		} catch {
			// Listed but unreadable (deleted in the working tree): that is
			// a state of its own, not the file's last content.
			content = '\0missing';
		}
		hash.update(`${file}\0${sha(content)}\n`);
	}
	return hash.digest('hex');
};

/** A hash of every file `pathspecs` name, as the working tree has them. */
export const hashOfPaths = (
	root: string,
	pathspecs: readonly string[],
): string => hashOfFiles(root, filesUnder(root, pathspecs));

/** A hash of a directory's files, every one or those `keep` accepts. */
export const hashOfDirectory = (
	directory: string,
	keep: (name: string) => boolean = () => true,
): string | undefined => {
	if (!existsSync(directory)) return undefined;
	const hash = createHash('sha256');
	const walk = (dir: string, prefix: string): void => {
		const entries = readdirSync(dir, { withFileTypes: true }).sort(
			(left, right) => (left.name < right.name ? -1 : 1),
		);
		for (const entry of entries) {
			const path = join(dir, entry.name);
			const rel = `${prefix}${entry.name}`;
			if (entry.isDirectory()) walk(path, `${rel}/`);
			else if (keep(entry.name))
				hash.update(`${rel}\0${sha(readFileSync(path))}\n`);
		}
	};
	walk(directory, '');
	return hash.digest('hex');
};

/** One recorded pass: the inputs' key, and anything the check keeps with it. */
export interface IRecordedPass {
	readonly key: string;
	readonly at: string;
	readonly kept?: Readonly<Record<string, string>>;
}

const recordPath = (root: string, name: string): string =>
	join(root, VERDICTS_DIR, `${name.replace(/[^\w.-]+/gu, '_')}.json`);

/** The pass recorded for `name` under `key`, or `undefined`. */
export const recordedPass = (
	root: string,
	name: string,
	key: string,
): IRecordedPass | undefined => {
	try {
		const record = JSON.parse(
			readFileSync(recordPath(root, name), 'utf8'),
		) as IRecordedPass;
		return record.key === key ? record : undefined;
	} catch {
		return undefined;
	}
};

/** Record that `name` passed under `key`. */
export const recordPass = (
	root: string,
	name: string,
	key: string,
	kept?: Readonly<Record<string, string>>,
): void => {
	const path = recordPath(root, name);
	mkdirSync(dirname(path), { recursive: true });
	const record: IRecordedPass = {
		key,
		at: new Date().toISOString(),
		...(kept !== undefined ? { kept } : {}),
	};
	writeFileSync(path, `${JSON.stringify(record, null, '\t')}\n`);
};

/** A key from named parts, so no two inputs can collide by concatenation. */
export const keyOf = (parts: Readonly<Record<string, string>>): string =>
	sha(
		JSON.stringify(
			Object.entries(parts).sort(([left], [right]) =>
				left < right ? -1 : 1,
			),
		),
	);
