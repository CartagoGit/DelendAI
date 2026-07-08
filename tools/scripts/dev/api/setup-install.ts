/**
 * `tools/scripts/dev/api/setup-install.ts` — server-side auto-install.
 * Drops a minimal `.vscode/mcp.json` + `.vscode/settings.json` pair so
 * the dev preview can spawn the MCP server.
 *
 * Why a server-side helper instead of the browser? Two reasons:
 *   1. The browser bundle cannot import `node:fs` (the cross-spawn
 *      contract forbids it, same reason as the dashboard real-data
 *      path).
 *   2. Writing workspace files is an action the user must explicitly
 *      approve, so the browser renders a confirmation panel and POSTs
 *      `/api/setup/install` on click. The server performs the actual
 *      writes atomically.
 *
 * Safety rules (f00098 S5 lesson learned the hard way):
 *   - The existing file is ONLY patched if JSON.parse succeeds.
 *   - Files with comments / trailing commas / BOMs are LEFT ALONE —
 *     they parse with `Bun.file().json()` (Bun tolerates all of those)
 *     but we still refuse to write if the file already declares the
 *     section we want to add. Prevents accidental clobbering of
 *     user-curated `.vscode/settings.json` (which is typically full
 *     of comments).
 *   - When a section is missing, we add ONLY that section and never
 *     touch the rest of the file (text-level splice), preserving
 *     comments, key order, and indentation.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface IInstallResult {
	readonly ok: boolean;
	readonly written: readonly string[];
	readonly skipped: readonly string[];
	readonly note: string;
}

const ensureDir = (path: string): void => {
	if (!existsSync(path)) mkdirSync(path, { recursive: true });
};

const tryParse = (raw: string): Record<string, unknown> | null => {
	// Strip JS line + block comments and a leading BOM, then parse.
	// VS Code's `.vscode/settings.json` is JSON-with-comments (jsonc);
	// JSON.parse would choke on `// foo` lines, so we strip them
	// before parsing. Trailing commas also break JSON.parse; we
	// strip them too. The original file is preserved on disk — we
	// only strip in memory.
	const cleaned = raw
		.replace(/^\uFEFF/, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/(^|[^:])\/\/.*$/gm, '$1')
		.replace(/,(\s*[}\]])/g, '$1');
	try {
		return JSON.parse(cleaned) as Record<string, unknown>;
	} catch {
		return null;
	}
};

const hasKey = (obj: Record<string, unknown>, dotted: string): boolean => {
	const parts = dotted.split('.');
	let cursor: unknown = obj;
	for (const p of parts) {
		if (cursor === null || typeof cursor !== 'object') return false;
		cursor = (cursor as Record<string, unknown>)[p];
	}
	return cursor !== undefined;
};

const writeNewFile = (path: string, body: Record<string, unknown>): void => {
	writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
};

const spliceKeyIntoFile = (
	path: string,
	dotted: string,
	value: unknown,
): boolean => {
	const raw = readFileSync(path, 'utf8');
	// Compute insertion: find the matching top-level key (or root key
	// for nested paths) and append a new key block. Naive but safe —
	// works for the simple mcp-vertex patches we emit, and refuses
	// (returns false) if anything looks unusual so the operator can
	// inspect manually.
	const topKey = dotted.split('.')[0] ?? '';
	if (!topKey) return false;

	// Walk the JSON tree by tracking brace depth and string literals.
	// We want the index of the closing `}` that pairs with the file's
	// first `{` (the root object) — NOT the first `}` we see (which
	// might close a nested block like `"Bash (login)": { ... }`).
	let depth = 0;
	let rootStart = -1;
	let rootEnd = -1;
	let inString = false;
	let escaped = false;
	for (let i = 0; i < raw.length; i++) {
		const ch = raw[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === '\\') escaped = true;
			else if (ch === '"') inString = false;
			continue;
		}
		if (ch === '"') {
			inString = true;
			continue;
		}
		if (ch === '{') {
			if (rootStart === -1) rootStart = i;
			depth++;
			continue;
		}
		if (ch === '}') {
			depth--;
			if (depth === 0 && rootStart !== -1) {
				rootEnd = i;
				break;
			}
		}
	}
	if (rootStart === -1 || rootEnd === -1) return false;

	const before = raw.slice(0, rootEnd);
	const after = raw.slice(rootEnd);

	// Trim trailing whitespace inside the root object so we can decide
	// whether the previous key already has a trailing comma.
	const trimmedBefore = before.replace(/\s+$/, '');
	const lastChar = trimmedBefore[trimmedBefore.length - 1] ?? '';
	const needsComma = lastChar !== '{' && lastChar !== ',';

	const nested = dotted.includes('.');
	// For dotted paths (`mcp-vertex.server`) we emit a single flat key
	// — JSON keys are arbitrary strings, the dot is just a character, so
	// `"mcp-vertex.server": { … }` is valid JSON-with-comments and is
	// what VS Code expects when reading `mcp-vertex.server.command`.
	const serialized = nested
		? `${JSON.stringify(dotted)}: ${JSON.stringify(value, null, 2)
				.split('\n')
				.map((l, i) => (i === 0 ? l : '  ' + l))
				.join('\n')}`
		: `${JSON.stringify(topKey)}: ${JSON.stringify(value)}`;

	const insertion = `${needsComma ? ',' : ''}\n${serialized}\n`;
	writeFileSync(path, `${trimmedBefore}${insertion}${after}`);
	return true;
};

/**
 * Insert `entryKey: entryValue` INSIDE the top-level object named
 * `parentKey`, preserving everything else (comments, key order,
 * sibling whitespace). Refuses (returns false) if `parentKey` is
 * missing or not an object — the caller is expected to skip the
 * file rather than overwrite it.
 *
 * The walker mirrors `spliceKeyIntoFile`'s approach: track brace
 * depth + string literals so nested braces (e.g. inside a string
 * `"foo": "}"}`) do not fool the depth counter. We find the FIRST
 * `{` after `"parentKey":` (that's the parent object's opening),
 * then balance braces to find the matching `}`. Insertion happens
 * before that closing brace, with a comma if the parent object is
 * not empty.
 */
