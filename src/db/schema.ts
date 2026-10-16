import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  mile: real("mile"), // approx miles done when posted (drives the progress bar)
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

// ---- Kit (equipment lists) ---------------------------------------------

export const KIT_CATEGORIES = ["bike", "ride-kit", "lights-power", "clothing", "repair", "nutrition", "off-bike", "tools-spares", "other"] as const;
export type KitCategory = (typeof KIT_CATEGORIES)[number];
export const KIT_CATEGORY_LABELS: Record<KitCategory, string> = {
  bike: "Bike",
  "ride-kit": "Ride kit",
  "lights-power": "Lights & power",
  clothing: "Clothing",
  repair: "On-bike repair",
  nutrition: "Nutrition",
  "off-bike": "Off the bike",
  "tools-spares": "Tools & spares (vehicles)",
  other: "Other",
};
export const KIT_STATUSES = ["need", "ordered", "have"] as const;
export type KitStatus = (typeof KIT_STATUSES)[number];
export const KIT_STATUS_LABELS: Record<KitStatus, string> = { need: "Need", ordered: "Ordered", have: "Have" };
export const KIT_STORAGE = ["", "bike", "car", "robyn", "bag", "van", "home"] as const;
export const KIT_STORAGE_LABELS: Record<(typeof KIT_STORAGE)[number], string> = {
  "": "— not decided",
  bike: "On the bike",
  car: "Follow vehicle",
  robyn: "Motorhome (Robyn)",
  bag: "Overnight bag",
  van: "Yasmin's van",
  home: "Stays at home",
};

export const kitCatalogue = sqliteTable("kit_catalogue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category", { enum: KIT_CATEGORIES }).notNull().default("other"),
  suggestedQty: integer("suggested_qty").notNull().default(1),
  carriedIn: text("carried_in", { enum: KIT_STORAGE }).notNull().default(""),
  notes: text("notes").notNull().default(""),
  source: text("source").notNull().default(""),
  link: text("link").notNull().default(""),
  recommended: text("recommended").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(100),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const kitItems = sqliteTable(
  "kit_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id),
    catalogueId: integer("catalogue_id").references(() => kitCatalogue.id),
    name: text("name").notNull(),
    category: text("category", { enum: KIT_CATEGORIES }).notNull().default("other"),
    qty: integer("qty").notNull().default(1),
    status: text("status", { enum: KIT_STATUSES }).notNull().default("need"),
    storage: text("storage", { enum: KIT_STORAGE }).notNull().default(""),
    notes: text("notes").notNull().default(""),
    link: text("link").notNull().default(""),
    updatedBy: text("updated_by").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("kit_items_rider_idx").on(t.riderId)],
);

export type KitCatalogueRow = typeof kitCatalogue.$inferSelect;
export type KitItem = typeof kitItems.$inferSelect;

// ---- Crew details (one row per person, joined to people) -------------------

export const AGREED = ["unknown", "asked", "yes", "no"] as const;
export type Agreed = (typeof AGREED)[number];
export const AGREED_LABELS: Record<Agreed, string> = { unknown: "Not asked yet", asked: "Asked, waiting", yes: "Yes — in", no: "Can't make it" };
export const CREW_ROLE_SUGGESTIONS = [
  "Rider",
  "Follow vehicle driver",
  "Motorhome driver",
  "Crew chief",
  "Support / feed stops",
  "First aider",
  "Photos & social",
  "Finish in Yeadon",
  "Family support",
];

export const crewDetails = sqliteTable("crew_details", {
  personId: integer("person_id")
    .primaryKey()
    .references(() => people.id),
  crewRole: text("crew_role").notNull().default(""),
  agreed: text("agreed", { enum: AGREED }).notNull().default("unknown"),
  briefed: integer("briefed", { mode: "boolean" }).notNull().default(false),
  mobile: text("mobile").notNull().default(""),
  dob: text("dob").notNull().default(""), // YYYY-MM-DD
  skills: text("skills").notNull().default(""),
  firstAid: text("first_aid").notNull().default(""), // e.g. "EFAW, expires Mar 2027"
  vehicle: text("vehicle").notNull().default(""),
  dietary: text("dietary").notNull().default(""),
  emergencyName: text("emergency_name").notNull().default(""),
  emergencyPhone: text("emergency_phone").notNull().default(""),
  availability: text("availability").notNull().default(""), // which days they are with us
  notes: text("notes").notNull().default(""),
  updatedBy: text("updated_by").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});
export type CrewDetails = typeof crewDetails.$inferSelect;

// ---- Sleeping arrangements -----------------------------------------------

