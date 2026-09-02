#!/bin/sh
# lefthook-rc.sh — sourced by every generated .git/hooks/* before lefthook runs.
# Referenced from lefthook.yml via the top-level `rc:` option.
#
# WHY: every hook printed
#   /usr/bin/bash: warning: setlocale: LC_ALL: cannot change locale (en_US.UTF-8)
# on every command. The cause is NOT in this repo and not in the WSL system:
#
#   $ cat /etc/default/locale   -> LANG=C.UTF-8
#   $ locale -a                 -> C / C.utf8 / POSIX      (no en_US.UTF-8)
#
# so nothing on this machine can satisfy LC_ALL=en_US.UTF-8. That value is
# injected from OUTSIDE the WSL session — an SSH/VS Code remote forwarding the
# Windows client's LC_* variables (`SendEnv LANG LC_*`). Generating the locale
# would mean editing system files, which is out of scope for a repo fix.
#
# So we neutralise it at the only layer the repo owns: before any hook command
# runs, if the inherited locale does not exist on this machine, fall back to
# one that does. `locale` writes "Cannot set LC_* ..." to stderr (and still
# exits 0) when the requested locale is missing, so its stderr is the reliable
# probe — not a `locale -a` string match, which has to guess the .UTF-8/.utf8
# spelling.
#
# This only ever DOWNGRADES an unusable locale to C.UTF-8. A working
# LC_ALL/LANG is left untouched.

if [ -n "$(locale 2>&1 1>/dev/null)" ]; then
	export LC_ALL=C.UTF-8
	export LANG=C.UTF-8
	unset LC_CTYPE LC_MESSAGES LC_COLLATE LC_NUMERIC LC_TIME LC_MONETARY
fi
