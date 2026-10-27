# Mum's album: how the index was built

The album pages under `/mum/album` read one file, `content/janet/photos.json`,
and serve pictures from `public/album/{med,thumb,tile}` plus the two mosaics and
the face crops. Nothing on the site is hand captioned. This folder holds the
scripts and the intermediate data that made the index, so it can be rebuilt or
corrected without starting again.

## Source

The Google Photos album "Mum/Nana/Janet 1945 - 2024": 1,214 images (and 93
videos, not used). The originals were downloaded to Google Drive
(`Asarte/Fiona-Workspace/JCMR/janet/`) and resized there with ImageMagick into
`JCMR/janet-web/`: `med` (1000px, q78), `thumb` (320px), `tile` (64px square).
Ids `p0001` to `p1214` follow the sorted original filenames; `index.csv` maps
id to filename, size, EXIF date and camera model.

## Steps, in order (all paths assume the working folder is `ROOT` in each script)

1. `analyse1.py`: colour statistics per picture and perceptual-hash dedupe
   (`dup_of` for 127 near duplicates) into `index1.json`.
2. `analyse2_faces.py`: insightface (buffalo_l) face detection and embeddings,
   then agglomerative clustering (cosine, 0.62) into `faces_clustered.json`.
   Janet is clusters 12 and 31. Other clusters with ten or more pictures become
   the unnamed "Her people".
3. `colour2.py`: each picture's one telling hue (`chue`), used to sort "The
   colours" into a gradient. Output `colour2.json`.
4. Vision tagging: `TAGGING.md` is the brief given to a model for each batch
   in `batches/` (40 pictures each, 640px copies). The answers are
   `tags/b00.jsonl` to `tags/b27.jsonl`: setting, occasions, people count,
   children, whether Janet is in it, laughing, season, estimated year with
   confidence, quality, a caption and the colours.
5. `build_index.py`: merges everything into `photos.json`, writes
   `exclude.json` (screenshots and the like), makes the face crops and copies
   the pictures into `public/album`. Date rules live here: the Sony DSC-T3's
   clock ran a year early; a scanner as the camera, a date after 15 Nov 2024,
   or a tagger year five or more years from the file's date means the file is
   a copy of an older print and takes the tagger's year; a 1 Jan 00:xx stamp is
   an unset clock.
6. `rescue.py`: crops phone screenshots back to the photograph inside them
   (`rescued.json`, read by `build_index.py`). A few are kept whole or skipped
   by name at the top of the script.
7. `mosaic.py <target> <out>`: the photomosaics (54 by 72 tiles of 40px, each
   picture used at most five times, no neighbour repeats, adaptive tint).
   Targets were `med/p0059.jpg` (laughing in the sea) and
   `public/photos/janet-portrait.jpg`. The cell maps are `mosaic-*.json`.
8. Run `build_index.py` again so the mosaics' cell maps are included, then
   `npm run build`.

`shoot.py` screenshots every album view at desktop and phone widths from a
local `next start -p 3077` run with `PUBLIC_LIVE=true`.

## Correcting things by hand

- A wrong caption, year or grouping: edit the line in the right `tags/*.jsonl`
  and re-run `build_index.py`.
- A picture that should not be on the site: set `"not_photo": true` on its
  tag line (and add it to `SKIP` in `rescue.py` if it is a screenshot).
- A face cluster that is really two people, or two that are one: the
  clustering threshold is in `analyse2_faces.py`.
- Naming the people: `photos.json` has `people[].c` (the cluster number); a
  name map could be added to `src/lib/janet.ts` without touching the pipeline.
