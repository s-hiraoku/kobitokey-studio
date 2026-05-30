# KobitoKey Studio

KobitoKey Studio is a dedicated configuration editor for
[`juichi50iii/KobitoKey_QWERTY`](https://github.com/juichi50iii/KobitoKey_QWERTY).

The app is intentionally KobitoKey-specific at this stage. It is not trying to
be a general ZMK editor yet.

## Public Links

- Browser app: <https://kobitokey-studio.s-hiraoku.workers.dev/>
- User guide: <https://s-hiraoku.github.io/kobitokey-studio/>
- Supported browser target: desktop Chrome / Edge
- Mobile browser target: unsupported screen in the initial release

## What It Does

KobitoKey Studio supports two editing workflows.

| Workflow | Available in | What it changes |
| --- | --- | --- |
| Direct Mode | Browser app and Tauri desktop app | Writes supported ZMK Studio settings directly to a connected keyboard. USB is recommended; Bluetooth is experimental and only works when the ZMK Studio device appears |
| Firmware Mode | Browser app beta and Tauri desktop app | Browser beta edits `KobitoKey_QWERTY` through GitHub API, triggers Actions builds, downloads artifacts, and classifies left/right UF2 files. Tauri edits a local clone and helps copy UF2 files |

Use Direct Mode for quick supported key action edits. Use Firmware Mode when
the change must stay in the firmware repository, needs Combo or Trackball file
editing, or requires a build and UF2 flash workflow.

For end-user steps, start with the published docs:

- [Quick Start](https://s-hiraoku.github.io/kobitokey-studio/quick-start/)
- [Usage Guide](https://s-hiraoku.github.io/kobitokey-studio/usage-guide/)
- [Deployment](https://s-hiraoku.github.io/kobitokey-studio/deployment/)

## Current Scope

- Load and edit `config/KobitoKey.keymap`
- Show the KobitoKey physical layout across 10 layers
- Render the left half from hand-tuned coordinates and mirror it for the right half
- Edit common ZMK key actions with structured controls
- Detect and read ZMK Studio compatible devices over USB serial; Bluetooth is available only when the ZMK Studio device appears
- Write supported key actions directly to a connected keyboard
- Display, add, edit, and delete keymap combos
- Read and edit trackball parameters from the left/right overlay files
- Preview file-level diffs before saving
- Trigger GitHub Actions builds through the browser GitHub API or the Tauri backend
- Download build artifacts and guide UF2 copying to bootloader volumes
- Browser Firmware beta can read firmware files from GitHub, create one commit for the managed files, dispatch `build.yml`, find the matching run, download artifacts, classify left/right UF2 files, and write UF2 files to verified UF2 bootloader folders through the File System Access API when available. It also exposes side-fixed UF2 download buttons for manual bootloader copy fallback

Direct Mode supports key action writes in both browser and desktop builds.
Combo and Trackball are reference-only in Direct Mode because the current
KobitoKey firmware does not expose runtime Studio RPCs for those settings.
Browser Direct Mode uses Web Serial / Web Bluetooth and requires Chrome or Edge
from localhost or HTTPS.

## Stack

- Tauri 2
- React 18
- TypeScript
- Vite
- `zmk-studio-api` / `@zmkfirmware/zmk-studio-ts-client`

## Development

Install dependencies:

```sh
npm install
```

Run the browser build:

```sh
npm run dev
```

Open `http://127.0.0.1:1420/` in desktop Chrome or Edge.

Run the full Tauri desktop app:

```sh
npm run tauri dev
```

Run tests:

```sh
npm test
```

Run the browser Firmware Mode local release check:

```sh
npm run check:browser-firmware
```

This uses `scripts/run-browser-firmware-check.mjs` to run the browser firmware
release audit, unit tests, production build, and Wrangler dry-run deploy
packaging. The runner sets `WRANGLER_LOG_PATH` under
`BROWSER_FIRMWARE_TMP_DIR`, `RUNNER_TEMP`, or the OS temp directory so local
sandboxed runs and GitHub Actions do not depend on user preference directories.

Before treating browser Firmware Mode as public-release ready, fill an external
E2E evidence report from `docs/browser-firmware-e2e-evidence.template.json` and
validate it. The validator rejects template placeholders, unchecked Worker OAuth
routes, unsupported OAuth scope acceptance, mismatched GitHub commit/run URLs,
run head SHA or branch mismatches, placeholder hashes, missing production/API
security header proof, unconfirmed left/right flash prompts, missing
keyboard-half checks, missing CI proof, missing UI smoke evidence, missing key,
Combo, Trackball, or release wizard precondition proof, and missing layer
structure action proof:

```sh
npm run check:browser-firmware:e2e-report -- path/to/report.json
```

After a production deployment, run the lightweight preflight first to catch
missing Worker routes or release security headers before starting hardware QA:

```sh
npm run check:browser-firmware:production-preflight
```

For a PR or feature-branch Workers preview, pass the preview URL explicitly:

```sh
BROWSER_FIRMWARE_PRODUCTION_URL=https://feature-firmware-mode-kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware npm run check:browser-firmware:production-preflight
```

A passing preview preflight is not production release evidence. The default
production URL must pass after the target commit is deployed; missing release
security headers, missing `/api/release-metadata`, or 405 responses from Worker
API routes mean production is still on an older deployment.

To deploy the current commit to the production Worker from an authenticated
machine, use the browser Firmware Mode deploy wrapper. It runs merge readiness,
the full local browser Firmware Mode check, a production build, Wrangler deploy,
and then production preflight with `BROWSER_FIRMWARE_PREFLIGHT_APP_COMMIT_SHA`
set to the current git `HEAD`:

```sh
npm run deploy:browser-firmware
```

For the final OAuth release preflight, pass the public GitHub OAuth app client
id and require OAuth verification during the post-deploy check:

```sh
BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID=github-client-id npm run deploy:browser-firmware -- --require-oauth
```

Before merging or opening the release PR, check whether the branch is dirty,
behind `origin/main`, or has a non-destructive merge conflict with main:

```sh
npm run check:browser-firmware:merge-readiness
```

To prove the deployed OAuth proxy can start the GitHub device flow, pass the
public OAuth app client id as well. This is the stricter preflight to use for
the final browser Firmware Mode release gate; it checks both the Worker device
flow, the deployed frontend bundle that powers the GitHub connect button, and
the deployed app commit reported by `/api/release-metadata`:

```sh
BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID=github-client-id npm run check:browser-firmware:production-release-preflight
```

For the final public-release decision, use the combined gate with the validated
external E2E report. This command fails unless merge readiness, the OAuth
production preflight, and the evidence validator all pass. The production URL
used for preflight must match `production.url` in the E2E report, and the
report URL must use the expected public production origin
(`https://kobitokey-studio.s-hiraoku.workers.dev` by default, or
`BROWSER_FIRMWARE_EXPECTED_PRODUCTION_ORIGIN` for a future custom domain). The
report `production.fetchUrl` must match `production.url`, so a test fetch
override cannot be used as public evidence. The report `production.appCommitSha`
must match `ci.appCommitSha`, and `ci.appCommitSha` must match the current git
`HEAD`:

```sh
BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID=github-client-id npm run check:browser-firmware:public-release -- --e2e-report path/to/report.json
```

To reduce manual entry, generate the report from production/GitHub/UF2 inputs
and validate it in one step. The collector reads the GitHub commit file list
from the API, so a commit touching anything outside the managed firmware files
fails the final validator. It also records Actions artifact names, IDs, and
sizes, starts the deployed OAuth device-code flow through the Worker, downloads
the artifact zip metadata path, and records the UF2 and manifest entry hashes so
the validator can reject left/right UF2 files or classification claims that are
not backed by the GitHub artifact. Use the browser Firmware Mode production URL
with `?mode=firmware` and provide the public OAuth app client id:

```sh
BROWSER_FIRMWARE_E2E_OAUTH_CLIENT_ID=github-client-id npm run collect:browser-firmware:e2e-report -- --out path/to/report.json
```

On a release QA machine with Chrome/Edge or Playwright Chromium available, run
the rendered UI smoke for the browser Firmware Mode buttons and right pane. You
can run it directly, or let the external E2E collector execute it against the
production URL with `--run-ui-smoke`:

```sh
npm run check:browser-firmware:ui
npm run collect:browser-firmware:e2e-report -- --out path/to/report.json --run-ui-smoke
```

Create a production frontend build:

```sh
npm run build
```

Browser Firmware Mode uses a same-origin Cloudflare Worker API for GitHub OAuth
device flow and artifact zip proxying. Set `VITE_GITHUB_OAUTH_CLIENT_ID` for the
browser OAuth button. The OAuth flow requests the `repo` scope so it can read
and commit managed firmware files and dispatch Actions builds; the Worker rejects
broader or unrelated requested scopes. If you paste a fine-grained token in the
beta UI while testing, grant repository Contents write and Actions write
permissions only for the firmware repository.

Tauri Firmware Mode still uses the `gh` CLI from the Tauri backend. Authenticate
it before using those controls:

```sh
gh auth login
```

## Project Files

- App source: `src/`
- Tauri backend: `src-tauri/`
- Browser fixtures: `public/fixtures/`
- Published guide source: `docs/`
- GitHub Pages workflow: `.github/workflows/pages.yml`

The app ships with fixture copies of the current KobitoKey files in
`public/fixtures/`, so the UI can run before a local `KobitoKey_QWERTY` folder
or GitHub repository is selected. In browser Firmware Mode, use the
`Build & Flash` tab to load a GitHub repository. In Tauri Firmware Mode, choose
your local firmware clone with the `参照…` button.

## Deployment Notes

The browser app is deployed as a Cloudflare Worker with static assets from `main`
using:

| Setting | Value |
| --- | --- |
| Framework preset | `None` |
| Build command | `npm run build` |
| Build output directory | `dist/client` |
| Root directory | `/` |

The guide is deployed separately to GitHub Pages from `docs/`. Detailed release
and documentation publishing checks live in
[`docs/deployment.md`](docs/deployment.md).
