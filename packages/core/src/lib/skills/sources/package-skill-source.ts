import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { extractSkillDescription } from '../skill-catalog';
import type { ILoadedSkill, ISkillDescriptor, ISkillSource } from './types';

export interface IPackageSkillSourceInput {
	readonly id: string;
	readonly packageRoot: string;
	readonly owner: string;
	readonly source?: 'package' | 'plugin' | 'core';
	readonly listDir?: (absPath: string) => Promise<readonly string[]>;
	readonly readFile?: (absPath: string) => Promise<string>;
	readonly packageVersion?: string;
}

const SKILL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

const defaultListDir = async (root: string): Promise<readonly string[]> => {
	try {
		const entries = await readdir(root, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort();
	} catch {
		return [];
	}
};

const defaultReadFile = (path: string): Promise<string> =>
	readFile(path, 'utf8');

const hashBody = (body: string): string =>
	`sha256:${createHash('sha256').update(body).digest('hex')}`;

const frontmatterFor = (body: string): string =>
	/^---\n([\s\S]*?)\n---(?:\n|$)/u.exec(body)?.[1] ?? '';

const frontmatterValue = (body: string, key: string): string | undefined => {
	const line = new RegExp(`^${key}:\\s*(.+)$`, 'mu')
		.exec(frontmatterFor(body))?.[1]
		?.trim();
	if (line === undefined) return undefined;
	return line.replace(/^['"]|['"]$/gu, '');
};

const frontmatterList = (body: string, key: string): readonly string[] => {
	const value = frontmatterValue(body, key);
	if (value === undefined) return [];
	const inline = /^\[(.*)\]$/u.exec(value)?.[1];
	if (inline === undefined) return [];
	return inline
		.split(',')
		.map((item) => item.trim().replace(/^['"]|['"]$/gu, ''))
		.filter((item) => item.length > 0);
};

const bodyPathFor = (root: string, id: string): string =>
	join(root, 'skills', id, 'SKILL.md');

const descriptorFor = (input: {
	readonly id: string;
	readonly body: string;
	readonly source: ISkillDescriptor['source'];
	readonly owner: string;
	readonly packageVersion: string;
}): ISkillDescriptor => ({
	id: frontmatterValue(input.body, 'name') ?? input.id,
	version: input.packageVersion,
	description: extractSkillDescription(input.id, input.body),
	tags: frontmatterList(input.body, 'tags'),
	appliesTo:
		frontmatterList(input.body, 'appliesTo').length > 0
			? frontmatterList(input.body, 'appliesTo')
			: [input.owner],
	source: input.source,
	owner: input.owner,
	hash: hashBody(input.body),
	estimatedBodyTokens: Math.ceil(Buffer.byteLength(input.body, 'utf8') / 4),
});

/** Resolve skills shipped inside an installed package, without workspace paths. */
export const packageSkillSource = (
	input: IPackageSkillSourceInput,
): ISkillSource => {
	const source = input.source ?? 'package';
	const listDir = input.listDir ?? defaultListDir;
	const read = input.readFile ?? defaultReadFile;
	const root = join(input.packageRoot, 'skills');
	const version = input.packageVersion ?? '0.0.0';

	const readDescriptor = async (
		directory: string,
	): Promise<ISkillDescriptor | null> => {
		if (!SKILL_ID.test(directory)) return null;
		try {
			const body = await read(bodyPathFor(input.packageRoot, directory));
			return descriptorFor({
				id: directory,
				body,
				source,
				owner: input.owner,
				packageVersion: version,
			});
		} catch {
			return null;
		}
	};

	return {
		id: input.id,
		source,
		async list(): Promise<readonly ISkillDescriptor[]> {
			const ids = await listDir(root);
			const descriptors: ISkillDescriptor[] = [];
			for (const directory of ids) {
				const descriptor = await readDescriptor(directory);
				if (descriptor !== null) descriptors.push(descriptor);
			}
			return descriptors;
		},
		async load(id: string): Promise<ILoadedSkill | null> {
			if (!SKILL_ID.test(id)) return null;
			const directories = await listDir(root);
			let directory = id;
			let descriptor = await readDescriptor(directory);
			if (descriptor?.id !== id) {
				for (const candidate of directories) {
					const candidateDescriptor = await readDescriptor(candidate);
					if (candidateDescriptor?.id === id) {
						directory = candidate;
						descriptor = candidateDescriptor;
						break;
					}
				}
			}
			if (descriptor === null) return null;
			const body = await read(bodyPathFor(input.packageRoot, directory));
			return {
				...descriptor,
				body,
				loadedAtIso: new Date().toISOString(),
			};
		},
	};
};
