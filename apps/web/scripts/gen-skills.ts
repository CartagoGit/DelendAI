/**
 * gen-skills.ts — emit `src/data/manifests/skills.json`, the catalogue of
 * scaffold skills the site renders at /skills. Scans every owner skill root
 * (core + plugins, resolved through `@mcp-vertex/core`'s `skill-paths.ts`,
 * the single source of truth) for SKILL.md files, extracts YAML frontmatter
 * and a one-line summary.
 *
 *   bun scripts/gen-skills.ts            # write, warn on gaps
 *   bun scripts/gen-skills.ts --strict   # FAIL on parse errors
 */
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { skillOwnerRoots } from '@mcp-vertex/core/public';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const OUT = resolve(HERE, '..', 'src', 'data', 'manifests', 'skills.json');

/** Plugin directory names present in the workspace (each may own a `skills/` root). */
const pluginNames = (): string[] => {
	const pluginsDir = join(ROOT, 'plugins');
	if (!existsSync(pluginsDir)) return [];
	return readdirSync(pluginsDir)
		.filter((name) => statSync(join(pluginsDir, name)).isDirectory())
		.sort((a, b) => a.localeCompare(b));
};

interface ISkill {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly plugin: string;
	readonly summary: string;
	readonly path: string;
}

const slugFromPath = (relPath: string): string => {
	const segs = relPath.split('/');
	// owner shapes: the skill slug is the segment that follows the `skills`
	// anchor, e.g. `skills/<slug>/SKILL.md`,
	// `packages/core/skills/<slug>/SKILL.md`,
	// `plugins/<plugin>/skills/<slug>/SKILL.md`.
	const skillsIdx = segs.indexOf('skills');
	if (skillsIdx >= 0 && segs.length > skillsIdx + 1)
		return segs[skillsIdx + 1] as string;
	// legacy repo shape: docs/mcp-vertex/skills/<slug>/SKILL.md handled above
	// via the `skills` anchor; fall back to the first segment otherwise.
	return segs[0] as string;
};

const parseFrontmatter = (text: string): Record<string, string> => {
	const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!m) return {};
	const yaml = m[1] ?? '';
	const lines = yaml.split('\n');
	const out: Record<string, string> = {};
	for (const line of lines) {
		const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.+?)\s*$/);
		if (kv) {
			const key = kv[1] as string;
			const value = (kv[2] as string).replace(/^['"]|['"]$/g, '');
			out[key] = value;
		}
	}
	return out;
};

const firstSentence = (body: string): string => {
	const cleaned = body.replace(/^#+\s.*$/gm, '').trim();
	const first = cleaned.split(/\.\s/)[0] ?? cleaned;
	return first.length > 220 ? `${first.slice(0, 217)}…` : first;
};

/**
 * Recursive skill walker. The top-level call is invoked with a
 * `dir` — typically `<repo>/docs/mcp-vertex/skills` from the CLI, or any path
 * under which SKILL.md files are arranged as `<dir>/<name>/SKILL.md`.
 *
 * The internal `anchor` is the basename of the original `dir`
 * (e.g. `skills`) and `relPrefix` is the relative path from the
 * original `dir` to the current `dir`. Both are threaded through
 * recursion so the emitted `path` always has the well-known shape
 * `<anchor>/<plugin>/SKILL.md` (and `<anchor>/<plugin>/sub/SKILL.md`
 * for nested layouts). That's the shape `slugFromPath` expects
 * (it splits on `/` and reads the second segment as the plugin
 * slug) and the shape the GitHub link
 * `${repo}/blob/main/${s.path}` in `SkillsSection.astro` needs.
 */
const walkSkills = (dir: string, anchor = basenameOf(dir)): ISkill[] => {
	if (!existsSync(dir)) return [];
	return walkSkillsInternal(dir, anchor, '');
};

const walkSkillsInternal = (
	dir: string,
	anchor: string,
	relPrefix: string,
): ISkill[] => {
	if (!existsSync(dir)) return [];
	const out: ISkill[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const st = statSync(full);
		if (st.isDirectory()) {
			out.push(
				...walkSkillsInternal(full, anchor, `${relPrefix}${entry}/`),
			);
			continue;
		}
		if (st.isFile() && entry === 'SKILL.md') {
			const text = readFileSync(full, 'utf8');
			const fm = parseFrontmatter(text);
			const rel = `${anchor}/${relPrefix}${entry}`;
			out.push({
				id: fm.id ?? slugFromPath(rel),
				name: fm.name ?? entry,
				description: fm.description ?? '',
				plugin: slugFromPath(rel),
				summary: firstSentence(
					text.split(/^---\n[\s\S]*?\n---\n/)[1] ?? '',
				),
				path: rel,
			});
		}
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
};

/** Last non-empty path segment of `p`, with back-slashes normalised. */
const basenameOf = (p: string): string => {
	const norm = p.replace(/\\/g, '/').replace(/\/+$/, '');
	const segs = norm.split('/').filter((s) => s.length > 0);
	return segs[segs.length - 1] ?? '';
};

/** Exported for tests (l106 s1). Same semantics as the internal walker. */
export const walkSkillsForTest = walkSkills;

const main = (): void => {
	const strict = process.argv.includes('--strict');
	const roots = skillOwnerRoots(pluginNames());
	const skills = roots
		.flatMap((rel) => walkSkills(join(ROOT, ...rel.split('/')), rel))
		.sort((a, b) => a.name.localeCompare(b.name));
	if (skills.length === 0) {
		const msg = `no SKILL.md files found under any owner skill root (${roots.join(', ')})`;
		if (strict) {
			console.error(`✖ gen-skills (strict): ${msg}`);
			process.exit(1);
		}
		console.warn(`⚠ gen-skills: ${msg}`);
	}
	mkdirSync(dirname(OUT), { recursive: true });
	writeFileSync(
		OUT,
		`${JSON.stringify({ generatedAt: new Date().toISOString(), skills }, null, 2)}\n`,
	);
	console.log(`wrote ${OUT} — ${skills.length} skill(s).`);
};

main();
