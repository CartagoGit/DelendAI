/**
 * 0010_fts5.sql — f00516 S1.
 *
 * FTS5 virtual tables + triggers that keep proposals, plans and
 * slices indexed for full-text search. Tokenisation is `unicode61`
 * (good enough for engineering text); the configuration is
 * centralised so we can swap to `trigram` later without touching
 * call sites.
 *
 * The triggers cover INSERT, UPDATE and DELETE so the FTS index
 * cannot drift from the source rows. The explicit rebuild statements
 * at the end repopulate each standalone index from rows that existed
 * before migration 0010 was applied.
 */

CREATE VIRTUAL TABLE IF NOT EXISTS proposals_fts USING fts5(
        uid UNINDEXED,
        title,
        body,
        tokenize = 'unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS plans_fts USING fts5(
        uid UNINDEXED,
        title,
        body,
        tokenize = 'unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS slices_fts USING fts5(
        uid UNINDEXED,
        title,
        body,
        tokenize = 'unicode61'
);

CREATE TRIGGER IF NOT EXISTS proposals_fts_ai
AFTER INSERT ON proposals
BEGIN
        INSERT INTO proposals_fts (uid, title, body)
        VALUES (NEW.uid, NEW.title, '');
END;

CREATE TRIGGER IF NOT EXISTS proposals_fts_au
AFTER UPDATE ON proposals
BEGIN
        UPDATE proposals_fts
        SET title = NEW.title
        WHERE uid = OLD.uid;
END;

CREATE TRIGGER IF NOT EXISTS proposals_fts_ad
AFTER DELETE ON proposals
BEGIN
        DELETE FROM proposals_fts WHERE uid = OLD.uid;
END;

CREATE TRIGGER IF NOT EXISTS plans_fts_ai
AFTER INSERT ON plans
BEGIN
        INSERT INTO plans_fts (uid, title, body)
        VALUES (NEW.uid, NEW.title, '');
END;

CREATE TRIGGER IF NOT EXISTS plans_fts_au
AFTER UPDATE ON plans
BEGIN
        UPDATE plans_fts
        SET title = NEW.title
        WHERE uid = OLD.uid;
END;

CREATE TRIGGER IF NOT EXISTS plans_fts_ad
AFTER DELETE ON plans
BEGIN
        DELETE FROM plans_fts WHERE uid = OLD.uid;
END;

CREATE TRIGGER IF NOT EXISTS slices_fts_ai
AFTER INSERT ON slices
BEGIN
        INSERT INTO slices_fts (uid, title, body)
        VALUES (NEW.uid, NEW.title, '');
END;

CREATE TRIGGER IF NOT EXISTS slices_fts_au
AFTER UPDATE ON slices
BEGIN
        UPDATE slices_fts
        SET title = NEW.title
        WHERE uid = OLD.uid;
END;

CREATE TRIGGER IF NOT EXISTS slices_fts_ad
AFTER DELETE ON slices
BEGIN
        DELETE FROM slices_fts WHERE uid = OLD.uid;
END;

DELETE FROM proposals_fts;
INSERT INTO proposals_fts (uid, title, body)
SELECT uid, title, '' FROM proposals;

DELETE FROM plans_fts;
INSERT INTO plans_fts (uid, title, body)
SELECT uid, title, '' FROM plans;

DELETE FROM slices_fts;
INSERT INTO slices_fts (uid, title, body)
SELECT uid, title, '' FROM slices;
