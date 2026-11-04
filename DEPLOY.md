# Share Judu with friends on Render

This is a complete Node web service, not a static mock. `render.yaml` configures both the built frontend and its translation backend on the same public HTTPS origin. An AI key is not needed for translation.

## Publish

1. Push this project's source to your GitHub repository. Do not add `.env`, `.local/papers`, browser backups or private PDFs.
2. Sign into Render and choose **New → Blueprint**. Connect `HotCrispyGranny/reading-aid` and its `main` branch. Render will read `render.yaml`.
3. Apply the Blueprint. After the build succeeds and the service is Live, copy the **actual URL displayed by Render**. Send that URL to your friends. The service name may receive a unique suffix; do not assume a URL until Render supplies it.

No account credentials are stored in this repository. The agent cannot create a service in a Render account without an authorized Render session or API access. An environment preview is not a permanent public deployment.

## What friends can do

Each visitor uploads their own PDF. The file is rendered in their browser; reading position, notes, highlights, vocabulary and translations are stored in that browser's IndexedDB, separately from other visitors. The supplied research PDFs are ignored local files and are not included in the public deployment.

Click **Translate to Chinese** to send only the selected sentence to MyMemory. This is a real free translation service with a shared daily quota and possible rate limits; it is not a guaranteed or unlimited service. The interface shows errors, allows retrying and provides a visible **Open in Google Translate** alternative. It does not invent a result if translation fails. Long passages are split on word boundaries to stay under the provider's per-request byte limit, so cross-chunk context may be lost. Check specialist terms, numbers, variables, units and negations against the paper.

AI chat and detailed analysis remain optional. With no AI key, the public interface prioritizes translation and hides the chat tab. A configured AI key is server-side only, and would be shared by visitors, so do not enable it publicly without adding authentication and usage controls.

Render's free plan may sleep when idle; the first visit can take time to wake up. Browser data survives service restarts but not clearing that browser's site data. Export backups before switching devices. This version has no OCR or account sync.

## Validate deployment

On the real Render URL, open the site, upload a text-based PDF, click a sentence, navigate with ↑/↓, and click Translate to Chinese. Verify a genuine Chinese response. Save a highlight and note, refresh, and check both are still present. The cloud build environment used for development currently blocks the MyMemory hostname, so its real upstream response has not been claimed as verified there. Render's actual outbound connectivity and the provider's current quota must be checked after publication.
