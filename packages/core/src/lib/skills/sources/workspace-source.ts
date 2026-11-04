/**
 * skills/sources/workspace-source.ts — q00009 / f00262.
 *
 * Workspace skill source: skills under `<workspaceRoot>/.delendai/skills/<id>/`.
 *
 * The workspace always wins precedence over package and plugin skills
 * (q00009 §7.5). This is the operator's local override layer — useful
 * for experimentation, dogfooding, and project-specific tailoring
 * without touching installed packages.
 */

import type { ISkillSource, ISkillDescriptor, ILoadedSkill } from './types';

export interface IWorkspaceSkillSourceInput {
	readonly id: string;
	readonly workspaceRoot: string;
	/** Path of the local override root; default `.delendai/skills`. */
	readonly relativeRoot?: string;
	readonly listDir?: (absPath: string) => Promise<readonly string[]>;
	readonly readFile?: (absPath: string) => Promise<string>;
	readonly now?: () => Date;
	readonly hash?: (text: string) => string;
	/** Allow the source to be disabled (default = enabled). */
	readonly enabled?: boolean;
}

const identityHash = (text: string): string =>
	// Cheap, deterministic, NOT cryptographic. The descriptor hash is
	// for cache invalidation, not security.
	`h:${text.length}`;

const defaultListDir = async (_absPath: string): Promise<readonly string[]> => {
	throw new Error(
		'workspaceSkillSource: listDir is not injected — provide one in production wiring',
	);
};
const defaultReadFile = async (_absPath: string): Promise<string> => {
	throw new Error(
		'workspaceSkillSource: readFile is not injected — provide one in production wiring',
	);
};

export const workspaceSkillSource = (
	input: IWorkspaceSkillSourceInput,
): ISkillSource => {
	const enabled = input.enabled ?? true;
	const listDir = input.listDir ?? defaultListDir;
	const readFile = input.readFile ?? defaultReadFile;
	const root = `${input.workspaceRoot}/${input.relativeRoot ?? '.delendai/skills'}`;

	return {
		id: input.id,
		source: 'workspace',

		async list(): Promise<readonly ISkillDescriptor[]> {
			if (!enabled) return [];
			let entries: readonly string[];
			try {
				entries = await listDir(root);
			} catch {
				return [];
			}
			const out: ISkillDescriptor[] = [];
			for (const entry of entries) {
				const skillFile = `${root}/${entry}/SKILL.md`;
				let body = '';
				try {
					body = await readFile(skillFile);
				} catch {
					continue;
				}
				out.push({
					id: entry,
					version: '0.0.0+workspace',
					description: `workspace override for ${entry}`,
					tags: ['workspace'],
					appliesTo: ['@delendai/*'],
					source: 'workspace',
					owner: input.id,
					hash: (input.hash ?? identityHash)(body),
					estimatedBodyTokens: Math.ceil(body.length / 4),
				});
			}
			return out;
		},

		async load(id: string): Promise<ILoadedSkill | null> {
			if (!enabled) return null;
			const skillFile = `${root}/${id}/SKILL.md`;
			let body: string;
			try {
				body = await readFile(skillFile);
			} catch {
				return null;
			}
			return {
				id,
				version: '0.0.0+workspace',
				description: `workspace override for ${id}`,
				tags: ['workspace'],
				appliesTo: ['@delendai/*'],
				source: 'workspace',
				owner: input.id,
				hash: (input.hash ?? identityHash)(body),
				estimatedBodyTokens: Math.ceil(body.length / 4),
				body,
				loadedAtIso: (input.now?.() ?? new Date()).toISOString(),
			};
		},
	};
};
