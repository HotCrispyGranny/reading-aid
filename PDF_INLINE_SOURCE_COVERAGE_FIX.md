# Scientific inline text: source-coverage follow-up

Worktree: `/workspace/reading-aid-pdf-sentences`

Branch: `fix/scientific-pdf-sentences`

Baseline: `147b6c216bf2606ecc21f8b55da0877668a40a9e`

## Root cause and first loss stage

All three Windows examples reproduce in the supplied *Experimental and numerical
investigation of the iso-thermal flow characteristics.pdf*. Page numbers below
are PDF page numbers, including the cover page. Item indices refer to filtered
PDF.js string items, as in the renderer, and offsets are original UTF-16 offsets.

All affected source strings survive PDF.js extraction, physical-line clustering,
and column ordering. Their normal, raised, and lowered glyph runs are grouped
into the correct visual lines. None of these lines is classified as a caption,
heading, spanning line, header/footer, or nomenclature definition.

The first loss occurs in `prose(line)`, called by `extractPage()` before block
construction and its normalization/source map. The old numeric-row heuristic
rejects a line if it has at least four PDF items, at least three numeric tokens,
and at least 75% short items (at most three whitespace-separated tokens each).
It confuses inline math/citation font fragments with table cells. `!valid` then
clears the block/previous line and skips the entire physical line; sentence
segmentation and `sourceRuns()` never see its characters.

| Case | Location / source items | Reconstructed physical line | Old rejection evidence |
| --- | --- | --- | --- |
| 1: top line | p3, left column, y=55.935; 11,13,15,16,18,20 | `4000 < ReD < 15 000, the flow stability and the flame length` | 6 items, 3 numeric tokens, 5 short items |
| 2: hyphen/citations | p2, right column, y=665.190; 150,151,153,154,156 | `ment.16–23 For example, Tanaka17,18 found that, for a tran-` | 5 items, 3 numeric tokens, 4 short items |
| 3: subscript/angles | p3, left column, y=546.097; 140,142,143,145–153 | `jet combustor with αj = 0◦, 10◦, 20◦, 30◦, but they also did` | 12 items, 4 numeric tokens, 11 short items |

Case 1 is the same classifier defect, not a special first-line bug: its baseline
is inside the retained page region (top cutoff 47.52), and its subscript `D` is
already attached to the correct line. Cases 2 and 3 are not lost by hyphen joining,
superscript/subscript clustering, UTF-16 conversion, or focus geometry. Dropping
the complete line merely makes the failure appear to start after `arrange-` or
`separated-` and resume at later normal text.

## Targeted change

The numeric-fragment check now requires **sparse prose evidence**, fewer than
three letter sequences of length three or more, before it can reject a line.
This reuses the existing inline-equation prose evidence threshold. A sentence
containing several words is no longer discarded just because citation/math
changes split it into short source items. Existing letter-density, equation,
numeric-row, margin, and column protections remain in place. No line grouping,
column ordering, source-run generation, sentence boundary, or continuation
algorithm was changed.

The conservative hard-hyphen vocabulary also recognizes `arrangement`,
`arrangements`, and `transitional`. Their known line-break spellings normalize
without losing the printed hyphen's source offset. The real compound
`separated-jet` keeps its hyphen. Unknown hard hyphens retain the existing
conservative behavior.

Once restored, existing segmentation correctly ends the first sentence after
`ment.16–23` and begins the next at `For example, Tanaka17,18 ...`. The PDF encodes
its raised references as ordinary digits at a smaller size/raised baseline, and
its angle marks as U+25E6 `◦`. Both those original strings and their original
coordinates remain intact; no superscript stripping or symbol substitution is
performed. Tests separately cover literal Unicode superscripts and U+00B0 `°`.

## Before/after source ranges on the actual PDF

Each listed range was absent from **every** sentence before this change. Every
non-whitespace source character now occurs exactly once. `iN[a,b)` means item N,
original UTF-16 offsets a through b, excluding b. Full source items, font names,
sizes, and transforms for the excerpts are stored in the JSON regression fixture.

| Case | Newly included source ranges | Resulting logical unit |
| --- | --- | --- |
| 1 | p3: i11[0,4), i13[0,1), i15[0,2), i16[0,1), i18[0,1), i20[0,47) | Starts `4000 < ReD < 15 000 ...`, continues through `in the merged flow ...`, ends `is increased.` |
| 2, first sentence | p2: i150[0,5), i151[0,5) | `These have ... their arrangement.16–23` |
| 2, next sentence | p2: i153[0,19), i154[0,5), i156[0,23) | `For example, Tanaka17,18 found ... transitional/turbulent ... nozzle width.` |
| 3 | p3: i140[0,18), i142[0,1), i143[0,1), i145[0,3), i146[0,1), i147[0,4), i148[0,1), i149[0,4), i150[0,1), i151[0,4), i152[0,1), i153[0,19) | `Similarly, Boushaki and Sautet28 ... separated-jet combustor ... inclined-jets cases.` |

