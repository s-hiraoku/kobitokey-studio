use std::fs;
use std::path::{Path, PathBuf};

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(path, contents).map_err(|error| error.to_string())
}

#[tauri::command]
fn read_kobitokey_project(root: String) -> Result<KobitoKeyProject, String> {
    let root = PathBuf::from(root);
    let keymap_path = root.join("config/KobitoKey.keymap");
    let left_overlay_path = root.join("config/boards/shields/KobitoKey/KobitoKey_left.overlay");
    let right_overlay_path = root.join("config/boards/shields/KobitoKey/KobitoKey_right.overlay");

    Ok(KobitoKeyProject {
        keymap_path: display_path(&keymap_path),
        keymap: fs::read_to_string(&keymap_path).map_err(|error| error.to_string())?,
        left_overlay_path: display_path(&left_overlay_path),
        left_overlay: fs::read_to_string(&left_overlay_path).map_err(|error| error.to_string())?,
        right_overlay_path: display_path(&right_overlay_path),
        right_overlay: fs::read_to_string(&right_overlay_path).map_err(|error| error.to_string())?,
    })
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[derive(serde::Serialize)]
struct KobitoKeyProject {
    keymap_path: String,
    keymap: String,
    left_overlay_path: String,
    left_overlay: String,
    right_overlay_path: String,
    right_overlay: String,
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            read_kobitokey_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running KobitoKey Studio");
}
