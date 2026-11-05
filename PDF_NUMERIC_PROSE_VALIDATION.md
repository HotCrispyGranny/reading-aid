# Numeric-heavy scientific prose and table exclusion

Worktree: `/workspace/reading-aid-pdf-sentences`

Branch: `fix/scientific-pdf-sentences`

Baseline: `eae092d9d86c0f46e2415825107f82ca9d152653`

## First incorrect stages

Both supplied examples reproduce in *Experimental and numerical investigation
of the iso-thermal flow characteristics.pdf*. Page numbers include its cover;
item indices refer to PDF.js string items and offsets remain original UTF-16.

### A: parameters and experimental identifiers (PDF page 6, right column)

The source items are present. The parameter lines beginning `Nj = 2 ...` and
`αj = 25 ...` survive physical-line construction and column assignment, but are
discarded by the standalone `prose()` classifier before block/source-map creation.
For example, the first parameter line has a letter ratio about 0.382 and five
numeric tokens: it fails both the existing 0.42 minimum letter-density check and
the existing five-plus-number density check. The earlier fix only qualified the
short-item/table heuristic; it left these other standalone checks intact.

There is also an earlier, independent defect for degree marks (items 153, 166,
179 and 192). The small-font row-matching rule allowed a similarly sized run in
another column to provide baseline support without requiring horizontal locality.
A 7.27-point degree glyph could therefore attach to a nearby-baseline 7.97-point
table row on the left rather than its 9.96-point body line on the right. The gap
split then isolated the degree symbol, and the prose classifier discarded it.
Its source string and transform were never absent from PDF.js extraction.

Small-script attachment now requires local horizontal support in both the
similar-size and larger-parent branches. Original glyph transforms are unchanged;
this corrects line membership, not coordinates or text content.

### B: dimensions (PDF page 4, left column)

Items 159,160,161,163,165,166,168,170,172,173,174 already form the correct line:

`sions of 500 mm (L) × 400 mm (W) × 390 mm (H). This`

Its letter ratio is about 0.392, below the standalone classifier's 0.42 minimum;
it also matches the sparse numeric-fragment rejection. The first loss is again
before paragraph construction and `sourceRuns()`, not hyphen normalization,
sentence segmentation, or rendering. Dropping the line breaks the visible
`dimen-` / `sions` continuation and strands the following `This`.

## Classification design

No existing numeric/letter-density threshold was lowered. The conservative
standalone classifier remains, with two additional kinds of evidence:

1. **Independent physical table evidence.** Same-column, same-baseline items are
   examined for numeric cells separated by multiple wide gaps. Repeated aligned
   fields in nearby rows reinforce the table classification; an isolated sparse
   row with three or more separated cells and multiple numeric fields can also
   qualify. Articles inside labels such as `Mean of A` do not count as sentence
   syntax. Proven data-row membership vetoes promotion and heading-like labels,
   so table labels do not slip into navigation. This analysis does not join
   source lines, change reading order, or create highlight rectangles.
2. **Positive body-flow and syntax evidence.** A previously rejected expression
   can belong to body prose when it has compatible body size, dominant font,
   column, indentation and ordinary line spacing, plus an unfinished accepted
   preceding line and connective words such as `and`, `of`, `for`, or `with`.
   Hyphen continuation adds explicit evidence when grammatical text follows.
   Dimensions connected to preceding `... of/with/at/for` prose can also use the
   multiplication expression and a compatible following body line. A standalone
   expression needs stronger grammatical/verb evidence and following body prose.
   Mere proximity or an unfinished preceding line is insufficient. Table
   membership always vetoes these paths; context does not jump fonts, columns,
   large gaps, or caption boundaries.

`dimension` and `dimensions` were added to the existing conservative known-word
hyphen list. `dimen-` / `sions` now normalizes to `dimensions`, while its printed
hyphen remains source-backed. Unknown compounds keep the existing behavior.

## Source mapping and real-PDF audit

The audit reused the unchanged 19-page PDF.js item extraction of the supplied PDF
and compared the baseline parser with this implementation. Superscripts,
subscripts, Greek characters, U+25E6 degree marks and multiplication signs retain
their original strings, indices and transforms. Separate tests cover U+00B0 `°`,
Unicode subscripts and underscore identifiers such as `MIJCC_25_2J`.

| Region | Non-whitespace source coverage before | After |
| --- | --- | --- |
| A: p6 items 145–200, including the affected parameter expressions and degree marks | 195 / 278 | 278 / 278 |
| B: p4 items 159–174, the skipped dimensions line including `This` | 0 / 38 | 38 / 38 |