export const NIGHTS = ["thu", "fri", "sat", "sun"] as const;
export type Night = (typeof NIGHTS)[number];
export const NIGHT_LABELS: Record<Night, string> = { thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
export const NIGHT_DATES: Record<Night, string> = { thu: "12 Nov", fri: "13 Nov", sat: "14 Nov", sun: "15 Nov" };
export const NIGHT_WHERE: Record<Night, string> = { thu: "London", fri: "London", sat: "Loughborough", sun: "Yeadon" };

/** A place someone can sleep: a house, a hotel, Robyn, an Airbnb. Admins keep the list. */
export const sleepingPlaces = sqliteTable("sleeping_places", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  town: text("town").notNull().default(""),
  beds: integer("beds"), // rough capacity, if known
  notes: text("notes").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(100),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

/** One row per person per night. No row = not decided yet. place_id null + note = free text ("own home", "not there"). */
export const sleeping = sqliteTable(
  "sleeping",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    personId: integer("person_id")
      .notNull()
      .references(() => people.id),
    night: text("night", { enum: NIGHTS }).notNull(),
    placeId: integer("place_id").references(() => sleepingPlaces.id),
    note: text("note").notNull().default(""),
    updatedBy: text("updated_by").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("sleeping_person_night").on(t.personId, t.night)],
);

export type SleepingPlace = typeof sleepingPlaces.$inferSelect;
export type SleepingRow = typeof sleeping.$inferSelect;

// ---- Vehicles ---------------------------------------------------------------

/** Where a vehicle's colour comes from: a palette slot (v1…v8, defined in design/tokens.css) or a custom #rrggbb. */
export const VEHICLE_PALETTE = ["v1", "v2", "v3", "v4", "v5", "v6", "v7", "v8"] as const;
export const SEATS = ["driver", "passenger"] as const;
export type Seat = (typeof SEATS)[number];
export const SEAT_LABELS: Record<Seat, string> = { driver: "Driver", passenger: "Passenger" };
export const POSITION_SOURCES = ["phone", "tracker", "pasted"] as const;

export const vehicles = sqliteTable("vehicles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  colour: text("colour").notNull().default("v1"),
  make: text("make").notNull().default(""), // type of vehicle: "VW Transporter T6", "6-berth motorhome"
  registration: text("registration").notNull().default(""),
  role: text("role").notNull().default(""), // what this vehicle is for
  strategy: text("strategy").notNull().default(""), // how it is driven: leapfrogging, behind the riders, ahead to the stops
  contents: text("contents").notNull().default(""), // notes on what goes in it
  kitStorage: text("kit_storage").notNull().default(""), // a KIT_STORAGE key — riders' kit packed here shows on the vehicle
  trackerUrl: text("tracker_url").notNull().default(""), // a share link from a bought tracker / app
  token: text("token").notNull(), // for tracker apps posting positions; rotatable
  photo: text("photo"), // a resized JPEG as a data: URL — served by /api/vehicles/photo/<id>
  sortOrder: integer("sort_order").notNull().default(100),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  updatedBy: text("updated_by").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

/** Who is in which vehicle, and for which part of the ride. A person who switches vehicles has two rows.
 *  from_point / until_point are route points: "day:1" (the start of day 1), "stop:<id>", or "end". */
export const vehicleCrew = sqliteTable(
  "vehicle_crew",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    personId: integer("person_id")
      .notNull()
      .references(() => people.id),
    seat: text("seat", { enum: SEATS }).notNull().default("passenger"),
    fromPoint: text("from_point").notNull().default("day:1"),
    untilPoint: text("until_point").notNull().default("end"),
    note: text("note").notNull().default(""),
    updatedBy: text("updated_by").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("vehicle_crew_vehicle_idx").on(t.vehicleId), index("vehicle_crew_person_idx").on(t.personId)],
);

/** The pre-ride packing check: one row per thing that should be in the vehicle. */
export const vehicleChecklist = sqliteTable(
  "vehicle_checklist",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    name: text("name").notNull(),
    qty: integer("qty").notNull().default(1),
    note: text("note").notNull().default(""),
    checked: integer("checked", { mode: "boolean" }).notNull().default(false),
    checkedBy: text("checked_by").notNull().default(""),
    checkedAt: text("checked_at").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(100),
  },
  (t) => [index("vehicle_checklist_vehicle_idx").on(t.vehicleId)],
);

/** Positions, newest last. Pruned to a short trail per vehicle. */
export const vehiclePositions = sqliteTable(
  "vehicle_positions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    accuracy: real("accuracy"), // metres
    speed: real("speed"), // m/s
    battery: real("battery"), // 0–100, if the device says
    source: text("source", { enum: POSITION_SOURCES }).notNull().default("phone"),
    by: text("by").notNull().default(""),
    at: text("at").notNull(),
  },
  (t) => [index("vehicle_positions_vehicle_idx").on(t.vehicleId, t.at)],
);

export type Vehicle = typeof vehicles.$inferSelect;
export type VehicleCrewRow = typeof vehicleCrew.$inferSelect;
export type VehicleChecklistRow = typeof vehicleChecklist.$inferSelect;
export type VehiclePosition = typeof vehiclePositions.$inferSelect;

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
