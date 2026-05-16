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
- Edit common ZMK binding types with click/tap based structured controls
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
- Binding editing with keycode, layer, mouse, Bluetooth, and special binding
  pickers
- Direct Mode device detection, keymap read, and supported key binding write
- Combo display, add, edit, delete, and key-position selection
- Trackball CPI, acceleration, and gesture threshold editing
- File-level save diff for keymap and overlay files
- Folder picker for the local `KobitoKey_QWERTY` project
- GitHub Actions build trigger, run status, and artifact download
- UF2 file and bootloader volume selection with confirmation before copy

## Firmware Flashing

Firmware flashing writes UF2 files to the left and right halves separately.
This is the same workflow as manually swapping the USB cable:

1. Build or download both artifacts.
2. Connect the left half over USB and put it into bootloader mode.
3. Copy the left UF2 to the left bootloader volume.
4. Move the USB cable to the right half and put it into bootloader mode.
5. Copy the right UF2 to the right bootloader volume.

If both halves appear as bootloader volumes at the same time, they can be
flashed without swapping the cable, but the app still treats left and right UF2
files as separate targets. Direct Mode is different: it saves settings to the
currently connected ZMK Studio device over USB or Bluetooth and does not replace
both halves' firmware images.

## Direct Mode

Direct Mode is for ZMK Studio style editing against a keyboard connected over
USB or Bluetooth. It is separate from the firmware file workflow.

1. Build and run the Tauri app with `npm run tauri dev`, or open the browser
   build in Chrome/Edge from `localhost` or HTTPS.
2. Connect the ZMK Studio enabled side of the keyboard over USB or Bluetooth.
3. Switch the top toolbar from `Firmware` to `Direct`.
4. In Tauri, click `検出`/`読み込み` to use the serial port list. In the browser,
   click `Connect via USB` or `Connect via Bluetooth`; browsers do not allow
   pre-listing devices before the permission picker opens.
5. If multiple candidates are shown, choose the target device and connect again.
6. Select a key in the physical layout.
7. Choose the binding type and keycode from the on-screen picker, then click
   `実機へ書き込み`.

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

Direct Combo and Trackball panels show the same workflow in Tauri and the
browser. When a browser-side RPC is not exposed by the Web client package yet,
the panel falls back to read-only firmware data and says so in the UI. Use
Firmware Mode for any setting that Direct Mode does not support yet; those
settings live in keymap/overlay/conf files and still need build + UF2 flashing.

## Binding Picker

The keymap editor avoids relying on physical keyboard input for normal edits.
Use the on-screen binding picker to choose:

- keycodes such as letters, numbers, symbols, navigation, modifiers, function
  keys, and system/media keys
- layer targets for `&lt`, `&mo`, and `&to`
- hold/tap combinations for `&mt`
- mouse buttons for `&mkp`
- Bluetooth actions for `&bt`
- special bindings such as `&trans`, `&none`, `&bootloader`, and
  `&studio_unlock`

Combo keys are also selected from a 1-40 key grid instead of typing key
positions manually. The advanced text field remains available for unsupported
or custom ZMK bindings.

## Remaining Notes

- Browser Direct Mode uses Web Serial / Web Bluetooth. Use Chrome or Edge, and
  serve the app from `localhost` or HTTPS so the browser exposes those APIs.
- Browsers cannot pre-detect USB/Bluetooth devices for Direct Mode. The connect
  buttons open the browser permission picker instead.
- File saving, folder picking, GitHub Actions, artifact download, and UF2 copy
  require the Tauri app shell.
- Direct Mode requires ZMK Studio enabled firmware and either USB serial access
  or Bluetooth Studio service support on the connected keyboard.
- GitHub tokens are not stored in the renderer; GitHub operations are delegated
  to the backend through `gh`.
