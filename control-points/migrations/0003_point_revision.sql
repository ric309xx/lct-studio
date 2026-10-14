CREATE TABLE IF NOT EXISTS point_revision(id INTEGER PRIMARY KEY CHECK(id=1), generation TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO point_revision(id,generation,revision) VALUES(1,lower(hex(randomblob(16))),0);
CREATE TRIGGER IF NOT EXISTS points_revision_insert AFTER INSERT ON points BEGIN UPDATE point_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS points_revision_update AFTER UPDATE ON points BEGIN UPDATE point_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS points_revision_delete AFTER DELETE ON points BEGIN UPDATE point_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS datasets_revision_insert AFTER INSERT ON datasets BEGIN UPDATE point_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS datasets_revision_update AFTER UPDATE ON datasets BEGIN UPDATE point_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS datasets_revision_delete AFTER DELETE ON datasets BEGIN UPDATE point_revision SET revision=revision+1 WHERE id=1; END;
