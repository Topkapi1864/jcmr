// Where each piece of kit lives on the rider-and-bike drawing.
// Order matters: the first rule that matches an item's name wins; the category is the fallback.

export const ZONE_IDS = [
  "helmet",
  "glasses",
  "headwear",
  "jacket",
  "jersey",
  "gloves",
  "legs",
  "feet",
  "fuel",
  "cockpit",
  "frontLight",
  "rearLight",
  "bottles",
  "saddle",
  "wheels",
  "bike",
  "power",
  "bag",
  "car",
] as const;
export type ZoneId = (typeof ZONE_IDS)[number];

export type Zone = {
  id: ZoneId;
  label: string;
  /** what it covers, for the tooltip */
  covers: string;
  /** "body" and "bike" sit on the drawing; "off" sits beside it */
  where: "body" | "bike" | "off";
};

export const ZONES: Zone[] = [
  { id: "helmet", label: "Helmet", covers: "helmet", where: "body" },
  { id: "glasses", label: "Glasses", covers: "riding glasses, lenses", where: "body" },
  { id: "headwear", label: "Head & neck", covers: "cap, skullcap, balaclava, neck tube, intercom", where: "body" },
  { id: "jacket", label: "Jacket & hi-vis", covers: "waterproof jacket, gilet, reflective vest", where: "body" },
  { id: "jersey", label: "Jersey & base", covers: "base layers, jerseys, heart-rate strap", where: "body" },
  { id: "gloves", label: "Gloves", covers: "gloves, liners", where: "body" },
  { id: "legs", label: "Legs", covers: "bib tights, shorts, leggings", where: "body" },
  { id: "feet", label: "Feet", covers: "shoes, socks, overshoes, insoles", where: "body" },
  { id: "fuel", label: "Pockets & fuel", covers: "gels, bars, electrolytes, food", where: "body" },
  { id: "cockpit", label: "Cockpit", covers: "computer, phone mount, bell, top-tube bag", where: "bike" },
  { id: "frontLight", label: "Front light", covers: "main white light", where: "bike" },
  { id: "rearLight", label: "Rear light", covers: "main red light", where: "bike" },
  { id: "bottles", label: "Bottles", covers: "bottles, cages", where: "bike" },
  { id: "saddle", label: "Saddlebag & repair", covers: "saddlebag, tubes, levers, multitool, pump", where: "bike" },
  { id: "wheels", label: "Wheels & tyres", covers: "wheels, tyres, mudguards", where: "bike" },
  { id: "bike", label: "Bike", covers: "the bike itself, AirTag", where: "bike" },
  { id: "power", label: "Power & charging", covers: "power bank, cables, chargers, batteries", where: "bike" },
  { id: "bag", label: "Overnight bag", covers: "off-the-bike clothes, wash kit, care", where: "off" },
  { id: "car", label: "In the car", covers: "spares and tools in the support vehicles", where: "off" },
];

export const ZONE_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z])) as Record<ZoneId, Zone>;

const RULES: [RegExp, ZoneId][] = [
  [/spare (wheelset|bicycle|bike)|spare (tyres|chains|brake)/, "car"],
  [/repair/, "saddle"],
  [/helmet/, "helmet"],
  [/glasses|eyewear|lens/, "glasses"],
  [/\bcap\b|skull|balaclava|neck|buff|beanie|headband|intercom|headset|bikom/, "headwear"],
  [/jacket|gilet|vest|cape|hi-?vi[sz]|reflective/, "jacket"],
  [/base.?layer|jersey|heart rate|hrm/, "jersey"],
  [/glove|mitt/, "gloves"],
  [/\bbib|tights|legging|shorts|trouser|lower kit|knee warmer|leg warmer/, "legs"],
  [/battery|batteries|charger|charging|power bank|power pack|cable|usb|extension lead|socket|light mounts/, "power"],
  [/front light|white.*light|headlight/, "frontLight"],
  [/rear light|red.*light|tail.?light/, "rearLight"],
  [/top.?tube|computer|garmin|wahoo|phone mount|bell|navigation/, "cockpit"],
  [/bottle|cage/, "bottles"],
  [/tyre boot|saddlebag|saddle bag|inner tube|tubes|lever|patch|multi.?tool|quick.?link|plug kit|co2|repair|pump/, "saddle"],
  [/shoe|boot|overshoe|sock|insole/, "feet"],
  [/wheel|tyre|tire|mudguard|fender/, "wheels"],
  [/gel|energy bar|\bbars?\b|electrolyte|sandwich|food|drink mix/, "fuel"],
  [/airtag|^bike$|bicycle|frame/, "bike"],
];

const BY_CATEGORY: Record<string, ZoneId> = {
  bike: "bike",
  "ride-kit": "cockpit",
  "lights-power": "power",
  clothing: "jersey",
  repair: "saddle",
  nutrition: "fuel",
  "off-bike": "bag",
  "tools-spares": "car",
  other: "bag",
};

export function zoneFor(item: { name: string; category: string }): ZoneId {
  // Off-the-bike and support-vehicle kit stays there whatever it is called (off-bike socks, spare cleats).
  if (item.category === "off-bike") return "bag";
  if (item.category === "tools-spares") return "car";
  const n = item.name.toLowerCase();
  for (const [re, z] of RULES) if (re.test(n)) return z;
  return BY_CATEGORY[item.category] ?? "bag";
}
