# PDF sentence focus outline follow-up

Worktree: `reading-aid-pdf-sentences`; branch: `fix/scientific-pdf-sentences`.
This note describes only the outline follow-up, on top of the existing uncommitted
scientific PDF recognition work described in `PDF_SENTENCE_VALIDATION.md`.

## Cause

On the supplied Swirl Flow paper, the embedded body font reports ascent
`1.1962890625`, descent `-0.439453125`, and size about `7.173` PDF points.
The previous source frame used `top = baseline - ascent * size`, but always used
`height = 1.08 * size`. Its bottom was therefore about **0.834 PDF points above
the baseline**. Lower glyph strokes and descenders extended outside the frame.
The centered SVG border then painted through those glyphs. Sentence selection,
horizontal advances, reading order, and the rectangle-union algorithm were not
the cause. Zoom and pixel rounding made the faulty edge more conspicuous.

## Geometry changes

- Source frames now use both ascent and descent. Oversized font-wide metrics
  are normalized together into the existing 1.08-em fallback frame, retaining
  their above/below-baseline ratio. This prevents the bottom being anchored
  above the baseline without making the entire font bounding box a large box.
- When the embedded font face is available, Canvas `TextMetrics` extend that
  frame to include actual glyph ink. Measurement uses PDF.js's original glyph
  **draw codes** and face, including private-use subset characters; it does not
  search normalized sentence text. Glyph measurements are cached per font.
  Missing/unsupported metrics fall back without preventing page rendering.
- Original source item indices, UTF-16 offsets, transforms, and horizontal
  advances are retained. There are no paragraph boxes or sentence-string
  searches. The original focus union and connector rules are unchanged.
- Fill and outline now render separately. An even-odd SVG clip excludes selected
  source geometry and a one-CSS-pixel raster fringe from the outline. A centered
  4-CSS-pixel stroke consequently leaves about 1 CSS pixel visible outside this
  protected area. The fringe converts to PDF units at the current zoom; it is
  not CSS padding or an expansion of the sentence fill/source mapping.
- The one-pixel reserve accounts for the observed low-zoom raster overhang
  (about 0.635 CSS px at 50%/1x). Nearby non-selected source ink also clips an
  encroaching border. Boundary whitespace is excluded from those obstacles
  using original item offsets, so empty spaces do not erase sentence-end edges.
- Per-column and page clips contain the exterior stroke. Existing disconnected
  paths across columns, figure-sized gaps, and pages remain disconnected;
  multi-line connectors retain their existing union shape and no internal border.

## Files changed by this follow-up

1. `src/lib/coordinates.ts` — baseline-aware frames and optional embedded glyph
   ink metrics; original item text retained only for whitespace obstacle bounds.
2. `src/lib/focus-shape.mjs` — exterior clip geometry, column clips, whitespace
   obstacle trimming, and screen-space outline constants.
3. `src/components/PdfPage.tsx` — separate fill/outline paths and memoized clips.
4. `tests/coordinates.test.mjs` — font-frame, draw-code, raster, and fallback tests.
5. `tests/focus-shape.test.mjs` — whitespace, exterior clearance, and containment tests.
6. `PDF_FOCUS_OUTLINE_FIX.md` — this report.

The original checkout's pending AI sidebar files are unchanged. No sentence
parser, reading-order code, API/security code, CSS, or storage code was changed
by this follow-up.

## Validation

- `node tests/run-unit.mjs`: **146 passed, 0 failed, 0 skipped**. Seven regression
  tests were added for this follow-up: oversized ascenders; embedded draw-code
  ink and preserved advances; rendered exterior borders over zoom/DPR grids;
  optional measurement failure; whitespace obstacles; exterior/raster clearance;
  and column/page/gap containment. Existing topology/mapping tests also pass.
- `npm run build`: passed. Vite retains its existing warning about minified
  chunks over 500 kB.
- `git diff --check`: passed.
- Offline PDF.js/native-canvas checks used the actual supplied PDF and the two
  sentences beginning “Swirl Flow (SF) technology…” and “This technology
  simplifies…”, at **35%, 50%, 100%, 160%, and 250%**, on **1x and 2x** pixel grids
  (20 cases). Before/after rendered crops reproduce the former baseline cut and
  show the corrected surrounding outline. Of sampled dark source pixels, one
  low-zoom antialiased pixel lay outside the new mathematical frame, by about
  0.635 CSS px; the exterior clip reserves a full CSS pixel beyond that frame.
  This pixel check is diagnostic, not a claim of universal glyph-bound accuracy.
- The automated SVG raster test exercises the actual `PdfPage` markup. The native
  SVG engine has no browser CSS/DPR or `non-scaling-stroke` model, so the offline
  checks explicitly convert screen stroke widths to equivalent SVG user units
  and rasterize at the requested pixel ratio. They are not browser screenshots.
- No server, browser, preview, localhost listener, or listener-dependent API test
  was started for this follow-up. No commit, merge, push, or deployment was made.

## Remaining manual checks

Verify the supplied PDF in Windows browsers at the listed zooms, browser zoom,
and 100%/125%/150%/200% display scaling, including mixed-font multi-line sentences,
page continuations, and adjacent columns. Browser font hinting/antialiasing and
fractional display scaling may differ from the native offline renderer. At very
tight spacing the border is intentionally clipped against neighbouring ink and
may become thinner or locally interrupted. Unsupported embedded metrics,
Type3/accent glyphs, rotated or vertical text still use fallback bounds; this
change does not claim exact ink measurement for every PDF font/transform.
