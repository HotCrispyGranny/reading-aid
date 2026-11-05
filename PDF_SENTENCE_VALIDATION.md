# Scientific PDF sentence recognition — diagnosis and validation

Worktree: `/workspace/reading-aid-pdf-sentences`  
Feature branch: `fix/scientific-pdf-sentences`  
Base: `dev/phase1-gpt5-mini`, commit `1f83b2e7ff6b9912dbfbfd0ffcf0f630fbb914f9`.

The original checkout and its three uncommitted sidebar presentation files were
preserved. This patch does not change AI/backend/authentication, document storage,
branding, dependencies, deployment settings, or stored annotation records.

## Architecture retained

1. `pdf.ts` extracts PDF.js text items progressively. Filtered string-item indices
   match the text layer's `textDivs`, including empty string items; marked-content
   records do not consume an index. This alignment was inspected, not assumed broken.
2. `readingLines()` groups baselines and orders physical columns around spanning
   lines. Paragraph blocks use spacing, indentation, typography and semantic labels.
3. `sentenceRanges()` applies scientific boundaries to logical blocks. Headings
   remain selectable units and captions remain separate from body text.
4. Normalization/source runs retain original page, item index and UTF-16 offsets.
   Printed hyphens remain recoverable even when logical words are dehyphenated.
5. Clicks resolve a physical glyph or a validated same-item DOM caret to a unique
   source range. Unresolved/overlapping ranges do not choose the first sentence.
6. Original runs generate page-local rectangles. The existing union/obstacle focus
   outline is retained, with explicit gutter separation for three-column pages.

## Confirmed defects and fixes

| Reproducible input/problem | Before | After |
| --- | --- | --- |
| `See Sec. 3 for the result. It agrees.` | Three units; false break after `Sec.` | Two units; reference stays with its sentence |
| `Smith et al. The next experiment agrees.` | Swallowed the next sentence | Two units when an explicit next-clause starter supplies evidence |
| Unicode quotes, ellipses, superscript citations | Some boundaries suppressed or references detached | Closing punctuation and citation sequences attached to the proper source ranges |
| Four rows in each of three columns | Only four middle-column units survived | All 12 units in column order; every source item retained |
| Gutter candidate touches a text line | Line could be absent from all score counters | Such a candidate is penalized; spanning-line ties cannot discard other lines |
| Large-font character fragments | Fixed 1.4-unit join threshold inserted spaces into words | Font-scaled joins retain words and real word gaps |
| Raised citation with a small gap | Could become a separate unit | Typography/position attach it without changing its source range |
| `mass-` / `transfer`, `state-` / `of-the-art` | Invented `masstransfer` / `stateof-the-art` | Meaningful/unknown hard hyphens preserved |
| `mea-` / `sured`, explicit soft hyphens | Existing useful reconstruction | Retained; explicit soft breaks also handle uppercase continuation |
| Width-30 `A😀B` | Advances ended at 35: `[0,10,15,25,35]` | Correct UTF-16 advances `[0,10,15,20,30]` |
| Zero-width combining mark | Fallback width shifted neighboring glyphs | Zero width remains zero |
| Ligature fallback metrics | Could overwrite known single-character widths | Known single-glyph metrics take precedence |
| UserUnit / upright CropBox | Width or layout frame differed from rendered viewport | Extraction and geometry use consistent viewport units |
| CSS-scaled page, multiple sentences per item | Wrong coordinate conversion could choose another sentence | Client coordinates converted using actual page bounds |
| Foreign/missing caret or invalid source range | Guessed first candidate or clamped onto other text | No arbitrary sentence selection or offset clamping |

`Intl.Segmenter('en', {granularity:'sentence'})` was compared against scientific
fixtures. It split after `Dr.` and `Fig.` in the baseline example, so it was not
used as a wholesale replacement for the existing scientific rules.

## Small cohesive design and compatibility

- No normalized-string search is used to create physical coordinates.
- Two-column gutter values remain numbers; reliably detected three-column pages
  use two numeric cuts. `PageData.gutter` and the renderer accept either form.
  This is transient indexing metadata, not an IndexedDB schema change.
