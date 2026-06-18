/**
 * gen-skills.ts — emit `src/data/skills.json`, the catalogue of scaffold
 * skills the site renders at /skills. Scans the repo's `skills/` directory
 * for SKILL.md files, extracts YAML frontmatter and a one-line summary.
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

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const SKILLS_DIR = join(ROOT, 'skills');
const OUT = resolve(HERE, '..', 'src', 'data', 'skills.json');

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
	// expected shape: skills/<plugin>/SKILL.md
	if (segs[0] === 'skills' && segs.length >= 3) return segs[1] as string;
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

const walkSkills = (dir: string): ISkill[] => {
	if (!existsSync(dir)) return [];
	const out: ISkill[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const st = statSync(full);
		if (st.isFile() && entry === 'SKILL.md') {
			const text = readFileSync(full, 'utf8');
			const fm = parseFrontmatter(text);
			const rel = `skills/${entry}`;
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

const main = (): void => {
	const strict = process.argv.includes('--strict');
	const skills = walkSkills(SKILLS_DIR);
	if (skills.length === 0) {
		const msg = 'no SKILL.md files found under skills/';
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
