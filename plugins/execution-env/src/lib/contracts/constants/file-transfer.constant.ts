/**
 * Creates the parent directory, then copies standard input to the path.
 * The script is a constant: the path reaches it as a positional
 * parameter, so a path is never part of the shell text.
 */
export const WRITE_FILE_SCRIPT =
	'mkdir -p -- "$(dirname -- "$1")" && cat > "$1"';