- Three-column recognition requires sustained long-line support in all regions;
  it does not claim general arbitrary-column document understanding.
- Continuations use adjacent logical column indices and retain page/font/heading
  barriers. Ending-column metadata is updated after each join so a sentence can
  traverse all three columns or a page followed by another column. Progressive joins keep prior snapshots unchanged and keep the first
  participating sentence ID.
- IDs retain `p<page>-i<item>-<UTF16 offset>`. When an improved boundary removes an
  old unit start, `resolveSentenceId()` resolves that exact original source anchor
  in the new index. It does not perform fuzzy matching or rewrite stored data.
- Saved rectangles, quote text and notes remain unchanged. An unresolvable source
  anchor retains the existing safe page fallback. Old inaccurate saved rectangles
  are not automatically repaired; correcting those needs deliberate user action.
- Glyph hits use a binary search. The layout work remains per-page and parsing
  remains progressive; no new per-click document reprocessing or dependency exists.

## Tests and build

| Check | Observed result |
| --- | --- |
| Original server-free baseline | 115 passed |
| `node tests/run-unit.mjs` | 139 passed, 0 failed, 0 skipped |
| `npm test` | 140 passed, 1 failed; the legacy API test cannot bind `127.0.0.1` (`listen EPERM`) |
| `npm run build` | Passed TypeScript and production Vite build; existing warning for chunks over 500 kB |
| `npm run test:e2e` | Attempted; Chromium crashes during launch with `setsockopt: Operation not permitted`, before browser assertions |
| Playwright discovery | 11 tests discovered, including the new partial-item/zoom regression; no browser pass claimed |

New/extended tests cover reference and terminal abbreviation boundaries, Unicode
punctuation, explicit source ranges, conservative hyphenation, fragmented glyphs,
three-column preservation and continuation, progressive snapshots, source-anchor
compatibility, superscripts, zero-width marks, ligatures, invalid ranges, and
left/right clicks at multiple zoom/CSS scales. The actual TS geometry and click
handler are exercised by a test-only loader without a Vite server or browser.

The generated-PDF geometry test checks physical font advances for partial sentences
in both normal pages and actual PDF UserUnit/CropBox settings. It sums glyph widths
for the emitted `Tj` stream, rather than treating kerning-aware text measurement as
physical kerning that the fixture did not emit. Existing real PDF.js wrapping,
heading/caption and cross-page tests remain passing. The new browser test targets
partial-item clicks, highlight boundaries and zoom with deviceScaleFactor 2; it
still needs execution in a browser-capable environment.

## Uploaded-paper offline validation

Seven uploaded PDFs were checked locally; none were added to Git. This is a source
mapping/geometry invariant check, not a linguistic gold-standard or visual audit.

| Paper | Pages | Logical units before → after | Old IDs resolvable |
| --- | --- | --- | --- |
| Swirl (EMJ Wu et al 2014).pdf | 4 | 0 → 0 | 0 / 0 |
| Iso-thermal flow characteristics of rotationally symmetric jets generating a swirl.pdf | 17 | 552 → 560 | 552 / 552 |
| Swirl Scale Suppresion (JMINPRO Wu et al 2012).pdf | 12 | 351 → 358 | 351 / 351 |
| Swirl (EMJ Wu et al 2016).pdf | 3 | 0 → 0 | 0 / 0 |
| Experimental Thermal and Fluid Science.pdf | 13 | 490 → 493 | 490 / 490 |
| Swirl Flow (Minerals Eng Wu et al 2021).pdf | 11 | 378 → 390 | 378 / 378 |
| Experimental and numerical investigation of the iso-thermal flow characteristics.pdf | 19 | 689 → 693 | 689 / 689 |

Total: **79 pages**, including **72 text-bearing pages** across five papers and
seven scan-only pages across two papers. The new index has 2,494 units and 13,221
mapped source rectangles. Assertions verified:

- Every source run has valid original item and UTF-16 bounds.
- Printed run text reconstructs logical text after removing whitespace and
  discretionary hyphen differences, without dropped/duplicated source letters.
