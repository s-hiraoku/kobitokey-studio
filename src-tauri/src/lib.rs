use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

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

#[tauri::command]
fn trigger_github_build(root: String) -> Result<String, String> {
    run_gh(&root, &["workflow", "run", "build.yml"])
}

#[tauri::command]
fn latest_github_run(root: String) -> Result<String, String> {
    run_gh(
        &root,
        &[
            "run",
            "list",
            "--workflow",
            "build.yml",
            "--limit",
            "1",
            "--json",
            "databaseId,status,conclusion,headBranch,createdAt,url",
        ],
    )
}

#[tauri::command]
fn download_latest_artifact(root: String) -> Result<String, String> {
    let run_json = latest_github_run(root.clone())?;
    let run_id = run_json
        .split("\"databaseId\":")
        .nth(1)
        .and_then(|value| value.split([',', '}']).next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "No GitHub Actions run found".to_string())?;
    let output_dir = PathBuf::from(&root).join(".kobitokey-studio/artifacts");
    fs::create_dir_all(&output_dir).map_err(|error| error.to_string())?;
    run_gh_owned(
        &root,
        vec![
            "run".to_string(),
            "download".to_string(),
            run_id.to_string(),
            "-D".to_string(),
            display_path(&output_dir),
        ],
    )
}

fn run_gh(root: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("gh")
        .current_dir(root)
        .args(args)
        .output()
        .map_err(|error| error.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn run_gh_owned(root: &str, args: Vec<String>) -> Result<String, String> {
    let output = Command::new("gh")
        .current_dir(root)
        .args(args)
        .output()
        .map_err(|error| error.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
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
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            read_kobitokey_project,
            trigger_github_build,
            latest_github_run,
            download_latest_artifact
        ])
        .run(tauri::generate_context!())
        .expect("error while running KobitoKey Studio");
}
