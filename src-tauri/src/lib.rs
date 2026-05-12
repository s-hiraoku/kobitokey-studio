use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use zmk_studio_api::{Behavior, HidUsage, Keycode, StudioClient};

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

#[tauri::command]
fn list_uf2_files(root: String) -> Result<Vec<String>, String> {
    let artifacts_dir = PathBuf::from(root).join(".kobitokey-studio/artifacts");
    let mut files = Vec::new();
    collect_uf2_files(&artifacts_dir, &mut files)?;
    Ok(files)
}

#[tauri::command]
fn list_bootloader_volumes() -> Result<Vec<String>, String> {
    let volumes = PathBuf::from("/Volumes");
    let entries = fs::read_dir(volumes).map_err(|error| error.to_string())?;
    let mut candidates = Vec::new();

    for entry in entries {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.join("INFO_UF2.TXT").exists() || path.join("CURRENT.UF2").exists() {
            candidates.push(display_path(&path));
        }
    }

    Ok(candidates)
}

#[tauri::command]
fn copy_uf2_to_volume(uf2_path: String, volume_path: String) -> Result<String, String> {
    let source = PathBuf::from(&uf2_path);
    let file_name = source
        .file_name()
        .ok_or_else(|| "Invalid UF2 path".to_string())?;
    let destination = PathBuf::from(volume_path).join(file_name);
    fs::copy(&source, &destination).map_err(|error| error.to_string())?;
    Ok(display_path(&destination))
}

#[tauri::command]
fn list_studio_ports() -> Result<Vec<StudioPort>, String> {
    let ports = serialport::available_ports().map_err(|error| error.to_string())?;

    Ok(ports
        .into_iter()
        .filter(|port| is_likely_studio_port(port))
        .map(|port| {
            let (manufacturer, product, serial_number, port_kind) = match port.port_type {
                serialport::SerialPortType::UsbPort(info) => (
                    info.manufacturer,
                    info.product,
                    info.serial_number,
                    "usb".to_string(),
                ),
                serialport::SerialPortType::BluetoothPort => {
                    (None, Some("Bluetooth serial".to_string()), None, "bluetooth".to_string())
                }
                serialport::SerialPortType::PciPort => (None, Some("PCI serial".to_string()), None, "pci".to_string()),
                serialport::SerialPortType::Unknown => (None, None, None, "serial".to_string()),
            };
            let label = product
                .clone()
                .or_else(|| manufacturer.clone())
                .unwrap_or_else(|| port.port_name.clone());

            StudioPort {
                path: port.port_name,
                label,
                manufacturer,
                product,
                serial_number,
                port_kind,
            }
        })
        .collect())
}

#[tauri::command]
fn read_studio_keymap(port_path: String) -> Result<StudioKeymap, String> {
    let mut client = open_studio_client(&port_path)?;
    let info = client.get_device_info().map_err(|error| error.to_string())?;
    let lock_state = client
        .get_lock_state()
        .map(|state| format!("{state:?}"))
        .unwrap_or_else(|_| "unknown".to_string());
    let raw_keymap = client.get_keymap().map_err(|error| error.to_string())?;
    let resolved_layers = client.resolve_keymap().map_err(|error| error.to_string())?;
    let has_unsaved_changes = client.check_unsaved_changes().unwrap_or(false);

    let layers = raw_keymap
        .layers
        .iter()
        .enumerate()
        .map(|(index, layer)| StudioLayer {
            id: layer.id,
            name: if layer.name.is_empty() {
                format!("Layer {index}")
            } else {
                layer.name.clone()
            },
            bindings: resolved_layers
                .get(index)
                .map(|bindings| bindings.iter().map(format_direct_behavior).collect())
                .unwrap_or_default(),
        })
        .collect();

    Ok(StudioKeymap {
        device_name: info.name,
        serial_number: String::from_utf8_lossy(&info.serial_number).to_string(),
        lock_state,
        has_unsaved_changes,
        layers,
    })
}

#[tauri::command]
fn write_studio_key(
    port_path: String,
    layer_id: u32,
    key_position: i32,
    binding: String,
) -> Result<StudioKeymap, String> {
    let behavior = parse_direct_behavior(&binding)?;
    let mut client = open_studio_client(&port_path)?;
    client
        .set_key_at(layer_id, key_position, behavior)
        .map_err(|error| error.to_string())?;
    client.save_changes().map_err(|error| error.to_string())?;
    drop(client);

    read_studio_keymap(port_path)
}