- No previously indexed non-whitespace source character disappeared.
- Native rectangles have finite nonnegative geometry and complete-item advances
  close at the original viewport-scaled item width.
- Scan-only PDFs still produce zero fabricated sentences.
- 2,454 of 2,460 old IDs are unchanged; all six changed IDs resolve through their
  exact source anchors. All 2,460 old IDs remain resolvable in this corpus.

The count increase is not by itself evidence that all new boundaries are correct.
No browser screenshots or Windows visual pass are claimed for this patch.

## Known limitations and remaining manual verification

- Reading order, paragraph grouping, caption/heading labels and continuation remain
  heuristics. Four-plus columns, mixed/rotated layouts, footnotes, tables, dense
  references and unusual hanging indents need broader annotated fixtures.
- The existing top/bottom margin filter can exclude readable marginal text.
  Repeated-header/footer classification was not replaced by an unvalidated rule.
- Upright UserUnit/CropBox frames are corrected. Sideways/vertical text retains
  conservative legacy ordering and DOM geometry fallback; it is not guaranteed.
- The native metric model still approximates unusual kerning/TJ adjustments and
  internal multi-character glyph positions. It is not an exact per-occurrence
  font shaping engine. Known widths now survive ligatures and combining marks.
- Unknown hard hyphens are deliberately preserved; the small known-word set is not
  a dictionary. Abbreviations at linguistically ambiguous boundaries may still
  require manual selection. No OCR or external AI recognition was introduced.
- A permanent highlight saved before indexing has discovered a later continuation
  is a snapshot of the geometry available then; it is not silently expanded later.

On Windows, run the full API/browser suites with the local prerequisites available.
Then check the supplied papers: clicks throughout wrapped sentences and both sides
of item boundaries, superscripts, right-click analysis, arrow navigation across
columns/pages, manual selection, zoom/high-DPI focus alignment, and reopening old
highlights/notes/backups. Confirm no unrelated body/caption text is merged.

Recommended next improvements, ranked by impact:

1. Maintain an annotated real-PDF corpus with expected sentence boundaries and
   source-glyph anchors, especially margins, footnotes and figure-interrupted flow.
2. Track per-occurrence glyph clusters and TJ positioning to improve precision for
   complex fonts and kerning beyond the current per-font advance model.
3. Add orientation-aware layout regions and more evidence-driven paragraph/
   continuation decisions before generalizing to arbitrary multi-column layouts.

## Exact files changed

- `src/App.tsx`: resolve saved/current/jump/scroll sentence anchors by source.
- `src/components/PdfPage.tsx`: unique source-based hit resolution, safe DOM fallback,
  CSS-aware coordinate conversion and invalid-range rejection.
- `src/lib/sentences.mjs`: boundaries, spacing, columns, source-anchor resolution,
  conservative hard hyphens and upright viewport normalization.
- `src/lib/pdf.ts`: pass the actual viewport transform into extraction.
- `src/lib/coordinates.ts`: UTF-16 advances, zero widths, ligature precedence and
  viewport-scaled widths; vertical text uses the DOM fallback.
- `src/lib/highlight-geometry.mjs`: strict clipping, UTF-16 advance and hit utilities.
- `src/lib/focus-shape.mjs`: separate three-column source regions without redesigning
  the existing shape union or obstacle logic.
- `src/lib/types.ts`: transient gutter number/array typing.
- `tests/sentences.test.mjs`: scientific/layout/source/navigation regressions.
- `tests/coordinates.test.mjs`: production geometry/click and generated-PDF tests.
- `tests/focus-shape.test.mjs`: three-column connector isolation.
- `tests/support/load-typescript.mjs`: test-only TS loader with explicit doubles.
- `tests/run-unit.mjs`: include geometry/click tests without listeners.
- `tests/run.mjs`: include the same regressions in the full suite.
- `tests/e2e/sentence-selection.spec.ts`: browser regression for partial-item source
  selection and high-DPI zoom, pending execution.
- `PDF_SENTENCE_VALIDATION.md`: this diagnosis, evidence and limitation report.