const spliceIntoNestedObject = (
	path: string,
	parentKey: string,
	entryKey: string,
	entryValue: unknown,
): boolean => {
	const raw = readFileSync(path, 'utf8');
	const needle = `"${parentKey}"`;
	const idx = raw.indexOf(needle);
	if (idx === -1) return false;
	const afterKey = raw.indexOf('{', idx + needle.length);
	if (afterKey === -1) return false;
	let depth = 1;
	let i = afterKey + 1;
	let inString = false;
	let escaped = false;
	for (; i < raw.length; i++) {
		const ch = raw[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === '\\') escaped = true;
			else if (ch === '"') inString = false;
			continue;
		}
		if (ch === '"') {
			inString = true;
			continue;
		}
		if (ch === '{') depth++;
		else if (ch === '}') {
			depth--;
			if (depth === 0) break;
		}
	}
	if (depth !== 0) return false;
	// `i` is the index of the matching closing `}` for the parent.
	const before = raw.slice(0, i);
	const after = raw.slice(i);
	const trimmedBefore = before.replace(/\s+$/, '');
	const lastChar = trimmedBefore[trimmedBefore.length - 1] ?? '';
	const needsComma = lastChar !== '{' && lastChar !== ',';
	const serialized = `\n  ${JSON.stringify(entryKey)}: ${JSON.stringify(
		entryValue,
		null,
		2,
	)
		.split('\n')
		.map((l) => '  ' + l)
		.join('\n')}\n`;
	writeFileSync(
		path,
		`${trimmedBefore}${needsComma ? ',' : ''}${serialized}${after}`,
	);
	return true;
};