The dimension sentence now runs from `To limit optical distortion ...` through
`... 390 mm (H).`; `This water tank ...` starts the next unit. Case A's complete
experimental enumeration remains one unit through `(MIJCC 50 4J).`, followed by
`It can be seen ...`. The previous rendering/outline implementation is untouched.

Across the document:

- **384 additional non-whitespace source characters restored**.
- **142 previously indexed characters deliberately excluded**, all in 18
  confirmed table-label cells: four `MIJCC ...` cells in Table II, ten `PIV, CFD`
  cells in Table III, and four `MIJCC ...` cells in Table IV.
- **Zero other previously indexed characters lost**, and zero duplicate source
  characters. Joining continuations loses no page-local coverage and introduces
  no duplication.
- The three real table data regions (p4 items 201–228, p6 items 26–95, p15 items
  192–219) now have **zero** sentence coverage, versus 36, 70 and 36 characters
  before. No data-row characters newly entered the index in these regions.
  Table captions remain selectable.
- Joined units change from 674 to 645 through paragraph repairs and removal of
  stray table-label units. Unit count alone is not a correctness metric.
- All newly covered source lines were inspected; no newly indexed table row was
  found in this supplied document. This is not a universal table-classification
  guarantee for other PDFs.

The deterministic fixture contains 100 original source items from both body
regions, the opposite-column table, and enough real body context to establish
columns. It records native, nonuniform glyph advances recovered from PDF drawing
operators as well as item transforms. Tests check every intended non-whitespace
UTF-16 code unit exactly once, every table character zero times, original source
rectangle boundaries, glyph midpoint hit resolution, and sentence navigation.
No normalized-string search or estimated paragraph bounding box is used.

## Regression coverage and validation

New `tests/numeric-prose.test.mjs`: **12 tests passed**. They cover:

- Both real body excerpts, including degree marks beside an opposite-column
  table with similar baselines.
- Repeated `αⱼ = 25°`, `Nⱼ = 2`, conjunctions and underscore identifiers.
- `500 mm (L) × 400 mm (W) × 390 mm (H)`, both after `dimen-` and after a
  preceding `dimensions of` line with no words on the expression's own line.
- Six aligned table families: numeric cells, units/decimals, ± values,
  scientific notation, heading-like labels and misleading hyphen continuation.
- An isolated sparse data row and context barriers for columns, fonts, gaps and
  captions. Negative fixtures explicitly assert absence from navigation/source
  ranges, not merely a preferred prose label.

Against the baseline parser, this same suite has 9 failures / 3 passes, covering
both missing scientific prose and pre-existing table-label leakage.

- `node tests/run-unit.mjs`: **171 passed, 0 failed, 0 skipped**. Existing
  scientific source coverage, three-column order, abbreviations, hard hyphens,
  UTF-16/ligatures, page/column continuation, figure interruption, and exterior
  focus-outline/zoom/DPR raster regressions still pass.
- `npm run build`: TypeScript and production build passed. The existing Vite
  warning about minified chunks above 500 kB remains.
- `git diff --check`: passed.
- No browser, server, preview or localhost listener was started. The known
  listener-dependent API suite and browser suite were not rerun in this
  restricted environment. Windows visual verification remains necessary.

## Exact changed files

- `src/lib/sentences.mjs`: local script attachment; structural table evidence;
  contextual numeric prose admission; known dimension word normalization.
- `tests/numeric-prose.test.mjs`: source coverage, geometry, navigation and both
  positive/negative classifier regressions.
- `tests/support/numeric-prose-runs.json`: small real-PDF excerpts and native
  glyph advances; not a copy of the PDF.
- `tests/run-unit.mjs` and `tests/run.mjs`: register the new tests.
- `PDF_NUMERIC_PROSE_VALIDATION.md`: this report.

Coordinate, focus-shape, highlight-geometry and PdfPage implementation files
remain byte-for-byte identical to HEAD. The original `/workspace/reading-aid`
checkout's branch, HEAD, status and all tracked/untracked nonignored file hashes
match the prior snapshot, including pending sidebar changes.

## Remaining ambiguous cases

Tables encoded as dense single strings without physical field gaps, tables with
substantial grammatical language, unusual mixed-font prose, or numeric-only text
without established same-page body context remain ambiguous. The conservative
admission rules can still omit such prose rather than assume that nearby numeric
data is a continuation. Repeated structured equation arrays may resemble data
tables; this patch does not add general equation understanding.

Existing heading/header/footer heuristics are unchanged. In the full PDF, the
Roman-letter section/subsection prefix above Case A still shares a logical unit
with the following body text; the prior publisher-footer continuation barrier
also remains. These separate segmentation issues were not silently rewritten.
Windows QA should verify complete focused sentences, symbols, Up/Down order,
captions/table exclusion, zoom/high-DPI rendering and the untouched outline.

No commit, push, merge or deployment was made.
