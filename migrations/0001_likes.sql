-- One heart per visitor IP per kid page; a page's count is its number of rows.
-- ip holds a salted SHA-256 of the address, never the address itself.
CREATE TABLE likes (
  slug       TEXT    NOT NULL,
  ip         TEXT    NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (slug, ip)
) WITHOUT ROWID;
