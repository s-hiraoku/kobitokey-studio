# KobitoKey Studio

KobitoKey Studio is a dedicated desktop editor for
[`s-hiraoku/KobitoKey_QWERTY`](https://github.com/s-hiraoku/KobitoKey_QWERTY).

The app is intentionally KobitoKey-specific at this stage. It is not trying to
be a general ZMK editor yet.

## Current Scope

- Load `config/KobitoKey.keymap`
- Show the KobitoKey physical layout across 10 layers
- Render the left half from hand-tuned coordinates and mirror it for the right
  half
- Show shortened key labels on the keyboard while preserving full bindings in
  the inspector and tooltip
- Edit a selected key binding
- Edit common ZMK binding types with structured controls
- Display and edit keymap combos
- Preview file-level diffs before saving
- Read and edit trackball parameters from the left/right overlay files
- Trigger GitHub Actions builds through the Tauri backend
- Download build artifacts and guide UF2 copying to bootloader volumes

## Design Direction

KobitoKey Studio follows the actual keyboard shape instead of a generic
ortholinear grid. The layout renderer includes:

- Column-staggered main keys
- Separate main-key and thumb/trackball bases
- Mirrored left/right halves
- Trackball, reset button, and LED affordances

The source of truth for the visual layout currently lives in
`src/lib/kobitokeyPhysicalLayout.ts`.

## Stack

- Tauri 2
- React 18
- TypeScript
- Vite

## Development

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:1420/`.

For a production frontend build:

```sh
npm run build
```

For the full desktop app, Rust and Cargo are required:

```sh
npm run tauri dev
```

GitHub Actions and artifact workflows use the `gh` CLI from the Tauri backend.
Authenticate it before using those controls:

```sh
gh auth login
```

## Fixtures

The app ships with fixture copies of the current KobitoKey files in
`public/fixtures/`, so the UI can run in a browser before the Tauri shell is
available.

When running inside Tauri, the default project path points at:

```txt
/Volumes/SSD/ghq/github.com/s-hiraoku/KobitoKey_QWERTY
```

## Implemented Workflows

- Physical keymap viewing across layers
- Binding editing with raw and structured inputs
- Combo display, add, edit, and delete
- Trackball CPI, acceleration, and gesture threshold editing
- File-level save diff for keymap and overlay files
- Folder picker for the local `KobitoKey_QWERTY` project
- GitHub Actions build trigger, run status, and artifact download
- UF2 file and bootloader volume selection with confirmation before copy

## Remaining Notes

- The browser dev server can show fixture data and most UI behavior.
- File saving, folder picking, GitHub Actions, artifact download, and UF2 copy
  require the Tauri app shell.
- GitHub tokens are not stored in the renderer; GitHub operations are delegated
  to the backend through `gh`.
