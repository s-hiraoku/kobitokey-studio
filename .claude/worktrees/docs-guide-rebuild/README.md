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
- Public release target: browser app. Tauri desktop builds are for limited local
  distribution, not the primary public entry point.

## What It Does

KobitoKey Studio supports two editing workflows.

| Workflow | Available in | What it changes |
| --- | --- | --- |
| Direct Mode | Browser app; Tauri desktop for limited local distribution | Writes supported ZMK Studio settings directly to a connected keyboard. USB is recommended; Bluetooth is experimental and only works when the ZMK Studio device appears |
| Firmware Mode | Browser app; Tauri desktop for limited local distribution | Browser app edits `KobitoKey_QWERTY` through GitHub API, triggers Actions builds, downloads artifacts, and classifies left/right UF2 files. Tauri edits a local clone and helps copy UF2 files |

Use Direct Mode for quick supported key action edits. Use Firmware Mode when
the change must stay in the firmware repository, needs Combo or Trackball file
editing, or requires a build and UF2 flash workflow.

For end-user steps, start with the published docs:

- [Guide top](https://s-hiraoku.github.io/kobitokey-studio/)
- [Firmware Mode](https://s-hiraoku.github.io/kobitokey-studio/firmware-mode/)
- [Direct Mode](https://s-hiraoku.github.io/kobitokey-studio/direct-mode/)
- [Troubleshooting (困ったとき)](https://s-hiraoku.github.io/kobitokey-studio/faq/)
- [Release Checklist](https://s-hiraoku.github.io/kobitokey-studio/release-checklist/)
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
- Browser Firmware Mode can read firmware files from GitHub, create one commit for the managed files, dispatch `build.yml`, find the matching run, download artifacts, classify left/right UF2 files, and write UF2 files to verified UF2 bootloader folders through the File System Access API when available. It also exposes side-fixed UF2 download buttons for manual bootloader copy fallback

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
`BROWSER_FIRMWARE_TMP_DIR`, `RUNNER_TEMP`, or the OS temp directory, and invokes
the local `node_modules` test/build/Wrangler tools directly so local sandboxed
runs and GitHub Actions do not depend on user preference directories or a
global `npm` / `npx` binary on `PATH`.

Before treating browser Firmware Mode as public-release ready, fill an external
E2E evidence report from `docs/browser-firmware-e2e-evidence.template.json` and
validate it. The validator rejects template placeholders, unchecked Worker OAuth
routes, unsupported OAuth scope acceptance, mismatched GitHub commit/run URLs,
run head SHA or branch mismatches, placeholder hashes, missing production/API
security header proof, unconfirmed left/right flash prompts, missing
keyboard-half checks, missing flash method proof (`direct-copy` or
`download-copy`), missing CI proof, missing UI smoke evidence, missing key,
Combo, Trackball, release wizard precondition, artifact provenance proof,
manifest left/right target proof, artifact/build provenance match proof, or
missing public entry link URL proof or layer structure action proof:

```sh
npm run check:browser-firmware:e2e-report -- path/to/report.json
```

To see the current public-release blockers without deploying or printing
secrets, run release-status without an E2E report first:

```sh
npm run check:browser-firmware:release-status
```

For automation, add `--json` after `--` to get a machine-readable result with
`ready`, `blockerCount`, `warningCount`, `nextActions`, relevant `links`,
copy-ready placeholder `commands`, the current-head release gate and production Worker deploy workflow
status with Actions run evidence links, and per-check statuses:

```sh
npm run check:browser-firmware:release-status -- --json
```

The external E2E next action pre-fills the env-template seed with the current
production URL, app commit SHA, and release-gate Actions run URL when available.

After external E2E evidence exists, pass it to let release-status validate the
current app commit against the report and use the report as a fallback when the
GitHub API rate limit blocks Actions lookup:

```sh
npm run check:browser-firmware:release-status -- --json --e2e-report path/to/report.json
```

The same `nextActions.commands` list also includes the final
`check:browser-firmware:public-release` command and the release bundle command
to run after the E2E report and production deploy/preflight evidence are
complete.

To create a Markdown handoff for the deploy / QA owner, render the same status
as a checklist with commands, evidence links, and a prefilled E2E env-template
seed command:

```sh
npm run write:browser-firmware:release-handoff -- --e2e-report path/to/report.json --out /tmp/browser-firmware-release-handoff.md
```

For final QA, a single bundle command writes the machine-readable status,
handoff, prefilled `browser-firmware-e2e.env`, and a short README into one
directory. If `BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID` or
`VITE_GITHUB_OAUTH_CLIENT_ID` is already set, the E2E env template reuses that
same public OAuth client id:

```sh
npm run write:browser-firmware:release-bundle -- --out-dir /tmp/browser-firmware-release-bundle
```

If GitHub API rate limits block the Actions release-gate lookup, set
`BROWSER_FIRMWARE_RELEASE_STATUS_GITHUB_TOKEN` to a token that can read this
repository's Actions runs. If you already have a validated external E2E report
for the current app commit, `release-status --e2e-report` can use that report to
prove the release-gate job while warning that the deploy workflow job was not
read directly from GitHub.

After a production deployment, run the lightweight preflight first to catch
missing Worker routes, missing artifact proxy input validation, or release
security headers before starting hardware QA:

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
machine, use the browser Firmware Mode deploy wrapper. It requires the same
public GitHub OAuth app client id in `VITE_GITHUB_OAUTH_CLIENT_ID` and
`BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID` for non-dry-run deploys, runs
merge readiness, the full local browser Firmware Mode check, a production
build, Wrangler deploy, and then OAuth production preflight with
`BROWSER_FIRMWARE_PREFLIGHT_APP_COMMIT_SHA` set to the current git `HEAD`:

```sh
VITE_GITHUB_OAUTH_CLIENT_ID=github-client-id BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID=github-client-id npm run deploy:browser-firmware
```

The plain `npm run deploy` command also routes through the same OAuth-required
wrapper:

```sh
npm run deploy
```

The same guarded production Worker deploy can run from GitHub Actions. Start
the `Deploy GitHub Pages` workflow manually and enable the
`deploy_browser_firmware_worker` input. Configure these repository secrets
first: `VITE_GITHUB_OAUTH_CLIENT_ID`, `CLOUDFLARE_ACCOUNT_ID`, and
`CLOUDFLARE_API_TOKEN`. When this input is enabled, the GitHub Pages deploy job
is skipped so the manual run updates only the browser app Worker.

```sh
gh workflow run pages.yml --ref main -f deploy_browser_firmware_worker=true
```

After an Actions deploy, set the same public OAuth client id locally before
rerunning `release-status` or the stricter production preflight:

```sh
export VITE_GITHUB_OAUTH_CLIENT_ID='<GitHub OAuth App client id>'
export BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID='<GitHub OAuth App client id>'
npm run check:browser-firmware:release-status -- --json
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
the deployed app commit reported by `/api/release-metadata`. Release metadata
also reports whether a GitHub OAuth client id was configured in the production
build, without printing the client id itself:

```sh
VITE_GITHUB_OAUTH_CLIENT_ID=github-client-id BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID=github-client-id npm run check:browser-firmware:production-release-preflight
```

For the final public-release decision, use the combined gate with the validated
external E2E report. This command validates the evidence first, then fails
unless merge readiness, the OAuth production preflight, and `release-status`
`ready: true` with the same E2E report also pass. The
production URL used for preflight must match `production.url` in the E2E report,
and the report URL must use the expected public production origin
(`https://kobitokey-studio.s-hiraoku.workers.dev` by default, or
`BROWSER_FIRMWARE_EXPECTED_PRODUCTION_ORIGIN` for a future custom domain). The
report `production.fetchUrl` must match `production.url`, so a test fetch
override cannot be used as public evidence. The report `ci.runUrl` must point to
the `s-hiraoku/kobitokey-studio` Actions run, `ci.runHeadSha` must match
`ci.appCommitSha`, the CI run and its `Browser firmware release gates` job must
be completed/success, `production.appCommitSha` must match `ci.appCommitSha`,
and `ci.appCommitSha` must match the current git `HEAD`. Run it from a clean working tree
so the release validators and docs are the committed files being released:

```sh
VITE_GITHUB_OAUTH_CLIENT_ID=github-client-id BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID=github-client-id npm run check:browser-firmware:public-release -- --e2e-report path/to/report.json
```

To reduce manual entry, generate the report from production/GitHub/UF2 inputs
and validate it in one step. The collector reads the GitHub commit file list
from the API, so a commit touching anything outside the managed firmware files
fails the final validator. The list may contain only the file that actually
changed, such as `config/KobitoKey.keymap` for a key edit. It also records
Actions artifact names, IDs, and sizes, starts the deployed OAuth device-code
flow through the Worker, downloads the artifact zip metadata path, and records
the UF2 and manifest entry hashes so the validator can reject left/right UF2
files or classification claims that are not backed by the GitHub artifact.
Manifest-based classification must point to UF2 entries from the same GitHub artifact.
Use the browser Firmware Mode production URL with `?mode=firmware` and provide
the public OAuth app client id. Start by printing an env template, then fill the
placeholders before collecting evidence:

```sh
npm run collect:browser-firmware:e2e-report -- --print-env-template > /tmp/browser-firmware-e2e.env
source /tmp/browser-firmware-e2e.env
npm run collect:browser-firmware:e2e-report -- --out path/to/report.json
```

Set `BROWSER_FIRMWARE_E2E_BRANCH` to the firmware repository branch used in
`Commit & Build`, not to this app repository branch.

On a release QA machine with Chrome/Edge or Playwright Chromium available, run
the rendered UI smoke for the browser Firmware Mode buttons and right pane. You
can run it directly, or let the external E2E collector execute it against the
production URL with `--run-ui-smoke`. The collector invokes the local Node smoke
script directly and records that command plus the exact public entry URLs in the
evidence report:

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
browser UI while testing, grant repository Contents write and Actions write
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

The browser app is served from a Cloudflare Worker with static assets. Do not
treat a GitHub Pages deploy, CI success, or a merge to `main` alone as proof
that the browser app is public-release ready. The production Worker must expose
the target commit through `/api/release-metadata` and pass the OAuth production
preflight.

Use the guarded deploy wrapper from an authenticated machine:

```sh
VITE_GITHUB_OAUTH_CLIENT_ID=github-client-id BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID=github-client-id npm run deploy:browser-firmware
```

Or run the same guarded path from GitHub Actions by manually starting
`Deploy GitHub Pages` with `deploy_browser_firmware_worker` enabled. That path
requires repository secrets `VITE_GITHUB_OAUTH_CLIENT_ID`,
`CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN`, and skips the GitHub Pages
deploy job for that manual run.

The underlying Cloudflare build should match:

| Setting | Value |
| --- | --- |
| Framework preset | `None` |
| Build command | `npm run build` |
| Build output directory | `dist/client` |
| Root directory | `/` |

The guide is deployed separately to GitHub Pages from `docs/`. Detailed Worker
release and documentation publishing checks live in
[`docs/deployment.md`](docs/deployment.md).