fn collect_uf2_files(dir: &Path, files: &mut Vec<String>) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.is_dir() {
            collect_uf2_files(&path, files)?;
        } else if path.extension().is_some_and(|extension| extension == "uf2") {
            files.push(display_path(&path));
        }
    }

    files.sort();
    Ok(())
}

fn open_studio_client(port_path: &str) -> Result<
    StudioClient<zmk_studio_api::transport::serial::SerialTransport>,
    String,
> {
    StudioClient::open_serial(port_path).map_err(|error| error.to_string())
}

fn is_likely_studio_port(port: &serialport::SerialPortInfo) -> bool {
    if port.port_name.contains("usbmodem") || port.port_name.contains("ACM") {
        return true;
    }

    match &port.port_type {
        serialport::SerialPortType::UsbPort(info) => [&info.manufacturer, &info.product]
            .into_iter()
            .flatten()
            .any(|value| {
                let value = value.to_ascii_lowercase();
                value.contains("xiao")
                    || value.contains("seeed")
                    || value.contains("zmk")
                    || value.contains("kobito")
            }),
        _ => false,
    }
}

fn format_direct_behavior(behavior: &Behavior) -> String {
    match behavior {
        Behavior::KeyPress(key) => format!("&kp {key}"),
        Behavior::KeyToggle(key) => format!("&kt {key}"),
        Behavior::LayerTap { layer_id, tap } => format!("&lt {layer_id} {tap}"),
        Behavior::ModTap { hold, tap } => format!("&mt {hold} {tap}"),
        Behavior::StickyKey(key) => format!("&sk {key}"),
        Behavior::StickyLayer { layer_id } => format!("&sl {layer_id}"),
        Behavior::MomentaryLayer { layer_id } => format!("&mo {layer_id}"),
        Behavior::ToggleLayer { layer_id } => format!("&tog {layer_id}"),
        Behavior::ToLayer { layer_id } => format!("&to {layer_id}"),
        Behavior::Bluetooth { command, value } => format!("&bt {command} {value}"),
        Behavior::ExternalPower { value } => format!("&ext_power {value}"),
        Behavior::OutputSelection { value } => format!("&out {value}"),
        Behavior::Backlight { command, value } => format!("&bl {command} {value}"),
        Behavior::Underglow { command, value } => format!("&rgb_ug {command} {value}"),
        Behavior::MouseKeyPress { value } => format!("&mkp {value}"),
        Behavior::MouseMove { value } => format!("&mmv {value}"),
        Behavior::MouseScroll { value } => format!("&msc {value}"),
        Behavior::CapsWord => "&caps_word".to_string(),
        Behavior::KeyRepeat => "&key_repeat".to_string(),
        Behavior::Reset => "&sys_reset".to_string(),
        Behavior::Bootloader => "&bootloader".to_string(),
        Behavior::SoftOff => "&soft_off".to_string(),
        Behavior::StudioUnlock => "&studio_unlock".to_string(),
        Behavior::GraveEscape => "&gresc".to_string(),
        Behavior::Transparent => "&trans".to_string(),
        Behavior::None => "&none".to_string(),
        Behavior::Unknown {
            behavior_id,
            param1,
            param2,
        } => format!("&unknown {behavior_id} {param1} {param2}"),
    }
}

