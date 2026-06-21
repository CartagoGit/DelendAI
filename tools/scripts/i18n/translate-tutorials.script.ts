#!/usr/bin/env bun
/**
 * translate-tutorials.script.ts — f124 s2 (port of scripts/translate-tutorials.sh).
 *
 * For each existing EN tutorial under plugins/<name>/tutorials/en/*.md,
 * copy it to the 11 other locales (es, fr, de, pt, it, zh, hi, ar,
 * ja, vi, th). The body is copied verbatim from EN; only the
 * frontmatter is rewritten to flag the file as auto-translated
 * and human-review pending. A real translation pass (manual or
 * LLM) replaces the body later.
 *
 * Usage: bun tools/scripts/i18n/translate-tutorials.script.ts
 * Idempotent: re-running overwrites the same files. Safe to run
 * after a tutorial is added/changed in EN.
 *
 * Does NOT touch EN files (those are the source of truth).
 * Does NOT touch the discoverer (apps/web/scripts/lib/discover-tutorials.ts)
 * — that already handles arbitrary lang directories.
 */
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const REPO_ROOT = process.cwd();

const LANGS = [
	'es', // Español
	'fr', // Français
	'de', // Deutsch
	'pt', // Português
	'it', // Italiano
	'zh', // 中文
	'hi', // हिन्दी
	'ar', // العربية
	'ja', // 日本語
	'vi', // Tiếng Việt
	'th', // ไทย
] as const;

const LANGS_DISPLAY: Readonly<Record<(typeof LANGS)[number], string>> = {
	es: 'Español',
	fr: 'Français',
	de: 'Deutsch',
	pt: 'Português',
	it: 'Italiano',
	zh: '中文',
	hi: 'हिन्दी',
	ar: 'العربية',
	ja: '日本語',
	vi: 'Tiếng Việt',
	th: 'ไทย',
};

/** Recursive walk that mirrors `find plugins -path ...tutorials.en...md -type f`. */
const findEnTutorials = async (root: string): Promise<readonly string[]> => {
	const out: string[] = [];
	const entries = await readdir(root, { withFileTypes: true }).catch(
		() => [],
	);
	for (const entry of entries) {
		const abs = join(root, entry.name);
		if (entry.isDirectory()) {
			out.push(...(await findEnTutorials(abs)));
		} else if (
			entry.isFile() &&
			/tutorials[\\/]+en[\\/]+.+\.md$/.test(abs)
		) {
			out.push(abs);
		}
	}
	return out;
};

/** Strip the leading `---` block and return the body that follows. */
const stripFrontmatter = (markdown: string): string => {
	const lines = markdown.split('\n');
	if (lines[0]?.trim() !== '---') return markdown;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i]?.trim() === '---') {
			// Skip the closing `---` line and the blank line after it
			// (the original awk emits an extra newline before the body).
			return lines
				.slice(i + 1)
				.join('\n')
				.replace(/^\n+/, '');
		}
	}
	// Unterminated frontmatter — return the body verbatim.
	return markdown;
};

/** Extract the first `title:` value from a markdown frontmatter (single-line by repo convention). */
const extractEnTitle = (markdown: string): string => {
	const match = markdown.match(/^title:\s*(.+)$/m);
	return match?.[1]?.trim() ?? '';
};

const buildSkeleton = (params: {
	readonly srcAbs: string;
	readonly plugin: string;
	readonly topic: string;
	readonly lang: (typeof LANGS)[number];
	readonly enTitle: string;
	readonly body: string;
	readonly nowIso: string;
}): string => {
	const { srcAbs, plugin, topic, lang, enTitle, body, nowIso } = params;
	const display = LANGS_DISPLAY[lang];
	const srcRel = relative(REPO_ROOT, srcAbs);
	const frontmatter = [
		'---',
		`title: "${enTitle} [${display} — needs translation]"`,
		`plugin: ${plugin}`,
		'audience: any agent that needs cross-session continuity',
		'order: 1',
		`lang: ${lang}`,
		'auto-translated: true',
		'needs-human-review: true',
		`source: ${srcRel}`,
		`generated: ${nowIso}`,
		'---',
		'',
	].join('\n');
	const banner = [
		'',
		`> **TRANSLATION PENDING** — This is the EN source copied`,
		'> verbatim. A human (or your preferred translation tool) must',
		`> replace the body above with a proper ${display}`,
		'> translation. The `needs-human-review: true` and',
		'> `auto-translated: true` frontmatter flags must be removed',
		'> when the translation is finalised. See',
		'> `tools/scripts/i18n/translate-tutorials.script.ts` for the bootstrap process.',
		'>',
		`> Source: \`${srcRel}\``,
		'',
	].join('\n');
	return `${frontmatter}\n${body}\n${banner}`;
};

const main = async (): Promise<number> => {
	const enTutorials = (
		await findEnTutorials(join(REPO_ROOT, 'plugins'))
	).sort();
	if (enTutorials.length === 0) {
		console.error(
			'No EN tutorials found under plugins/*/tutorials/en/. Aborting.',
		);
		return 1;
	}

	const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z');
	let created = 0;

	for (const srcAbs of enTutorials) {
		// `srcAbs` looks like `<root>/plugins/<plugin>/tutorials/en/<topic>.md`.
		const rel = relative(REPO_ROOT, srcAbs);
		const parts = rel.split(/[\\/]/u);
		const plugin = parts[1] ?? '';
		const topic = parts[parts.length - 1]?.replace(/\.md$/u, '') ?? '';
		if (!plugin || !topic) {
			console.error(`Skipping malformed path: ${rel}`);
			continue;
		}
		const src = await Bun.file(srcAbs).text();
		const enTitle = extractEnTitle(src);
		const body = stripFrontmatter(src);

		for (const lang of LANGS) {
			const dstDir = join(
				REPO_ROOT,
				'plugins',
				plugin,
				'tutorials',
				lang,
			);
			const dst = join(dstDir, `${topic}.md`);
			await Bun.$`mkdir -p ${dstDir}`.quiet();
			const skeleton = buildSkeleton({
				srcAbs,
				plugin,
				topic,
				lang,
				enTitle,
				body,
				nowIso,
			});
			await Bun.write(dst, skeleton);
			created += 1;
		}
	}

	const pluginCount = new Set(
		enTutorials.map((p) => relative(REPO_ROOT, p).split(/[\\/]/u)[1]),
	).size;
	console.log(
		`Created/refreshed ${created} tutorial skeletons across ${pluginCount} plugins × ${LANGS.length} languages.`,
	);
	console.log('');
	console.log('Next steps (for each of the 11 languages):');
	console.log('  1. Open plugins/<plugin>/tutorials/<lang>/<topic>.md,');
	console.log('     translate the body (keeping code blocks / MCP tool');
	console.log('     calls / file paths / JSON examples intact), and remove');
	console.log("     the 'TRANSLATION PENDING' notice + the");
	console.log("     'auto-translated: true' / 'needs-human-review: true'");
	console.log('     frontmatter keys.');
	console.log('  2. Optional follow-up: add a tutorial gate to');
	console.log('     apps/web/scripts/check-i18n.ts that fails when any');
	console.log("     tutorial still has 'needs-human-review: true'.");
	console.log(
		'  3. git add plugins/*/tutorials/{es,fr,de,pt,it,zh,hi,ar,ja,vi,th}/ tools/scripts/i18n/translate-tutorials.script.ts',
	);
	console.log(
		"     git commit -m 'feat(plugins): bootstrap 11-language tutorial skeletons'",
	);
	return 0;
};

process.exit(await main());