The three skipped lines recover respectively **48**, **51**, and **48**
non-whitespace source characters. Native PDF glyph advances and `itemRect()`
produce valid rectangles for all **147**; midpoint hit-testing returns the
original offset and correct sentence for every one. These are offline checks
of actual source-backed geometry, not rectangles fabricated from sentence text.

A 19-page source-coverage audit recovered **2,255** non-whitespace characters
overall, with **zero previously indexed characters lost and zero duplicates**.
Coverage is also unchanged between the page-local index and `joinContinuations()`.
Joined logical units change from 693 to 674 because repairing gaps allows formerly
separated fragments to join; a lower count is not itself proof of linguistic
correctness. Physical line grouping/column assignments are unchanged.

## Files changed

- `src/lib/sentences.mjs`: gate numeric-fragment rejection on sparse prose
  evidence; recognize three known line-break words.
- `tests/scientific-source-coverage.test.mjs`: 13 deterministic regressions and
  exact-once source-coverage, unique sentence hit, and navigation assertions.
- `tests/support/scientific-inline-runs.json`: 47 original source-item excerpts
  from the three failing regions, retaining indices, strings and transforms.
  These are small excerpts, not an added copy of the PDF. Fixture boundaries may
  intentionally start/end inside surrounding paragraphs.
- `tests/run-unit.mjs` and `tests/run.mjs`: register the new regressions.
- `PDF_INLINE_SOURCE_COVERAGE_FIX.md`: this report.

No UI, AI, storage, coordinate, highlight, outline, CSS, dependency, or deployment
implementation was changed. The original checkout's branch, HEAD, working-tree
status and all tracked/untracked nonignored file hashes match the pre-task
snapshot, including the pending sidebar changes.

## Regression and build results

- New targeted suite: **13 passed**. Against the unmodified baseline parser,
  the same suite has **9 failures / 4 passes**, reproducing the missing-line
  regressions and conservative word-normalization differences.
- `node tests/run-unit.mjs`: **159 passed, 0 failed, 0 skipped**. This includes
  existing three-column, Sec., terminal et al., hard-hyphen, surrogate-pair,
  ligature, cross-column/page, figure-interruption and focus-outline regressions.
- `npm run build`: passed TypeScript and production Vite build; the existing
  warning about minified chunks above 500 kB remains.
- `git diff --check`: passed.
- The new tests cover real raised/lowered baselines, `arrange-`/`ment.` and
  citations before `For example`, Tanaka references, `separated-`/`jet`, Greek
  alpha/subscript j, four angle values, Unicode superscripts, Unicode minus/dash,
  astral UTF-16 offsets, item-packing variants, two columns, cross-page flow,
  navigation, and explicit exclusion controls for sparse tables/equations.
  Every intended fixture character is checked for exact-once original source
  coverage and unique sentence resolution; the negative controls document why
  they intentionally have no sentence coverage.
- `npm test` was not rerun: it includes the known localhost-listener API test
  denied with `EPERM`. The full server-free suite covers the remaining tests.
  Browser/E2E execution was not rerun; the earlier Chromium sandbox failure
  remains unverified here. No server, preview, browser, or listener was started.

## Remaining limits and Windows QA

The prose threshold remains a heuristic, not a complete table/equation classifier.
Extremely symbol-heavy prose, dense numeric lists, table-like sentences and
ambiguous hard hyphens still need a broader annotated corpus. Existing header,
footer and mixed-layout rules are unchanged. In this document the p2 publisher
footer remains an independent indexed unit and can prevent the preceding
`... within the range` fragment from joining to the p3 numeric line; the restored
p3 line itself joins its following body lines correctly. That separate footer
classification issue was not silently changed as part of this targeted fix.

The previous exterior-outline/glyph-clearance fix is byte-for-byte unchanged.
Its multi-zoom/DPR raster regressions still pass. Windows browser validation is
still needed for clicking every restored fragment, Up/Down navigation, real font
antialiasing/zoom, and the now-complete scientific sentence outlines. Offline
source coverage does not establish universal visual or linguistic correctness.

No commit, push, merge, or deployment was made.
