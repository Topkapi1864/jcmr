import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

// ---- Enumerations (spec §5.3, §6) --------------------------------------

export const AREAS = [
  "route",
  "hotel",
  "london-beds",
  "vehicles",
  "crew",
  "first-aid",
  "food",
  "kit",
  "tracking",
  "fundraising",
  "finish-day",
  "day-plan",
  "costs",
  "site",
] as const;
export type Area = (typeof AREAS)[number];

export const AREA_LABELS: Record<Area, string> = {
  route: "Route",
  hotel: "Hotel",
  "london-beds": "London beds",
  vehicles: "Vehicles",
  crew: "Crew",
  "first-aid": "First aid",
  food: "Food",
  kit: "Kit",
  tracking: "Tracking",
  fundraising: "Fundraising",
  "finish-day": "Finish day",
  "day-plan": "Day plan",
  costs: "Costs",
  site: "Site",
};

export const STATUSES = ["open", "in-progress", "blocked", "done"] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABELS: Record<Status, string> = {
  open: "Open",
  "in-progress": "In progress",
  blocked: "Blocked",
  done: "Done",
};

export const STOP_KINDS = ["short", "long", "lunch", "overnight", "finish"] as const;
export const PROVIDERS = ["garmin", "wahoo", "strava", "other"] as const;
export const ROLES = ["admin", "crew"] as const;
export type Role = (typeof ROLES)[number];

// ---- Tables ------------------------------------------------------------

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
});

export const people = sqliteTable("people", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  shortName: text("short_name").notNull().unique(),
  role: text("role", { enum: ROLES }).notNull().default("crew"),
  email: text("email"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(100),
});

export const riders = sqliteTable("riders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  personId: integer("person_id").references(() => people.id),
  displayName: text("display_name").notNull(),
  bioMd: text("bio_md").notNull().default(""),
  photoAsset: text("photo_asset"),
  stravaUrl: text("strava_url"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const content = sqliteTable("content", {
  key: text("key").primaryKey(),
  md: text("md").notNull().default(""),
});

export const assets = sqliteTable("assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["mum_photo", "rider_photo"] }).notNull(),
  path: text("path").notNull(),
  chosenBy: text("chosen_by"),
  at: text("at"),
});

export const routeDays = sqliteTable("route_days", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  day: integer("day").notNull(),
  label: text("label").notNull(),
  startLabel: text("start_label").notNull(),
  endLabel: text("end_label").notNull(),
  miles: real("miles"),
  feet: integer("feet"),
  gpxPath: text("gpx_path"),
  stravaUrl: text("strava_url"),
});

export const routeStops = sqliteTable(
  "route_stops",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    dayId: integer("day_id")
      .notNull()
      .references(() => routeDays.id),
    sortOrder: integer("sort_order").notNull().default(0),
    name: text("name").notNull(),
    approxMile: real("approx_mile"),
    kind: text("kind", { enum: STOP_KINDS }).notNull().default("short"),
    plannedTime: text("planned_time"),
    notes: text("notes"),
  },
  (t) => [index("route_stops_day_idx").on(t.dayId, t.sortOrder)],
);

export const trackerLinks = sqliteTable("tracker_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  riderId: integer("rider_id").references(() => riders.id),
  provider: text("provider", { enum: PROVIDERS }).notNull().default("other"),
  url: text("url").notNull(),
  label: text("label").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
});

export const liveStatus = sqliteTable("live_status", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
  place: text("place").notNull().default(""),
  postedAt: text("posted_at").notNull(),
  postedBy: text("posted_by").notNull(),
});

export const items = sqliteTable(
  "items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    area: text("area", { enum: AREAS }).notNull(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => people.id),
    due: text("due"),
    status: text("status", { enum: STATUSES }).notNull().default("open"),
    waitingOn: text("waiting_on").notNull().default(""),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedBy: text("updated_by").notNull(),
    updatedAt: text("updated_at").notNull(),
    doneAt: text("done_at"),
    source: text("source"),
    deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("items_owner_idx").on(t.ownerId), index("items_status_idx").on(t.status)],
);

export const itemNotes = sqliteTable(
  "item_notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id),
    author: text("author").notNull(),
    at: text("at").notNull(),
    text: text("text").notNull(),
  },
  (t) => [index("item_notes_item_idx").on(t.itemId)],
);

export const itemEvents = sqliteTable(
  "item_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id),
    actor: text("actor").notNull(),
    at: text("at").notNull(),
    field: text("field").notNull(),
    from: text("from_value"),
    to: text("to_value"),
  },
  (t) => [index("item_events_item_idx").on(t.itemId)],
);

export const links = sqliteTable("links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  url: text("url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const audit = sqliteTable("audit", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actor: text("actor").notNull(),
  at: text("at").notNull(),
  action: text("action").notNull(),
});

export type Person = typeof people.$inferSelect;
export type Item = typeof items.$inferSelect;
export type ItemNote = typeof itemNotes.$inferSelect;
export type ItemEvent = typeof itemEvents.$inferSelect;
export type Rider = typeof riders.$inferSelect;
export type RouteDay = typeof routeDays.$inferSelect;
export type RouteStop = typeof routeStops.$inferSelect;
export type TrackerLink = typeof trackerLinks.$inferSelect;
export type LiveStatus = typeof liveStatus.$inferSelect;
export type Link = typeof links.$inferSelect;