export const runSetupInstall = (cwd: string): IInstallResult => {
	ensureDir(join(cwd, '.vscode'));

	const mcpPath = join(cwd, '.vscode', 'mcp.json');
	const settingsPath = join(cwd, '.vscode', 'settings.json');
	const configPath = join(cwd, 'mcp-vertex.config.json');

	const mcpPatch = {
		servers: {
			'mcp-vertex': {
				type: 'stdio',
				command: 'bun',
				args: ['run', 'mcp-vertex'],
			},
		},
	};
	const settingsPatch = {
		command: 'bun',
		args: ['run', 'mcp-vertex'],
	};
	// Mirror the repo's own `mcp-vertex.config.json` so a fresh install
	// can launch a useful plugin surface (overview / metrics / memory
	// / proposals / quality / rules). Users can edit this freely; the
	// install is fully idempotent.
	const configPatch = {
		preset: 'core',
		plugins: [
			'core',
			'memory',
			'proposals',
			'search',
			'logs',
			'quality',
			'rules',
		],
		namespacePrefix: 'mcp-vertex',
	};

	const written: string[] = [];
	const skipped: string[] = [];

	// .vscode/mcp.json
	if (!existsSync(mcpPath)) {
		writeNewFile(mcpPath, mcpPatch);
		written.push(relative(cwd, mcpPath));
	} else {
		const parsed = tryParse(readFileSync(mcpPath, 'utf8'));
		if (parsed === null) {
			skipped.push(relative(cwd, mcpPath) + ' (unparseable)');
		} else if (hasKey(parsed, 'servers.mcp-vertex')) {
			skipped.push(relative(cwd, mcpPath) + ' (already declared)');
		} else {
			// Existing mcp.json without the mcp-vertex server, with valid
			// JSON. Splice the new server entry inside the `servers` object
			// instead of a full-file rewrite, so comments / sibling servers
			// / formatting stay intact. Refuse to write anything if either:
			//   - `servers` is not an object in the existing file, or
			//   - the text-level brace walker cannot locate its closing `}`.
			const serversObj = parsed.servers;
			if (
				typeof serversObj !== 'object' ||
				serversObj === null ||
				Array.isArray(serversObj)
			) {
				skipped.push(
					relative(cwd, mcpPath) +
						' (existing "servers" is missing or not an object; add the mcp-vertex entry manually)',
				);
			} else {
				const ok = spliceIntoNestedObject(
					mcpPath,
					'servers',
					'mcp-vertex',
					mcpPatch.servers['mcp-vertex'],
				);
				if (ok) written.push(relative(cwd, mcpPath));
				else
					skipped.push(
						relative(cwd, mcpPath) +
							' (could not locate the servers object; add the mcp-vertex entry manually)',
					);
			}
		}
	}

	// .vscode/settings.json
	if (!existsSync(settingsPath)) {
		writeNewFile(settingsPath, { 'mcp-vertex.server': settingsPatch });
		written.push(relative(cwd, settingsPath));
	} else {
		const parsed = tryParse(readFileSync(settingsPath, 'utf8'));
		if (parsed === null) {
			skipped.push(relative(cwd, settingsPath) + ' (unparseable)');
		} else if (hasKey(parsed, 'mcp-vertex.server')) {
			skipped.push(relative(cwd, settingsPath) + ' (already declared)');
		} else {
			const ok = spliceKeyIntoFile(
				settingsPath,
				'mcp-vertex.server',
				settingsPatch,
			);
			if (ok) written.push(relative(cwd, settingsPath));
			else skipped.push(relative(cwd, settingsPath) + ' (splice failed)');
		}
	}

	// mcp-vertex.config.json — only create when missing. Existing
	// configs (the user's curated preset) are left alone.
	if (!existsSync(configPath)) {
		writeNewFile(configPath, configPatch);
		written.push(relative(cwd, configPath));
	} else {
		skipped.push(relative(cwd, configPath) + ' (already exists)');
	}

	const note =
		skipped.length === 0
			? 'Wrote the missing mcp-vertex files. Refresh the preview to start fetching real data.'
			: `Some files were skipped: ${skipped.join(', ')}. No existing content was modified.`;

	return { ok: true, written, skipped, note };
};
