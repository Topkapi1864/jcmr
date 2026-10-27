# Photo tagging instructions

You are tagging family photographs of Janet Channon (1945-2024), an English woman from Yorkshire who lived
her later years around London. The album spans her life, but most photos are from 2003-2024 (Janet aged
58 to 79). In the later photos she is an older woman with blonde (later white) hair, usually smiling broadly.

Your batch file lists one photo per line, tab-separated: `id`, `path`, `exif_date` (may be empty), `camera`.
A non-empty exif_date is reliable (it came from a phone or digital camera). An empty one means a scan or a
saved image with no metadata: estimate the year from clothing, hairstyles, print quality, phones, cars etc.

For EVERY photo in the batch: Read the image file (use the Read tool on the path), look at it carefully, then
produce ONE line of JSON. Write all the lines to the output file given to you, one JSON object per line,
nothing else in the file. Do not skip any photo. If an image cannot be read, write a line with "error": true.

JSON fields (use exactly these keys):
- "id": the photo id, e.g. "p0001"
- "setting": one of "home", "garden", "restaurant", "pub-bar", "seaside", "countryside", "town", "boat",
  "pool-spa", "party-venue", "hotel", "car", "church", "screenshot", "other"
- "occasion": a list of 0-2 from "christmas", "birthday", "wedding", "holiday", "family-meal", "night-out",
  "day-out", "celebration", "portrait", "everyday", "cycling", "sport", "music", "dressing-up", "memorial"
- "people": number of clearly visible people (0, 1, 2, 3, 4, 5, or 6 for six or more)
- "children": true if any child (under ~14) is visible
- "janet": "yes" if the older blonde woman (Janet) is clearly in the photo, "no" if clearly not, "unsure"
- "laughing": true if Janet (or the main subject) is laughing or beaming with an open smile
- "season": one of "summer", "winter", "spring-autumn", "indoor", "unknown"
- "est_year": your best estimate of the year the photo was TAKEN, as an integer. If exif_date is given,
  use that year unless the image is obviously a scan of an older print (then estimate the print's year).
- "year_conf": "high" (exif or certain), "medium", or "low"
- "quality": 1-5, how good it would look featured large (sharpness, light, composition, expression)
- "not_photo": true if it is a screenshot, document, text image, poster or otherwise not a photograph
- "caption": 6-14 words, warm and plain, describing what is happening. No names (you do not know them).
  Describe people by role or look ("Janet with two young women", "a toddler on her lap"). No full stops
  at the end, no em dashes.
- "colours": 1-3 words naming the dominant colours or mood of the picture (e.g. "warm gold", "sea blue")

Example line:
{"id":"p0123","setting":"restaurant","occasion":["birthday","family-meal"],"people":4,"children":false,"janet":"yes","laughing":true,"season":"indoor","est_year":2019,"year_conf":"high","quality":4,"not_photo":false,"caption":"Janet laughing over a birthday cake with three friends at a long table","colours":"warm candlelight"}

Work through the whole batch, then write the file in one go with the Write tool. Reply with a single line:
the number of photos tagged and any ids that errored.