fn parse_direct_behavior(binding: &str) -> Result<Behavior, String> {
    let tokens: Vec<&str> = binding.split_whitespace().collect();
    let behavior = tokens
        .first()
        .ok_or_else(|| "Binding is empty".to_string())?
        .trim();

    match behavior {
        "&kp" => Ok(Behavior::KeyPress(parse_hid_usage(required_token(&tokens, 1, "key")?)?)),
        "&kt" => Ok(Behavior::KeyToggle(parse_hid_usage(required_token(&tokens, 1, "key")?)?)),
        "&lt" => Ok(Behavior::LayerTap {
            layer_id: parse_u32(required_token(&tokens, 1, "layer")?)?,
            tap: parse_hid_usage(required_token(&tokens, 2, "tap key")?)?,
        }),
        "&mt" => Ok(Behavior::ModTap {
            hold: parse_hid_usage(required_token(&tokens, 1, "hold key")?)?,
            tap: parse_hid_usage(required_token(&tokens, 2, "tap key")?)?,
        }),
        "&sk" => Ok(Behavior::StickyKey(parse_hid_usage(required_token(&tokens, 1, "key")?)?)),
        "&sl" => Ok(Behavior::StickyLayer {
            layer_id: parse_u32(required_token(&tokens, 1, "layer")?)?,
        }),
        "&mo" => Ok(Behavior::MomentaryLayer {
            layer_id: parse_u32(required_token(&tokens, 1, "layer")?)?,
        }),
        "&tog" => Ok(Behavior::ToggleLayer {
            layer_id: parse_u32(required_token(&tokens, 1, "layer")?)?,
        }),
        "&to" => Ok(Behavior::ToLayer {
            layer_id: parse_u32(required_token(&tokens, 1, "layer")?)?,
        }),
        "&bt" => Ok(Behavior::Bluetooth {
            command: parse_command(required_token(&tokens, 1, "command")?)?,
            value: parse_u32(required_token(&tokens, 2, "value")?)?,
        }),
        "&mkp" => Ok(Behavior::MouseKeyPress {
            value: parse_u32(required_token(&tokens, 1, "value")?)?,
        }),
        "&mmv" => Ok(Behavior::MouseMove {
            value: parse_u32(required_token(&tokens, 1, "value")?)?,
        }),
        "&msc" => Ok(Behavior::MouseScroll {
            value: parse_u32(required_token(&tokens, 1, "value")?)?,
        }),
        "&trans" => Ok(Behavior::Transparent),
        "&none" => Ok(Behavior::None),
        "&studio_unlock" => Ok(Behavior::StudioUnlock),
        "&caps_word" => Ok(Behavior::CapsWord),
        "&key_repeat" => Ok(Behavior::KeyRepeat),
        "&sys_reset" => Ok(Behavior::Reset),
        "&bootloader" => Ok(Behavior::Bootloader),
        "&soft_off" => Ok(Behavior::SoftOff),
        "&gresc" => Ok(Behavior::GraveEscape),
        _ => Err(format!(
            "{behavior} is not supported by Direct Mode yet. Use Firmware Mode for this binding."
        )),
    }
}

fn required_token<'a>(tokens: &'a [&str], index: usize, name: &str) -> Result<&'a str, String> {
    tokens
        .get(index)
        .copied()
        .ok_or_else(|| format!("Missing {name}"))
}

fn parse_hid_usage(value: &str) -> Result<HidUsage, String> {
    Keycode::from_name(value)
        .map(|keycode| HidUsage::from_encoded(keycode.to_hid_usage()))
        .ok_or_else(|| format!("Unknown keycode: {value}"))
}

fn parse_command(value: &str) -> Result<u32, String> {
    match value {
        "BT_CLR" => Ok(0),
        "BT_SEL" => Ok(1),
        "BT_NXT" => Ok(2),
        "BT_PRV" => Ok(3),
        _ => parse_u32(value),
    }
}

fn parse_u32(value: &str) -> Result<u32, String> {
    value
        .parse::<u32>()
        .map_err(|_| format!("Expected number, got {value}"))
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

#[derive(serde::Serialize)]
struct StudioPort {
    path: String,
    label: String,
    manufacturer: Option<String>,
    product: Option<String>,
    serial_number: Option<String>,
    port_kind: String,
}

#[derive(serde::Serialize)]
struct StudioKeymap {
    device_name: String,
    serial_number: String,
    lock_state: String,
    has_unsaved_changes: bool,
    layers: Vec<StudioLayer>,
}

#[derive(serde::Serialize)]
struct StudioLayer {
    id: u32,
    name: String,
    bindings: Vec<String>,
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
            download_latest_artifact,
            list_uf2_files,
            list_bootloader_volumes,
            copy_uf2_to_volume,
            list_studio_ports,
            read_studio_keymap,
            write_studio_key
        ])
        .run(tauri::generate_context!())
        .expect("error while running KobitoKey Studio");
}
