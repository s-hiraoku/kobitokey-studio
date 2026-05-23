# KobitoKey Studio

KobitoKey Studio is a dedicated configuration editor for
[`juichi50iii/KobitoKey_QWERTY`](https://github.com/juichi50iii/KobitoKey_QWERTY).

The app is intentionally KobitoKey-specific at this stage. It is not trying to
be a general ZMK editor yet.

## Public Links

- Browser app: <https://kobitokey-studio.pages.dev/>
- User guide: <https://s-hiraoku.github.io/kobitokey-studio/>
- Supported browser target: desktop Chrome / Edge
- Mobile browser target: unsupported screen in the initial release

## What It Does

KobitoKey Studio supports two editing workflows.

| Workflow | Available in | What it changes |
| --- | --- | --- |
| Direct Mode | Browser app and Tauri desktop app | Writes supported ZMK Studio settings directly to a connected keyboard. USB is recommended; Bluetooth is experimental and only works when the ZMK Studio device appears |
| Firmware Mode | Tauri desktop app only | Edits local `KobitoKey_QWERTY` files, triggers GitHub Actions builds, downloads artifacts, and helps copy UF2 files |

Use Direct Mode for quick supported key-binding edits. Use Firmware Mode when
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
- Edit common ZMK binding types with structured controls
- Detect and read ZMK Studio compatible devices over USB serial; Bluetooth is available only when the ZMK Studio device appears
- Write supported key bindings directly to a connected keyboard
- Display, add, edit, and delete keymap combos
- Read and edit trackball parameters from the left/right overlay files
- Preview file-level diffs before saving
- Trigger GitHub Actions builds through the Tauri backend
- Download build artifacts and guide UF2 copying to bootloader volumes

Direct Mode supports key binding writes in both browser and desktop builds.
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

Create a production frontend build:

```sh
npm run build
```

GitHub Actions and artifact workflows use the `gh` CLI from the Tauri backend.
Authenticate it before using those controls:

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
is selected. In Firmware Mode, choose your local firmware clone with the
`参照…` button.

## Deployment Notes

The browser app is deployed by Cloudflare Pages from `main` using:

| Setting | Value |
| --- | --- |
| Framework preset | `None` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |

The guide is deployed separately to GitHub Pages from `docs/`. Detailed release
and documentation publishing checks live in
[`docs/deployment.md`](docs/deployment.md).
