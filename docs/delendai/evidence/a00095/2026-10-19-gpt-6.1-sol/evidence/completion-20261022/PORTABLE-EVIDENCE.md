# Exact originals and portable reading views

The CI checks correctly rejected personal-machine absolute paths in newly committed copies. The rebrand scanner also treated historical inventory/source quotations as live product instructions. This continuation changes the audit packaging only; no rule, baseline or product source is changed.

Every affected original is retained byte-for-byte in an adjacent `.raw.gz` with original and compressed hashes in portable-artifact-provenance.json. Decompression was compared byte-for-byte before writing each readable view. Signed Spanish sources that triggered either check now have a navigation pointer at the old path; reviewer-language-provenance.json identifies their authoritative gzip originals and retains the SHA256 of the uncompressed signed bytes. The other signed originals are untouched.

Readable logs and probe templates use `<HOME>/` placeholders. Set the source root explicitly when reconstructing a probe in an owned temporary directory; the exact executed version is the gzip original. Historical JSON identity spellings use ordinary Unicode escapes that decode to the same strings. JSON data without a home location was checked for semantic equality. Plain-text quotations carry an explicit legacy annotation. Original Git path lists remain exact inside gzip and are referenced by their pointer.

Use the original archives for source quotation or command replay, and the portable views for navigation. Do not apply a readable patch or run a portable template as if it were the exact executed original. No finding was added, withdrawn or strengthened by this packaging change.
