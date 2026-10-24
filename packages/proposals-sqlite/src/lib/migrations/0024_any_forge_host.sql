-- 0024 — a repository's forge is any host, not one of four names.
--
-- Startup derives a repository's forge from its remote: a short name for
-- the hosts that have one (`github`, `gitlab`, `bitbucket`), and the
-- hostname for every other, which is stable and tells two self-hosted
-- instances apart. The table accepted only 'github', 'gitlab', 'gitea' and
-- 'local', so the first boot of a project on a self-hosted forge
-- (`ssh://git@forge.example.org:2224/team/app.git`), or on Bitbucket,
-- failed its CHECK and the server exited. The column now takes any
-- non-empty lowercase text; the startup seam stays the one place that
-- names a forge.
--
-- SQLite cannot change a CHECK in place: the table is rebuilt under the
-- procedure 0020 follows, keeping its rows, its ids and its counter.
--
-- delendai:rebuilds-tables

CREATE TEMP TABLE forge_rebuild_sequences AS
	SELECT name, seq FROM sqlite_sequence WHERE name = 'repositories';

CREATE TABLE "repositories__any_forge" (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	forge TEXT NOT NULL CHECK (length(forge) > 0 AND forge = lower(forge)),
	owner TEXT NOT NULL,
	name TEXT NOT NULL,
	integration_branch TEXT NOT NULL,
	release_branch TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	UNIQUE (forge, owner, name)
) STRICT;
INSERT INTO "repositories__any_forge" ("id", "forge", "owner", "name", "integration_branch", "release_branch", "created_at", "updated_at") SELECT "id", "forge", "owner", "name", "integration_branch", "release_branch", "created_at", "updated_at" FROM "repositories";
DROP TABLE "repositories";
ALTER TABLE "repositories__any_forge" RENAME TO "repositories";

UPDATE sqlite_sequence
	SET seq = (
		SELECT saved.seq FROM forge_rebuild_sequences AS saved
		WHERE saved.name = sqlite_sequence.name
	)
	WHERE name = 'repositories' AND seq < (
		SELECT saved.seq FROM forge_rebuild_sequences AS saved
		WHERE saved.name = sqlite_sequence.name
	);
INSERT INTO sqlite_sequence (name, seq)
	SELECT name, seq FROM forge_rebuild_sequences
	WHERE name NOT IN (SELECT name FROM sqlite_sequence);
DROP TABLE forge_rebuild_sequences;
