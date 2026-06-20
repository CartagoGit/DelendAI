#!/usr/bin/env bash
# translate-tutorials.sh — p110 s3 bootstrap.
#
# For each existing EN tutorial under plugins/<name>/tutorials/en/*.md,
# copy it to the 11 other locales (es, fr, de, pt, it, zh, hi, ar,
# ja, vi, th). The body is copied verbatim from EN; only the
# frontmatter is rewritten to flag the file as auto-translated
# and human-review pending. A real translation pass (manual or
# LLM) replaces the body later.
#
# Usage: bun scripts/translate-tutorials.sh
# Idempotent: re-running overwrites the same files. Safe to run
# after a tutorial is added/changed in EN.
#
# Does NOT touch EN files (those are the source of truth).
# Does NOT touch the discoverer (apps/web/scripts/lib/discover-tutorials.ts)
# — that already handles arbitrary lang directories.

set -euo pipefail

LANGS=(
	es # Español
	fr # Français
	de # Deutsch
	pt # Português
	it # Italiano
	zh # 中文
	hi # हिन्दी
	ar # العربية
	ja # 日本語
	vi # Tiếng Việt
	th # ไทย
)

# Frontmatter rewrites. Plugin and audience are bilingual
# shorthand (EN), title is a placeholder that the translator
# will replace. order is preserved.
declare -A LANGS_DISPLAY=(
	[es]="Español"
	[fr]="Français"
	[de]="Deutsch"
	[pt]="Português"
	[it]="Italiano"
	[zh]="中文"
	[hi]="हिन्दी"
	[ar]="العربية"
	[ja]="日本語"
	[vi]="Tiếng Việt"
	[th]="ไทย"
)

# Find every EN tutorial.
EN_TUTORIALS=$(find plugins -path '*/tutorials/en/*.md' -type f | sort)

if [ -z "$EN_TUTORIALS" ]; then
	echo "No EN tutorials found under plugins/*/tutorials/en/. Aborting." >&2
	exit 1
fi

# Per-language title suffix: the original EN title stays
# recognisable so the translator can map the file to its
# source.
CREATED=0
for src in $EN_TUTORIALS; do
	# `src` looks like `plugins/<plugin>/tutorials/en/<topic>.md`.
	plugin=$(echo "$src" | cut -d/ -f2)
	topic=$(basename "$src" .md)

	# Extract the EN title from the frontmatter (one-liner
	# grep; the EN titles are single-line by repo convention).
	en_title=$(grep -m1 '^title:' "$src" | sed -E 's/^title:\s*//')

	for lang in "${LANGS[@]}"; do
		dst_dir="plugins/${plugin}/tutorials/${lang}"
		dst="${dst_dir}/${topic}.md"
		mkdir -p "$dst_dir"

		# Strategy: copy the EN body verbatim under a translated
		# frontmatter + a "TRANSLATION PENDING" banner. The body
		# stays in EN (with code blocks, MCP tool calls, file paths,
		# JSON examples) until a human/LLM rewrites it in the
		# target language. Keeping the body in EN verbatim is
		# intentional: it gives the translator full context to
		# rewrite, and the auto-translated flag makes it explicit
		# that nothing was machine-translated.
		{
			cat <<EOF
---
title: "${en_title} [${LANGS_DISPLAY[$lang]} — needs translation]"
plugin: ${plugin}
audience: any agent that needs cross-session continuity
order: 1
lang: ${lang}
auto-translated: true
needs-human-review: true
source: ${src}
generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)
---

EOF
			# Strip the EN frontmatter (between the first pair of
			# `---`) and prepend a "TRANSLATION PENDING" banner
			# to the body, then append the rest of the EN body.
			awk 'BEGIN { in_fm=0; past_fm=0 } /^---$/ {
				if (in_fm == 0) { in_fm = 1; next }
				if (past_fm == 0) { past_fm = 1; print ""; next }
			} past_fm == 1 { print }
			' "$src"
			cat <<EOF

> **TRANSLATION PENDING** — This is the EN source copied
> verbatim. A human (or your preferred translation tool) must
> replace the body above with a proper ${LANGS_DISPLAY[$lang]}
> translation. The \`needs-human-review: true\` and
> \`auto-translated: true\` frontmatter flags must be removed
> when the translation is finalised. See
> \`scripts/translate-tutorials.sh\` for the bootstrap process.
>
> Source: \`${src}\`

EOF
		} > "$dst"
		CREATED=$((CREATED + 1))
	done
done

echo "Created/refreshed ${CREATED} tutorial skeletons across 5 plugins × 11 languages."
echo ""
echo "Next steps (for each of the 11 languages):"
echo "  1. Open plugins/<plugin>/tutorials/<lang>/<topic>.md,"
echo "     translate the body (keeping code blocks / MCP tool"
echo "     calls / file paths / JSON examples intact), and remove"
echo "     the 'TRANSLATION PENDING' notice + the"
echo "     'auto-translated: true' / 'needs-human-review: true'"
echo "     frontmatter keys."
echo "  2. Optional follow-up: add a tutorial gate to"
echo "     apps/web/scripts/check-i18n.ts that fails when any"
echo "     tutorial still has 'needs-human-review: true'."
echo "  3. git add plugins/*/tutorials/{es,fr,de,pt,it,zh,hi,ar,ja,vi,th}/ scripts/translate-tutorials.sh"
echo "     git commit -m 'feat(plugins): bootstrap 11-language tutorial skeletons (p110 s3)'"
