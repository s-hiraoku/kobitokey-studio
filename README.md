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
- Preview a save-time diff
- Read key trackball parameters from the left/right overlay files
- Prepare the app surface for GitHub Actions artifact and UF2 flashing support

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

## Fixtures

The app ships with fixture copies of the current KobitoKey files in
`public/fixtures/`, so the UI can run in a browser before the Tauri shell is
available.

When running inside Tauri, the default project path points at:

```txt
/Volumes/SSD/ghq/github.com/s-hiraoku/KobitoKey_QWERTY
```

## Roadmap

Near-term:

- Combo parser and combo display on the physical layout
- Combo editing and serialization
- Binding editor UI for common ZMK behavior types
- Trackball setting editor with overlay serialization

Later:

- Folder picker and project validation
- Safer save flow with file-level diffs
- GitHub Actions workflow trigger and artifact download
- Guided UF2 flashing for left/right/settings reset firmware
