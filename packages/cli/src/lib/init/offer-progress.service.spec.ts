/**
 * offer-progress.service.spec.ts — while clients are asked, a terminal
 * sees who is pending and for how long; elsewhere, plain lines.
 */
import { describe, expect, it } from 'vitest';

import { offerProgress } from './offer-progress.service';

const stream = (isTTY: boolean) => {
	const written: string[] = [];
	return { written, isTTY, write: (text: string) => written.push(text) };
};

describe('offerProgress', () => {
	it('keeps a live line of pending clients at a terminal, and a line per answer', () => {
		const out = stream(true);
		const progress = offerProgress(out);
		progress.client({
			command: 'claude',
			label: 'Claude Code',
			phase: 'asking',
		});
		progress.client({ command: 'codex', label: 'Codex', phase: 'asking' });
		progress.client({
			command: 'claude',
			label: 'Claude Code',
			phase: 'answered',
			verdict: 'usable',
			ms: 900,
		});
		progress.client({
			command: 'gemini',
			label: 'Gemini',
			phase: 'answered',
			verdict: 'not-installed',
			ms: 40,
		});
		progress.stop();
		const text = out.written.join('');
		expect(text).toContain('asking claude, codex…');
		expect(text).toContain('✓ Claude Code: logged in, 0.9 s');
		expect(text).not.toContain('Gemini');
		expect(out.written.at(-1)).toBe('\r\x1b[2K');
	});

	it('writes plain lines and no control characters without a terminal', () => {
		const out = stream(false);
		const progress = offerProgress(out);
		progress.step('the AI clients installed here');
		progress.client({ command: 'codex', label: 'Codex', phase: 'asking' });
		progress.client({
			command: 'codex',
			label: 'Codex',
			phase: 'answered',
			verdict: 'needs-login',
			ms: 220,
		});
		progress.stop();
		expect(out.written).toEqual([
			'  · the AI clients installed here\n',
			'    · Codex: not logged in, 0.2 s\n',
		]);
	});
});
