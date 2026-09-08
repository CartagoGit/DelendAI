/**
 * git-runner-failure-reason.spec.ts — why a failed git command must
 * report git's own words.
 *
 * `git commit` with an empty index writes "nothing to commit, working
 * tree clean" to STDOUT and exits 1, leaving stderr empty. The runner
 * used to read stderr alone and fall back to the exec error's message,
 * which is only the command echo:
 *
 *   Command failed: git commit --author=… -m feat(x00001): …
 *
 * That is not merely unhelpful. commit-policy classifies "nothing to
 * commit" as a TERMINAL outcome precisely so a slice whose work is
 * already committed stops retrying — and it classifies on this reason
 * string. With the reason reduced to the echo, the match never fired,
 * the event stayed pending, and an adopter project's listener re-emitted
 * eight slices about once a second, indefinitely, on 2026-09-03.
 *
 * So this is a loop-prevention test wearing an error-message costume.
 */
export {};
