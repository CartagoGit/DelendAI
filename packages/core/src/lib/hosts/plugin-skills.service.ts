/**
 * plugin-skills.service.ts — install the skills the active plugins ship
 * where each of the project's hosts reads skills.
 *
 * The plugin's `skills/` folder is the only source. Every installed file is
 * that source with delendai's marker appended, so a later pass can tell it
 * from a person's own skill: only a file as delendai wrote it is ever
 * rewritten or removed, and one without the marker is never touched.
 */
import { mkdir, readdir, readFile, rm, rmdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { AGENT_HOSTS } from '../contracts/constants/agent-hosts.constant';
import { INSTALLED_SKILLS_RECORD } from '../contracts/constants/plugin-skills.constant';
import type { IAgentHost } from '../contracts/interfaces/agent-host.interface';
import type {
	IPluginSkillChange,
	IPluginSkillSource,
} from '../contracts/interfaces/agent-role-contribution.interface';
import {
	readAgentSignature,
	signAgent,
} from '../scaffold/agent-signature.helper';
import { writeFileAtomic } from '../shared/atomic-write';
import { ensureSelfIgnoringDir } from '../shared/self-ignoring-dir';
import { recordPath } from '../shared/delendai-records';

const SKILL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const SKILL_FILE = 'SKILL.md';

/** Hosts that read project skills from a folder. */
export const hostsReadingSkills = (
	hosts: readonly IAgentHost[],
): readonly IAgentHost[] => hosts.filter((host) => host.skills !== undefined);

const readText = (path: string): Promise<string | undefined> =>
	readFile(path, 'utf8').catch(() => undefined);

/** The files to write: one per skill and host folder, signed. */
const wantedFiles = (
	hosts: readonly IAgentHost[],
	skills: readonly IPluginSkillSource[],
): ReadonlyMap<string, { plugin: string; content: string }> => {
	const wanted = new Map<string, { plugin: string; content: string }>();
	for (const host of hostsReadingSkills(hosts)) {
		const dir = host.skills?.dir;
		if (dir === undefined) continue;
		for (const skill of skills) {
			if (!SKILL_ID.test(skill.id)) continue;
			wanted.set(`${dir}/${skill.id}/${SKILL_FILE}`, {
				plugin: skill.plugin,
				content: signAgent(skill.body, 'plugin-skill', skill.plugin),
			});
		}
	}
	return wanted;
};

/** Every installed skill file under any host's folder. */
const installedPaths = async (root: string): Promise<readonly string[]> => {
	const found: string[] = [];
	for (const host of AGENT_HOSTS) {
		const dir = host.skills?.dir;
		if (dir === undefined) continue;
		const names = await readdir(join(root, dir)).catch(
			() => [] as string[],
		);
		for (const name of names) found.push(`${dir}/${name}/${SKILL_FILE}`);
	}
	return found;
};

/** The record of what is installed: the journal of this layout change. */
const writeRecord = async (
	root: string,
	wanted: ReadonlyMap<string, { plugin: string; content: string }>,
	changes: readonly IPluginSkillChange[],
): Promise<void> => {
	if (changes.length === 0) return;
	const file = recordPath(root, INSTALLED_SKILLS_RECORD);
	await ensureSelfIgnoringDir(dirname(file));
	const entries = [...wanted].map(([path, { plugin, content }]) => ({
		path,
		plugin,
		sourceSha: /sha=([0-9a-f]+) -->\n?$/u.exec(content)?.[1] ?? '',
	}));
	await writeFileAtomic(file, `${JSON.stringify(entries, null, '\t')}\n`);
};

export const syncPluginSkills = async (input: {
	readonly root: string;
	readonly hosts: readonly IAgentHost[];
	readonly skills: readonly IPluginSkillSource[];
	readonly apply?: boolean;
}): Promise<readonly IPluginSkillChange[]> => {
	const apply = input.apply !== false;
	const wanted = wantedFiles(input.hosts, input.skills);
	const changes: IPluginSkillChange[] = [];
	for (const [path, file] of wanted) {
		const absolute = join(input.root, path);
		const existing = await readText(absolute);
		if (existing === file.content) continue;
		const mark =
			existing === undefined ? undefined : readAgentSignature(existing);
		if (
			existing !== undefined &&
			(mark?.kind !== 'plugin-skill' || !mark.untouched)
		) {
			changes.push({ path, plugin: file.plugin, action: 'kept' });
			continue;
		}
		if (apply) {
			await mkdir(dirname(absolute), { recursive: true });
			await writeFileAtomic(absolute, file.content);
		}
		changes.push({
			path,
			plugin: file.plugin,
			action: existing === undefined ? 'created' : 'updated',
		});
	}
	// Every host's folder is swept: a skill whose plugin left, or written
	// for a host the project no longer uses, goes the same way.
	for (const path of await installedPaths(input.root)) {
		if (wanted.has(path)) continue;
		const text = await readText(join(input.root, path));
		const mark = text === undefined ? undefined : readAgentSignature(text);
		if (mark?.kind !== 'plugin-skill') continue;
		if (!mark.untouched) {
			changes.push({ path, plugin: mark.plugin, action: 'kept' });
			continue;
		}
		if (apply) {
			await rm(join(input.root, path), { force: true });
			// The folder goes only when nothing else is in it.
			await rmdir(join(input.root, dirname(path))).catch(() => undefined);
		}
		changes.push({ path, plugin: mark.plugin, action: 'removed' });
	}
	if (apply) await writeRecord(input.root, wanted, changes);
	return changes;
};
