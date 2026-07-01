/**
 * _code-copy-controller.ts — wires up every `data-copy-target` button in
 * the document. Clicks copy the text content of the matching `<code>` to
 * the clipboard (modern API + execCommand fallback) and visually confirm
 * for 1.5s. Idempotent.
 */
const FLASH_MS = 1500;

export const initCopyButtons = (root: ParentNode): void => {
	const buttons = root.querySelectorAll<HTMLButtonElement>(
		'[data-copy-target], [data-copy-text]',
	);
	for (const btn of buttons) {
		if (btn.dataset.copyBound === '1') continue;
		btn.dataset.copyBound = '1';
		btn.addEventListener('click', () => {
			let text: string | null = null;
			const targetId = btn.dataset.copyTarget;
			if (targetId) {
				const code = document.getElementById(targetId);
				text = code?.textContent ?? null;
			} else if (btn.dataset.copyText !== undefined) {
				text = btn.dataset.copyText;
			}
			if (text === null) return;
			void copy(text).then((ok) => {
				if (!ok) return;
				const idle = btn.querySelector<HTMLElement>(
					'[data-copy-label="idle"]',
				);
				const idleText = idle?.textContent ?? '';
				btn.dataset.state = 'copied';
				btn.setAttribute('aria-live', 'polite');
				if (idle)
					idle.textContent =
						btn.getAttribute('data-copied-label') ?? 'Copied!';
				window.setTimeout(() => {
					btn.removeAttribute('data-state');
					if (idle) idle.textContent = idleText;
				}, FLASH_MS);
			});
		});
	}
};

const copy = async (text: string): Promise<boolean> => {
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch {
		// fall through to execCommand fallback
	}
	try {
		const ta = document.createElement('textarea');
		ta.value = text;
		ta.setAttribute('readonly', '');
		ta.style.position = 'absolute';
		ta.style.left = '-9999px';
		document.body.appendChild(ta);
		ta.select();
		// @ts-ignore
		const ok = document.execCommand('copy');
		document.body.removeChild(ta);
		return ok;
	} catch {
		return false;
	}
};
