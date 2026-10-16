// Idempotent schema creation. Runs once per process on first database use so
// a fresh database (local file or a new Turso database) needs no separate
// migration step. Keep in step with schema.ts.

export const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`,
  `CREATE TABLE IF NOT EXISTS people (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     short_name TEXT NOT NULL UNIQUE,
     role TEXT NOT NULL DEFAULT 'crew',
     email TEXT,
     active INTEGER NOT NULL DEFAULT 1,
     sort_order INTEGER NOT NULL DEFAULT 100
   )`,
  `CREATE TABLE IF NOT EXISTS riders (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     person_id INTEGER REFERENCES people(id),
     display_name TEXT NOT NULL,
     bio_md TEXT NOT NULL DEFAULT '',
     photo_asset TEXT,
     strava_url TEXT,
     sort_order INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS content (key TEXT PRIMARY KEY, md TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS assets (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     kind TEXT NOT NULL,
     path TEXT NOT NULL,
     chosen_by TEXT,
     at TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS route_days (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     day INTEGER NOT NULL,
     label TEXT NOT NULL,
     start_label TEXT NOT NULL,
     end_label TEXT NOT NULL,
     miles REAL,
     feet INTEGER,
     gpx_path TEXT,
     strava_url TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS route_stops (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     day_id INTEGER NOT NULL REFERENCES route_days(id),
     sort_order INTEGER NOT NULL DEFAULT 0,
     name TEXT NOT NULL,
     approx_mile REAL,
     kind TEXT NOT NULL DEFAULT 'short',
     planned_time TEXT,
     notes TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS route_stops_day_idx ON route_stops(day_id, sort_order)`,
  `CREATE TABLE IF NOT EXISTS tracker_links (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     rider_id INTEGER REFERENCES riders(id),
     provider TEXT NOT NULL DEFAULT 'other',
     url TEXT NOT NULL,
     label TEXT NOT NULL DEFAULT '',
     active INTEGER NOT NULL DEFAULT 1,
     created_by TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS live_status (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     text TEXT NOT NULL,
     place TEXT NOT NULL DEFAULT '',
     posted_at TEXT NOT NULL,
     posted_by TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS items (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     title TEXT NOT NULL,
     area TEXT NOT NULL,
     owner_id INTEGER NOT NULL REFERENCES people(id),
     due TEXT,
     status TEXT NOT NULL DEFAULT 'open',
     waiting_on TEXT NOT NULL DEFAULT '',
     created_by TEXT NOT NULL,
     created_at TEXT NOT NULL,
     updated_by TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     done_at TEXT,
     source TEXT,
     deleted INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS items_owner_idx ON items(owner_id)`,
  `CREATE INDEX IF NOT EXISTS items_status_idx ON items(status)`,
  `CREATE TABLE IF NOT EXISTS item_notes (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     item_id INTEGER NOT NULL REFERENCES items(id),
     author TEXT NOT NULL,
     at TEXT NOT NULL,
     text TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS item_notes_item_idx ON item_notes(item_id)`,
  `CREATE TABLE IF NOT EXISTS item_events (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     item_id INTEGER NOT NULL REFERENCES items(id),
     actor TEXT NOT NULL,
     at TEXT NOT NULL,
     field TEXT NOT NULL,
     from_value TEXT,
     to_value TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS item_events_item_idx ON item_events(item_id)`,
  `CREATE TABLE IF NOT EXISTS links (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     label TEXT NOT NULL,
     url TEXT NOT NULL,
     sort_order INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS kit_catalogue (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     category TEXT NOT NULL DEFAULT 'other',
     suggested_qty INTEGER NOT NULL DEFAULT 1,
     carried_in TEXT NOT NULL DEFAULT '',
     notes TEXT NOT NULL DEFAULT '',
     source TEXT NOT NULL DEFAULT '',
     sort_order INTEGER NOT NULL DEFAULT 100,
     active INTEGER NOT NULL DEFAULT 1
   )`,
  `CREATE TABLE IF NOT EXISTS kit_items (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     rider_id INTEGER NOT NULL REFERENCES riders(id),
     catalogue_id INTEGER REFERENCES kit_catalogue(id),
     name TEXT NOT NULL,
     category TEXT NOT NULL DEFAULT 'other',
     qty INTEGER NOT NULL DEFAULT 1,
     status TEXT NOT NULL DEFAULT 'need',
     storage TEXT NOT NULL DEFAULT '',
     notes TEXT NOT NULL DEFAULT '',
     link TEXT NOT NULL DEFAULT '',
     updated_by TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS kit_items_rider_idx ON kit_items(rider_id)`,
  `CREATE TABLE IF NOT EXISTS crew_details (
     person_id INTEGER PRIMARY KEY REFERENCES people(id),
     crew_role TEXT NOT NULL DEFAULT '',
     agreed TEXT NOT NULL DEFAULT 'unknown',
     briefed INTEGER NOT NULL DEFAULT 0,
     mobile TEXT NOT NULL DEFAULT '',
     dob TEXT NOT NULL DEFAULT '',
     skills TEXT NOT NULL DEFAULT '',
     first_aid TEXT NOT NULL DEFAULT '',
     vehicle TEXT NOT NULL DEFAULT '',
     dietary TEXT NOT NULL DEFAULT '',
     emergency_name TEXT NOT NULL DEFAULT '',
     emergency_phone TEXT NOT NULL DEFAULT '',
     availability TEXT NOT NULL DEFAULT '',
     notes TEXT NOT NULL DEFAULT '',
     updated_by TEXT NOT NULL DEFAULT '',
     updated_at TEXT NOT NULL DEFAULT ''
   )`,
  `CREATE TABLE IF NOT EXISTS sleeping_places (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     town TEXT NOT NULL DEFAULT '',
     beds INTEGER,
     notes TEXT NOT NULL DEFAULT '',
     sort_order INTEGER NOT NULL DEFAULT 100,
     active INTEGER NOT NULL DEFAULT 1
   )`,
  `CREATE TABLE IF NOT EXISTS sleeping (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     person_id INTEGER NOT NULL REFERENCES people(id),
     night TEXT NOT NULL,
     place_id INTEGER REFERENCES sleeping_places(id),
     note TEXT NOT NULL DEFAULT '',
     updated_by TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sleeping_person_night ON sleeping(person_id, night)`,
  `CREATE TABLE IF NOT EXISTS audit (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     actor TEXT NOT NULL,
     at TEXT NOT NULL,
     action TEXT NOT NULL
   )`,
];

// Columns added after first release. Each is tried once; "duplicate column" is fine.
export const ALTERS: string[] = [`ALTER TABLE live_status ADD COLUMN mile REAL`, `ALTER TABLE kit_catalogue ADD COLUMN link TEXT NOT NULL DEFAULT ''`, `ALTER TABLE kit_catalogue ADD COLUMN recommended TEXT NOT NULL DEFAULT ''`];
