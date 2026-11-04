# Desktop reader QA

final result: passed

Scope: implement the user's reference **sentence spotlight behavior**, with the explicitly requested desktop PDF reading layout. The social media/mobile device chrome in the supplied image is not part of the requested website.

Inspected the supplied reference in conversation and actual Chromium screenshots at 1440×1000 using the uploaded Minerals Engineering 2021 paper. Verified native paper layout, a clear sentence with a narrow rounded outline, lower-contrast context, independent left navigation and right study panel. At 143% zoom, the spotlight ends at “scale.” while the next “The” stays dim. Multiline behavior is verified in the browser suite: two independent per-line rectangles, not a large enclosing rectangle.

No P0/P1/P2 visual blockers found in this desktop scope. The PDF remains white in dark/sepia UI themes to preserve the original figures. Remaining tradeoffs: toolbar labels compact on narrow laptop widths; complicated PDF encodings can still need manual selection. No claim of pixel-for-pixel recreation of the reference's unrelated video UI.

Functional evidence and limitations: see VALIDATION.md. Real AI output was not available and was not visually passed off as generated analysis.

## Olive palette and English UI update

User supplied palette applied as tokens: Olive Leaf #65704A, Pistachio #AFB88F, Butter Yellow #E9D887, Lemon Cream #F4EAC2, Warm Stone #B6A48B. English headings, navigation, state messages and error messages; Chinese translation output remains Chinese. Note category display labels are translated without rewriting stored records. Translation now has its own primary action independent of optional AI tools. Browser tests cover English document language and the computed olive primary color. Latest screenshots inspected for both welcome and actual PDF reading states at 1440×1000.
