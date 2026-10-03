This release isolates Render's build phase from an unsupported production DATABASE_URL. Runtime recovery remains guarded by the existing non-empty persistent SQLite file and pre-migration backup.
