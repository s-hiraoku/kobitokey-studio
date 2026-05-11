# KobitoKey Studio

KobitoKey Studio is a dedicated desktop editor for
[`s-hiraoku/KobitoKey_QWERTY`](https://github.com/s-hiraoku/KobitoKey_QWERTY).

The first milestone is intentionally KobitoKey-specific:

- Load `config/KobitoKey.keymap`
- Show the 40-key layout across 10 layers
- Edit a selected key binding
- Preview a save-time diff
- Read key trackball parameters from the left/right overlay files
- Prepare the app surface for GitHub Actions artifact and UF2 flashing support

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

## Current Notes

The app ships with fixture copies of the current KobitoKey files in
`public/fixtures/`, so the UI can run in a browser before the Tauri shell is
available.

When running inside Tauri, the default project path points at:

```txt
/Volumes/SSD/ghq/github.com/s-hiraoku/KobitoKey_QWERTY
```

The next implementation steps are trackball editing with overlay serialization,
GitHub Actions run/artifact integration, and a guided UF2 flash workflow.
