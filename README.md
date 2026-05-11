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
- Detect and read ZMK Studio compatible devices over USB serial
- Write supported key bindings directly to a connected keyboard
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
- `zmk-studio-api` for direct ZMK Studio RPC access

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
- Direct Mode device detection, keymap read, and supported key binding write
- Combo display, add, edit, and delete
- Trackball CPI, acceleration, and gesture threshold editing
- File-level save diff for keymap and overlay files
- Folder picker for the local `KobitoKey_QWERTY` project
- GitHub Actions build trigger, run status, and artifact download
- UF2 file and bootloader volume selection with confirmation before copy

## Direct Mode

Direct Mode is for ZMK Studio style editing against a keyboard connected over
USB. It is separate from the firmware file workflow.

1. Build and run the Tauri app with `npm run tauri dev`.
2. Connect the ZMK Studio enabled half of the keyboard over USB.
3. Switch the top toolbar from `Firmware` to `Direct`.
4. Click `検出` to list likely Studio serial ports.
5. Select the device port and click `読み込み`.
6. Select a key in the physical layout.
7. Change the binding and click `実機へ書き込み`.

The write is sent through the ZMK Studio RPC API and saved on the device. The
app then reloads the keymap from the device so the screen reflects the
persistent state.

Direct Mode currently supports these binding families:

- `&kp KEY`
- `&kt KEY`
- `&lt LAYER KEY`
- `&mt HOLD_KEY TAP_KEY`
- `&sk KEY`
- `&sl LAYER`
- `&mo LAYER`
- `&tog LAYER`
- `&to LAYER`
- `&bt COMMAND VALUE`
- `&mkp VALUE`
- `&mmv VALUE`
- `&msc VALUE`
- `&trans`
- `&none`
- `&studio_unlock`
- `&caps_word`
- `&key_repeat`
- `&sys_reset`
- `&bootloader`
- `&soft_off`
- `&gresc`

Use Firmware Mode for combo editing, trackball CPI/acceleration/gesture
settings, and any binding that Direct Mode does not support yet. Those settings
live in keymap/overlay/conf files and still need build + UF2 flashing.

## Remaining Notes

- The browser dev server can show fixture data and most UI behavior.
- File saving, folder picking, GitHub Actions, artifact download, and UF2 copy
  require the Tauri app shell.
- Direct Mode also requires the Tauri app shell, Rust/Cargo, a ZMK Studio
  enabled firmware, and USB serial access to the connected keyboard.
- GitHub tokens are not stored in the renderer; GitHub operations are delegated
  to the backend through `gh`.
