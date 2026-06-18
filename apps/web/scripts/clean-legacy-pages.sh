#!/usr/bin/env bash
# scripts/clean-legacy-pages.sh
# Removes the 44 legacy localized pages that were replaced by
# `src/pages/[lang]/<section>.astro`. Safe to run multiple times.
#
# Run from the repo root:
#   bash apps/web/scripts/clean-legacy-pages.sh
set -euo pipefail
cd "$(dirname "$0")/.."

count=0
for path in $(find src/pages -maxdepth 2 -name "*.astro" \
	| grep -E "src/pages/(\w+)/(tools|install|benchmarks|index)\.astro$" \
	| grep -v "src/pages/\[lang\]" || true); do
	if [ ! -s "$path" ]; then
		echo "  rm $path"
		git rm -f "$path" >/dev/null 2>&1 || rm -f "$path"
		count=$((count + 1))
	else
		echo "  skip (non-empty) $path"
	fi
done

echo
echo "removed $count legacy page files."
