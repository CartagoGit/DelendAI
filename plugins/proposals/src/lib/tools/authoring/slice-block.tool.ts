import { escapeRegExp } from '../../shared/string-helpers';

// emit the canonical slice shape the repo linter validates
// (`**Status**`/`**Files**`/`**Gate**` bullets); the plan parser reads
// both this and the legacy lowercase form.
// The repo linter only accepts uppercase slice headings (`### S1 — …`),
// so normalise whatever case the caller passed (a00053: callers passing
// `s1` produced documents the linter rejected).
export const canonicalSliceId = (id: string): string =>
	id.replace(/^s(?=\d)/, 'S');

/**
 * Pull just the `### S<n>` slice block for the gate probe. Mirrors the
 * slice-block matcher used inside the file-mutex write so a slice that
 * is in the proposal file lights up the gate check.
 */
export const extractSliceBlockForGate = (
	markdown: string,
	canonicalId: string,
): string | null => {
	const escaped = canonicalId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const re = new RegExp(
		`(^### ${escaped}\\s+[^\\n]*\\n)([\\s\\S]*?)(?=^### |^## (?!#)|\\n*$(?![\\s\\S]))`,
		'm',
	);
	const m = markdown.match(re);
	return m === null ? null : (m[2] ?? null);
};

/**
 * Regex fragment matching a slice id in either case (`s1`/`S1`), so
 * close_slice keeps finding blocks in legacy lowercase documents and in
 * the canonical uppercase form regardless of how the caller spelled it.
 */
export const sliceIdPattern = (id: string): string =>
	/^[sS]\d+$/.test(id)
		? `[sS]${escapeRegExp(id.slice(1))}`
		: escapeRegExp(id);

/** A slice a reviewer sent back is work to do again, whatever it claimed. */
export const flipSliceStatusPending = (block: string): string =>
	block
		.replace(/^([-*]\s*\*\*Status\*\*:).*$/m, '$1 pending')
		.replace(/^([-*]\s*status:).*$/m, '$1 pending');

export const isSliceStatusDone = (block: string): boolean =>
	/^[-*]\s*\*\*Status\*\*:\s*done\s*$/im.test(block) ||
	/^[-*]\s*status:\s*done\s*$/im.test(block);

/**
 * a00069 S5 — strict variant: does this slice block require a FRESH
 * validate before close_slice may flip it? True only for the hard gates
 * (`type` / `e2e`). Free-form gates like `bun run validate`, lint, or
 * acceptance-list commands are NOT enforced by this helper — those live
 * behind the integration gate (`validationScope: 'global'`).
 */
export const gateHardRequiresValidate = (block: string): boolean => {
	const gateMatch = block.match(
		/^[-*]\s*(?:\*\*Gate\*\*|gate):\s*([^\n]+)$/im,
	);
	const gate = (gateMatch?.[1] ?? 'none').trim().toLowerCase();
	return gate === 'type' || gate === 'e2e';
};

/**
 * a00069 S5 — does this slice block require a green `bun run validate`
 * (or the host's `validationCommand`) before close_slice may flip it?
 *
 * Require when gate is `type` / `e2e`. Skip bare `none` / `lint` unless
 * the slice's acceptance section lists a full-suite command (`bun test`,
 * `bun run validate`, or the host `validationCommand`).
 */
export const sliceRequiresValidation = (
	block: string,
	validationCommand = 'bun run validate',
): boolean => {
	const gateMatch = block.match(
		/^[-*]\s*(?:\*\*Gate\*\*|gate):\s*([^\n]+)$/im,
	);
	const gate = (gateMatch?.[1] ?? 'none').trim().toLowerCase();
	if (gate === 'type' || gate === 'e2e') return true;
	// Free-form gates that explicitly demand full validate (proposal docs
	// often write `- **Gate**: bun run validate`).
	if (
		gate !== 'none' &&
		gate !== 'lint' &&
		(gate.includes('validate') ||
			gate.includes('bun run test') ||
			gate === 'test')
	) {
		return true;
	}

	// Acceptance surfaces (any of):
	//   - acceptance:
	//       - bun run validate
	//   - **Acceptance**: bun run test
	//   - { command: bun run validate, expect: exit0 }
	const needles = [
		validationCommand.toLowerCase(),
		'bun run validate',
		'bun run test',
		'bun test',
	];
	const blockLower = block.toLowerCase();
	// YAML-style criterion objects anywhere in the slice block.
	if (
		needles.some(
			(n) =>
				blockLower.includes(`command: ${n}`) ||
				blockLower.includes(`command:${n}`),
		)
	) {
		return true;
	}
	// Narrative **Acceptance** / acceptance bullets.
	const acceptLines = [
		...block.matchAll(
			/^[-*]\s*(?:\*\*Acceptance\*\*|acceptance):\s*([^\n]+)$/gim,
		),
	].map((m) => (m[1] ?? '').trim().toLowerCase());
	if (acceptLines.some((line) => needles.some((n) => line.includes(n)))) {
		return true;
	}
	// Nested acceptance list under a bare `acceptance:` header.
	const acceptSection = block.match(
		/^[-*]\s*acceptance:\s*\n((?:\s+[-*].*\n?)*)/im,
	);
	const acceptBody = acceptSection?.[1] ?? '';
	const nested = [
		...acceptBody.matchAll(/^\s+[-*]\s+"?([^"\n]+)"?\s*$/gm),
	].map((m) => (m[1] ?? '').trim().toLowerCase());
	return nested.some((line) => needles.some((n) => line.includes(n)));
};

/**
 * x00098 S2: the linter's status vocabulary is hyphenated and every
 * status lives in its own folder. Accept the historical underscore
 * spelling on input but never write it; `pending` (not a linter status)
 * authors as `ready`.
 */
export const canonicalStatus = (
	status: string | undefined,
): 'ready' | 'in-progress' => {
	if (status === 'in_progress' || status === 'in-progress')
		return 'in-progress';
	return 'ready';
};
