use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Path, PathBuf};
use std::process::Command;
use zmk_studio_api::transport::{serial::SerialTransport, BleDeviceInfo, PlatformBleTransport};
use zmk_studio_api::{Behavior, HidUsage, Keycode, StudioClient};

const DESKTOP_BLUETOOTH_DIRECT_ENABLED: bool = true;

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
        right_overlay: fs::read_to_string(&right_overlay_path)
            .map_err(|error| error.to_string())?,
    })
}

fn write_kobitokey_project_files(
    root: &str,
    keymap: &str,
    left_overlay: &str,
    right_overlay: &str,
) -> Result<(), String> {
    let root = PathBuf::from(root);
    fs::write(root.join("config/KobitoKey.keymap"), keymap).map_err(|error| error.to_string())?;
    fs::write(
        root.join("config/boards/shields/KobitoKey/KobitoKey_left.overlay"),
        left_overlay,
    )
    .map_err(|error| error.to_string())?;
    fs::write(
        root.join("config/boards/shields/KobitoKey/KobitoKey_right.overlay"),
        right_overlay,
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn trigger_github_build(root: String, repo_url: Option<String>) -> Result<String, String> {
    let branch = current_git_branch(&root)?;
    run_gh(
        &root,
        &["workflow", "run", "build.yml", "--ref", branch.as_str()],
        repo_url.as_deref(),
    )
}

#[tauri::command]
fn check_firmware_build_ready(
    root: String,
    repo_url: Option<String>,
) -> Result<FirmwareBuildCheck, String> {
    Ok(run_firmware_build_checks(&root, repo_url.as_deref()))
}

#[tauri::command]
fn latest_github_run(root: String, repo_url: Option<String>) -> Result<String, String> {
    let branch = current_git_branch(&root)?;
    run_gh(
        &root,
        &[
            "run",
            "list",
            "--workflow",
            "build.yml",
            "--branch",
            branch.as_str(),
            "--limit",
            "1",
            "--json",
            "databaseId,status,conclusion,headBranch,createdAt,url",
        ],
        repo_url.as_deref(),
    )
}

#[tauri::command]
fn download_latest_artifact(root: String, repo_url: Option<String>) -> Result<String, String> {
    let head_sha = current_git_head_sha(&root)?;
    let run_id = latest_successful_github_run_id(&root, repo_url.as_deref(), &head_sha)?;
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
        repo_url.as_deref(),
    )
}

#[tauri::command]
fn save_commit_push_and_trigger_build(
    root: String,
    repo_url: Option<String>,
    keymap: String,
    left_overlay: String,
    right_overlay: String,
) -> Result<FirmwareBuildStart, String> {
    write_kobitokey_project_files(&root, &keymap, &left_overlay, &right_overlay)?;

    let tracked_paths = [
        "config/KobitoKey.keymap",
        "config/boards/shields/KobitoKey/KobitoKey_left.overlay",
        "config/boards/shields/KobitoKey/KobitoKey_right.overlay",
    ];
    run_git(
        &root,
        &[
            "add",
            "--",
            tracked_paths[0],
            tracked_paths[1],
            tracked_paths[2],
        ],
    )?;

    let committed = has_staged_changes_for_paths(&root, &tracked_paths)?;
    let commit_output = if committed {
        Some(run_git(
            &root,
            &[
                "commit",
                "-m",
                "Update KobitoKey firmware config",
                "--",
                tracked_paths[0],
                tracked_paths[1],
                tracked_paths[2],
            ],
        )?)
    } else {
        None
    };

    let push_output = if committed {
        Some(run_git(&root, &["push", "-u", "origin", "HEAD"])?)
    } else {
        None
    };

    let build_output = trigger_github_build(root.clone(), repo_url)?;
    Ok(FirmwareBuildStart {
        committed,
        commit_output,
        push_output,
        build_output,
    })
}

#[tauri::command]
fn list_uf2_files(root: String) -> Result<Vec<String>, String> {
    let artifacts_dir = PathBuf::from(root).join(".kobitokey-studio/artifacts");
    let mut files = Vec::new();
    collect_uf2_files(&artifacts_dir, &mut files)?;
    files.sort();
    Ok(files)
}

#[tauri::command]
fn resolve_firmware_flash_targets(root: String) -> Result<FirmwareFlashTargets, String> {
    let artifacts_dir = PathBuf::from(root).join(".kobitokey-studio/artifacts");
    let mut uf2_files = Vec::new();
    collect_uf2_files(&artifacts_dir, &mut uf2_files)?;
    uf2_files.sort();

    let mut manifests = Vec::new();
    collect_manifest_files(&artifacts_dir, &mut manifests)?;
    let mut left_uf2 = None;
    let mut right_uf2 = None;
    let mut manifest_path = None;

    for manifest in manifests {
        if let Some((left, right)) = read_firmware_manifest(&manifest, &uf2_files)? {
            left_uf2 = left;
            right_uf2 = right;
            manifest_path = Some(display_path(&manifest));
            break;
        }
    }

    if left_uf2.is_none() || right_uf2.is_none() {
        let (left, right) = classify_uf2_files_by_name(&uf2_files);
        left_uf2 = left_uf2.or(left);
        right_uf2 = right_uf2.or(right);
    }

    let unknown_uf2 = uf2_files
        .iter()
        .filter(|file| Some(*file) != left_uf2.as_ref() && Some(*file) != right_uf2.as_ref())
        .cloned()
        .collect();

    Ok(FirmwareFlashTargets {
        uf2_files,
        bootloader_volumes: detect_bootloader_volumes()?,
        left_uf2,
        right_uf2,
        unknown_uf2,
        manifest_path,
    })
}

#[tauri::command]
fn list_bootloader_volumes() -> Result<Vec<String>, String> {
    detect_bootloader_volumes()
}

fn detect_bootloader_volumes() -> Result<Vec<String>, String> {
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
        .filter(is_likely_studio_port)
        .map(|port| {
            let (manufacturer, product, serial_number, port_kind) = match port.port_type {
                serialport::SerialPortType::UsbPort(info) => (
                    info.manufacturer,
                    info.product,
                    info.serial_number,
                    "usb".to_string(),
                ),
                serialport::SerialPortType::BluetoothPort => (
                    None,
                    Some("Bluetooth serial".to_string()),
                    None,
                    "bluetooth".to_string(),
                ),
                serialport::SerialPortType::PciPort => (
                    None,
                    Some("PCI serial".to_string()),
                    None,
                    "pci".to_string(),
                ),
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
fn list_studio_bluetooth_devices() -> Result<Vec<StudioBluetoothDevice>, String> {
    ensure_desktop_bluetooth_direct_enabled().map_err(|error| error.message)?;
    list_ble_devices_safe().map(|devices| {
        devices
            .into_iter()
            .map(StudioBluetoothDevice::from)
            .collect()
    })
}

#[tauri::command]
fn read_studio_keymap(port_path: String) -> Result<StudioKeymap, String> {
    let mut client = open_studio_client(&port_path)?;
    read_studio_keymap_from_client(&mut client)
}

#[tauri::command]
fn connect_studio_device(
    kind: String,
    port_path: Option<String>,
) -> Result<StudioConnection, StudioConnectionError> {
    match kind.as_str() {
        "usb" => {
            let port_path = port_path
                .filter(|path| !path.trim().is_empty())
                .ok_or_else(|| {
                    StudioConnectionError::new(
                        "missing_port",
                        "USB Direct Mode requires a serial port path.",
                    )
                })?;
            let mut client = open_studio_client(&port_path).map_err(|message| {
                StudioConnectionError::new(
                    "connection_failed",
                    format!("Failed to open USB Studio connection: {message}"),
                )
            })?;
            let keymap = read_studio_keymap_from_client(&mut client).map_err(|message| {
                StudioConnectionError::new(
                    "read_failed",
                    format!("Failed to read Studio keymap: {message}"),
                )
            })?;

            Ok(StudioConnection {
                kind,
                transport: "serial".to_string(),
                port_path: Some(port_path),
                keymap,
            })
        }
        "bluetooth" => {
            ensure_desktop_bluetooth_direct_enabled()?;
            let device = resolve_ble_device(port_path)
                .map_err(|message| StudioConnectionError::new("device_not_found", message))?;
            let mut client = open_ble_client_safe(&device.device_id).map_err(|message| {
                StudioConnectionError::new(
                    "connection_failed",
                    format!("Failed to open Bluetooth Studio connection: {message}"),
                )
            })?;
            let keymap = read_studio_keymap_from_client(&mut client).map_err(|message| {
                StudioConnectionError::new(
                    "read_failed",
                    format!("Failed to read Studio keymap: {message}"),
                )
            })?;

            Ok(StudioConnection {
                kind,
                transport: "bluetooth".to_string(),
                port_path: Some(device.device_id),
                keymap,
            })
        }
        _ => Err(StudioConnectionError::new(
            "unsupported_kind",
            format!("Unsupported Direct Mode connection kind: {kind}"),
        )),
    }
}

fn read_studio_keymap_from_client<T: Read + Write>(
    client: &mut StudioClient<T>,
) -> Result<StudioKeymap, String> {
    let info = client
        .get_device_info()
        .map_err(|error| error.to_string())?;
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
    kind: Option<String>,
    port_path: String,
    layer_id: u32,
    key_position: i32,
    binding: String,
) -> Result<StudioKeymap, String> {
    let behavior = parse_direct_behavior(&binding)?;
    match kind.as_deref().unwrap_or("usb") {
        "usb" => {
            let mut client = open_studio_client(&port_path)?;
            write_studio_key_with_client(&mut client, layer_id, key_position, behavior)?;
            read_studio_keymap_from_client(&mut client)
        }
        "bluetooth" => {
            ensure_desktop_bluetooth_direct_enabled().map_err(|error| error.message)?;
            let device = resolve_ble_device(Some(port_path))?;
            let mut client = open_ble_client_safe(&device.device_id)?;
            write_studio_key_with_client(&mut client, layer_id, key_position, behavior)?;
            read_studio_keymap_from_client(&mut client)
        }
        other => Err(format!("Unsupported Direct Mode connection kind: {other}")),
    }
}

fn write_studio_key_with_client<T: Read + Write>(
    client: &mut StudioClient<T>,
    layer_id: u32,
    key_position: i32,
    behavior: Behavior,
) -> Result<(), String> {
    client
        .set_key_at(layer_id, key_position, behavior)
        .map_err(|error| error.to_string())?;
    client.save_changes().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn read_studio_trackball_settings(
    kind: String,
    port_path: Option<String>,
) -> Result<StudioTrackballSettings, StudioConnectionError> {
    match kind.as_str() {
        "usb" => {
            let port_path = port_path
                .filter(|path| !path.trim().is_empty())
                .ok_or_else(|| {
                    StudioConnectionError::new(
                        "missing_port",
                        "USB Trackball Direct requires a serial port path.",
                    )
                })?;
            let mut transport = SerialTransport::open(&port_path).map_err(|error| {
                StudioConnectionError::new(
                    "connection_failed",
                    format!("Failed to open USB Studio connection: {error}"),
                )
            })?;
            read_trackball_settings_from_transport(&mut transport)
                .map_err(|message| StudioConnectionError::new("trackball_read_failed", message))
        }
        "bluetooth" => {
            ensure_desktop_bluetooth_direct_enabled()?;
            let device = resolve_ble_device(port_path)
                .map_err(|message| StudioConnectionError::new("device_not_found", message))?;
            let mut transport =
                connect_ble_transport_safe(&device.device_id).map_err(|message| {
                    StudioConnectionError::new(
                        "connection_failed",
                        format!("Failed to open Bluetooth Studio connection: {message}"),
                    )
                })?;
            read_trackball_settings_from_transport(&mut transport)
                .map_err(|message| StudioConnectionError::new("trackball_read_failed", message))
        }
        _ => Err(StudioConnectionError::new(
            "unsupported_kind",
            format!("Unsupported Direct Mode connection kind: {kind}"),
        )),
    }
}

#[tauri::command]
fn write_studio_trackball_settings(
    kind: String,
    port_path: Option<String>,
    settings: StudioTrackballSettings,
) -> Result<StudioTrackballSettings, StudioConnectionError> {
    match kind.as_str() {
        "usb" => {
            let port_path = port_path
                .filter(|path| !path.trim().is_empty())
                .ok_or_else(|| {
                    StudioConnectionError::new(
                        "missing_port",
                        "USB Trackball Direct requires a serial port path.",
                    )
                })?;
            let mut transport = SerialTransport::open(&port_path).map_err(|error| {
                StudioConnectionError::new(
                    "connection_failed",
                    format!("Failed to open USB Studio connection: {error}"),
                )
            })?;
            write_trackball_settings_to_transport(&mut transport, &settings)
                .map_err(|message| StudioConnectionError::new("trackball_write_failed", message))?;
            read_trackball_settings_from_transport(&mut transport)
                .map_err(|message| StudioConnectionError::new("trackball_read_failed", message))
        }
        "bluetooth" => {
            ensure_desktop_bluetooth_direct_enabled()?;
            let device = resolve_ble_device(port_path)
                .map_err(|message| StudioConnectionError::new("device_not_found", message))?;
            let mut transport =
                connect_ble_transport_safe(&device.device_id).map_err(|message| {
                    StudioConnectionError::new(
                        "connection_failed",
                        format!("Failed to open Bluetooth Studio connection: {message}"),
                    )
                })?;
            write_trackball_settings_to_transport(&mut transport, &settings)
                .map_err(|message| StudioConnectionError::new("trackball_write_failed", message))?;
            read_trackball_settings_from_transport(&mut transport)
                .map_err(|message| StudioConnectionError::new("trackball_read_failed", message))
        }
        _ => Err(StudioConnectionError::new(
            "unsupported_kind",
            format!("Unsupported Direct Mode connection kind: {kind}"),
        )),
    }
}

#[tauri::command]
fn read_studio_combos(
    kind: String,
    port_path: Option<String>,
) -> Result<StudioComboSet, StudioConnectionError> {
    if kind == "bluetooth" {
        ensure_desktop_bluetooth_direct_enabled()?;
    }
    let target = resolve_studio_target(&kind, port_path)
        .map_err(|message| StudioConnectionError::new("device_not_found", message))?;
    with_studio_transport(&target, |transport| {
        read_studio_combos_from_transport(transport)
    })
    .map_err(|message| StudioConnectionError::new("combo_read_failed", message))
}

#[tauri::command]
fn add_studio_combo(
    kind: String,
    port_path: Option<String>,
    combo: StudioComboInput,
) -> Result<StudioComboSet, StudioConnectionError> {
    if kind == "bluetooth" {
        ensure_desktop_bluetooth_direct_enabled()?;
    }
    let target = resolve_studio_target(&kind, port_path)
        .map_err(|message| StudioConnectionError::new("device_not_found", message))?;
    with_studio_transport(&target, |transport| {
        let catalog = load_behavior_catalog_from_transport(transport)?;
        let config = encode_combo_config(&combo, &catalog)?;
        call_subsystem_rpc(transport, 7, encode_add_combo_request(&config))
            .and_then(|response| decode_add_combo_response(&response))?;
        save_studio_changes_from_transport(transport)?;
        read_studio_combos_from_transport(transport)
    })
    .map_err(|message| StudioConnectionError::new("combo_add_failed", message))
}

#[tauri::command]
fn set_studio_combo(
    kind: String,
    port_path: Option<String>,
    index: u32,
    combo: StudioComboInput,
) -> Result<StudioComboSet, StudioConnectionError> {
    if kind == "bluetooth" {
        ensure_desktop_bluetooth_direct_enabled()?;
    }
    let target = resolve_studio_target(&kind, port_path)
        .map_err(|message| StudioConnectionError::new("device_not_found", message))?;
    with_studio_transport(&target, |transport| {
        let catalog = load_behavior_catalog_from_transport(transport)?;
        let config = encode_combo_config(&combo, &catalog)?;
        call_subsystem_rpc(transport, 7, encode_set_combo_request(index, &config))
            .and_then(|response| decode_set_combo_response(&response))?;
        save_studio_changes_from_transport(transport)?;
        read_studio_combos_from_transport(transport)
    })
    .map_err(|message| StudioConnectionError::new("combo_set_failed", message))
}

#[tauri::command]
fn remove_studio_combo(
    kind: String,
    port_path: Option<String>,
    index: u32,
) -> Result<StudioComboSet, StudioConnectionError> {
    if kind == "bluetooth" {
        ensure_desktop_bluetooth_direct_enabled()?;
    }
    let target = resolve_studio_target(&kind, port_path)
        .map_err(|message| StudioConnectionError::new("device_not_found", message))?;
    with_studio_transport(&target, |transport| {
        call_subsystem_rpc(transport, 7, encode_remove_combo_request(index))
            .and_then(|response| decode_remove_combo_response(&response))?;
        save_studio_changes_from_transport(transport)?;
        read_studio_combos_from_transport(transport)
    })
    .map_err(|message| StudioConnectionError::new("combo_remove_failed", message))
}

fn read_trackball_settings_from_transport<T: Read + Write>(
    transport: &mut T,
) -> Result<StudioTrackballSettings, String> {
    let response = call_pointing_rpc(transport, encode_get_sensitivity_request())?;
    decode_get_sensitivity_response(&response)
}

fn write_trackball_settings_to_transport<T: Read + Write>(
    transport: &mut T,
    settings: &StudioTrackballSettings,
) -> Result<(), String> {
    let response = call_pointing_rpc(transport, encode_set_sensitivity_request(settings))?;
    decode_set_sensitivity_response(&response)
}

fn call_pointing_rpc<T: Read + Write>(
    transport: &mut T,
    pointing_request: Vec<u8>,
) -> Result<Vec<u8>, String> {
    let request_id = 1;
    let mut request = Vec::new();
    push_varint_field(&mut request, 1, request_id);
    push_len_field(&mut request, 6, &pointing_request);
    let frame = encode_studio_frame(&request);

    transport
        .write_all(&frame)
        .map_err(|error| error.to_string())?;
    transport.flush().map_err(|error| error.to_string())?;

    let mut decoder = StudioFrameDecoder::default();
    let mut read_buffer = [0_u8; 256];
    loop {
        let read = transport
            .read(&mut read_buffer)
            .map_err(|error| error.to_string())?;
        if read == 0 {
            return Err("Device closed the Studio connection".to_string());
        }
        for frame in decoder.push(&read_buffer[..read])? {
            if let Some(response) = decode_pointing_response_frame(&frame, u64::from(request_id))? {
                return Ok(response);
            }
        }
    }
}

fn encode_get_sensitivity_request() -> Vec<u8> {
    let mut request = Vec::new();
    push_len_field(&mut request, 2, &[]);
    request
}

fn encode_set_sensitivity_request(settings: &StudioTrackballSettings) -> Vec<u8> {
    let mut set_request = Vec::new();
    push_len_field(
        &mut set_request,
        1,
        &encode_sensitivity_scale(settings.cursor_numerator, settings.cursor_denominator),
    );
    push_len_field(
        &mut set_request,
        2,
        &encode_sensitivity_scale(settings.scroll_numerator, settings.scroll_denominator),
    );
    push_varint_field(&mut set_request, 3, settings.cpi);

    let mut request = Vec::new();
    push_len_field(&mut request, 1, &set_request);
    request
}

fn encode_sensitivity_scale(numerator: u32, denominator: u32) -> Vec<u8> {
    let mut scale = Vec::new();
    push_varint_field(&mut scale, 1, numerator);
    push_varint_field(&mut scale, 2, denominator.max(1));
    scale
}

fn decode_get_sensitivity_response(
    pointing_response: &[u8],
) -> Result<StudioTrackballSettings, String> {
    let get_response = find_len_field(pointing_response, 2)
        .ok_or_else(|| "Device did not return trackball sensitivity".to_string())?;
    let cursor = find_len_field(get_response, 1)
        .map(decode_sensitivity_scale)
        .transpose()?
        .unwrap_or((1, 1));
    let scroll = find_len_field(get_response, 2)
        .map(decode_sensitivity_scale)
        .transpose()?
        .unwrap_or((1, 1));
    let cpi = find_varint_field(get_response, 3).unwrap_or(800) as u32;

    Ok(StudioTrackballSettings {
        cpi,
        cursor_numerator: cursor.0,
        cursor_denominator: cursor.1,
        scroll_numerator: scroll.0,
        scroll_denominator: scroll.1,
    })
}

fn decode_set_sensitivity_response(pointing_response: &[u8]) -> Result<(), String> {
    let set_response = find_len_field(pointing_response, 1)
        .ok_or_else(|| "Device did not return setSensitivity result".to_string())?;
    if find_varint_field(set_response, 1).unwrap_or(0) != 0 {
        return Ok(());
    }

    match find_varint_field(set_response, 2).unwrap_or(0) {
        0 => Ok(()),
        1 => Err("Trackball sensitivity RPC is unsupported by this firmware".to_string()),
        2 => Err("Trackball sensitivity value is invalid".to_string()),
        3 => Err("Trackball sensitivity could not be saved to device storage".to_string()),
        code => Err(format!(
            "Trackball sensitivity write failed with error code {code}"
        )),
    }
}

fn decode_sensitivity_scale(bytes: &[u8]) -> Result<(u32, u32), String> {
    let numerator = find_varint_field(bytes, 1).unwrap_or(1) as u32;
    let denominator = (find_varint_field(bytes, 2).unwrap_or(1) as u32).max(1);
    Ok((numerator, denominator))
}

fn decode_pointing_response_frame(
    frame: &[u8],
    request_id: u64,
) -> Result<Option<Vec<u8>>, String> {
    let request_response = match find_len_field(frame, 1) {
        Some(value) => value,
        None => return Ok(None),
    };
    if find_varint_field(request_response, 1) != Some(request_id) {
        return Ok(None);
    }
    if let Some(meta) = find_len_field(request_response, 2) {
        return Err(decode_meta_error(meta));
    }
    find_len_field(request_response, 6)
        .map(|value| Some(value.to_vec()))
        .ok_or_else(|| "Device response did not include the pointing subsystem".to_string())
}

fn decode_meta_error(meta: &[u8]) -> String {
    if find_varint_field(meta, 1).unwrap_or(0) != 0 {
        return "Device returned no response for the trackball RPC".to_string();
    }
    match find_varint_field(meta, 2).unwrap_or(0) {
        1 => "Device is locked. Unlock ZMK Studio on the keyboard first.".to_string(),
        2 => "Trackball RPC was not found. Update firmware with pointing Studio RPC support."
            .to_string(),
        3 => "Device could not decode the trackball RPC request.".to_string(),
        4 => "Device could not encode the trackball RPC response.".to_string(),
        code => format!("Device returned Studio RPC error code {code}"),
    }
}

fn read_studio_combos_from_transport<T: Read + Write + ?Sized>(
    transport: &mut T,
) -> Result<StudioComboSet, String> {
    let catalog = load_behavior_catalog_from_transport(transport)?;
    call_subsystem_rpc(transport, 7, encode_get_combos_request())
        .and_then(|response| decode_get_combos_response(&response, &catalog))
}

fn with_studio_transport<R>(
    target: &StudioTarget,
    operation: impl FnOnce(&mut dyn StudioIo) -> Result<R, String>,
) -> Result<R, String> {
    match target {
        StudioTarget::Usb { port_path } => {
            let mut transport =
                SerialTransport::open(port_path).map_err(|error| error.to_string())?;
            operation(&mut transport)
        }
        StudioTarget::Bluetooth { device_id } => {
            let mut transport = connect_ble_transport_safe(device_id)?;
            operation(&mut transport)
        }
    }
}

trait StudioIo: Read + Write {}

impl<T: Read + Write> StudioIo for T {}

fn call_subsystem_rpc<T: Read + Write + ?Sized>(
    transport: &mut T,
    subsystem_field: u32,
    subsystem_request: Vec<u8>,
) -> Result<Vec<u8>, String> {
    let request_id = 1;
    let mut request = Vec::new();
    push_varint_field(&mut request, 1, request_id);
    push_len_field(&mut request, subsystem_field, &subsystem_request);
    let frame = encode_studio_frame(&request);

    transport
        .write_all(&frame)
        .map_err(|error| error.to_string())?;
    transport.flush().map_err(|error| error.to_string())?;

    let mut decoder = StudioFrameDecoder::default();
    let mut read_buffer = [0_u8; 256];
    loop {
        let read = transport
            .read(&mut read_buffer)
            .map_err(|error| error.to_string())?;
        if read == 0 {
            return Err("Device closed the Studio connection".to_string());
        }
        for frame in decoder.push(&read_buffer[..read])? {
            if let Some(response) =
                decode_subsystem_response_frame(&frame, u64::from(request_id), subsystem_field)?
            {
                return Ok(response);
            }
        }
    }
}

fn encode_get_combos_request() -> Vec<u8> {
    let mut request = Vec::new();
    push_len_field(&mut request, 1, &[]);
    request
}

fn encode_set_combo_request(index: u32, combo_config: &[u8]) -> Vec<u8> {
    let mut set_request = Vec::new();
    push_varint_field(&mut set_request, 1, index);
    push_len_field(&mut set_request, 2, combo_config);

    let mut request = Vec::new();
    push_len_field(&mut request, 2, &set_request);
    request
}

fn encode_add_combo_request(combo_config: &[u8]) -> Vec<u8> {
    let mut add_request = Vec::new();
    push_len_field(&mut add_request, 1, combo_config);

    let mut request = Vec::new();
    push_len_field(&mut request, 3, &add_request);
    request
}

fn encode_remove_combo_request(index: u32) -> Vec<u8> {
    let mut remove_request = Vec::new();
    push_varint_field(&mut remove_request, 1, index);

    let mut request = Vec::new();
    push_len_field(&mut request, 4, &remove_request);
    request
}

fn encode_combo_config(
    combo: &StudioComboInput,
    catalog: &BehaviorCatalog,
) -> Result<Vec<u8>, String> {
    let binding = parse_direct_behavior(&combo.binding)?;
    let raw_binding = encode_behavior_binding(binding, catalog)?;

    let mut config = Vec::new();
    for position in &combo.key_positions {
        push_varint_field(&mut config, 1, *position);
    }
    push_len_field(&mut config, 2, &raw_binding);
    push_varint_field(&mut config, 3, combo.timeout_ms);
    push_varint_field(&mut config, 4, combo.require_prior_idle_ms.unwrap_or(0));
    push_varint_field(&mut config, 5, combo.layer_mask.unwrap_or(u32::MAX));
    push_varint_field(
        &mut config,
        6,
        u32::from(combo.slow_release.unwrap_or(false)),
    );
    Ok(config)
}

fn encode_behavior_binding(
    behavior: Behavior,
    catalog: &BehaviorCatalog,
) -> Result<Vec<u8>, String> {
    let (behavior_id, param1, param2) = raw_behavior_parts(behavior, catalog)?;
    let mut binding = Vec::new();
    push_varint_field(&mut binding, 1, behavior_id as u32);
    push_varint_field(&mut binding, 2, param1);
    push_varint_field(&mut binding, 3, param2);
    Ok(binding)
}

fn raw_behavior_parts(
    behavior: Behavior,
    catalog: &BehaviorCatalog,
) -> Result<(i32, u32, u32), String> {
    match behavior {
        Behavior::KeyPress(key) => Ok((catalog.id_for("key")?, key.to_hid_usage(), 0)),
        Behavior::KeyToggle(key) => Ok((catalog.id_for("key-toggle")?, key.to_hid_usage(), 0)),
        Behavior::LayerTap { layer_id, tap } => {
            Ok((catalog.id_for("layer-tap")?, layer_id, tap.to_hid_usage()))
        }
        Behavior::ModTap { hold, tap } => Ok((
            catalog.id_for("mod-tap")?,
            hold.to_hid_usage(),
            tap.to_hid_usage(),
        )),
        Behavior::StickyKey(key) => Ok((catalog.id_for("sticky-key")?, key.to_hid_usage(), 0)),
        Behavior::StickyLayer { layer_id } => Ok((catalog.id_for("sticky-layer")?, layer_id, 0)),
        Behavior::MomentaryLayer { layer_id } => Ok((catalog.id_for("momentary")?, layer_id, 0)),
        Behavior::ToggleLayer { layer_id } => Ok((catalog.id_for("toggle-layer")?, layer_id, 0)),
        Behavior::ToLayer { layer_id } => Ok((catalog.id_for("to-layer")?, layer_id, 0)),
        Behavior::Bluetooth { command, value } => {
            Ok((catalog.id_for("bluetooth")?, command, value))
        }
        Behavior::MouseKeyPress { value } => Ok((catalog.id_for("mouse-key")?, value, 0)),
        Behavior::MouseMove { value } => Ok((catalog.id_for("mouse-move")?, value, 0)),
        Behavior::MouseScroll { value } => Ok((catalog.id_for("mouse-scroll")?, value, 0)),
        Behavior::CapsWord => Ok((catalog.id_for("caps-word")?, 0, 0)),
        Behavior::KeyRepeat => Ok((catalog.id_for("key-repeat")?, 0, 0)),
        Behavior::Reset => Ok((catalog.id_for("reset")?, 0, 0)),
        Behavior::Bootloader => Ok((catalog.id_for("bootloader")?, 0, 0)),
        Behavior::SoftOff => Ok((catalog.id_for("soft-off")?, 0, 0)),
        Behavior::StudioUnlock => Ok((catalog.id_for("studio-unlock")?, 0, 0)),
        Behavior::GraveEscape => Ok((catalog.id_for("grave-escape")?, 0, 0)),
        Behavior::Transparent => Ok((catalog.id_for("transparent")?, 0, 0)),
        Behavior::None => Ok((catalog.id_for("none")?, 0, 0)),
        Behavior::Unknown {
            behavior_id,
            param1,
            param2,
        } => Ok((behavior_id, param1, param2)),
        other => Err(format!("{other:?} is not supported by Direct Combo yet")),
    }
}

fn decode_get_combos_response(
    combo_response: &[u8],
    catalog: &BehaviorCatalog,
) -> Result<StudioComboSet, String> {
    let combos_response = find_len_field(combo_response, 1)
        .ok_or_else(|| "Device did not return combos".to_string())?;
    let combos = find_len_fields(combos_response, 1)
        .into_iter()
        .enumerate()
        .map(|(index, bytes)| decode_combo_config(index as u32, bytes, catalog))
        .collect::<Result<Vec<_>, _>>()?;
    let max_combos = find_varint_field(combos_response, 2).unwrap_or(combos.len() as u64) as u32;
    Ok(StudioComboSet { combos, max_combos })
}

fn decode_combo_config(
    index: u32,
    bytes: &[u8],
    catalog: &BehaviorCatalog,
) -> Result<StudioCombo, String> {
    let key_positions = find_varint_fields(bytes, 1)
        .into_iter()
        .map(|value| value as u32)
        .collect::<Vec<_>>();
    let binding = find_len_field(bytes, 2)
        .map(|binding| decode_behavior_binding(binding, catalog))
        .transpose()?
        .unwrap_or_else(|| "&none".to_string());
    let timeout_ms = find_varint_field(bytes, 3).unwrap_or(50) as u32;
    let require_prior_idle_ms = find_varint_field(bytes, 4).unwrap_or(0) as u32;
    let layer_mask = find_varint_field(bytes, 5).unwrap_or(u64::from(u32::MAX)) as u32;
    let slow_release = find_varint_field(bytes, 6).unwrap_or(0) != 0;

    Ok(StudioCombo {
        id: format!("direct_combo_{}", index + 1),
        index,
        binding,
        key_positions,
        timeout_ms,
        require_prior_idle_ms,
        layer_mask,
        slow_release,
    })
}

fn decode_behavior_binding(bytes: &[u8], catalog: &BehaviorCatalog) -> Result<String, String> {
    let behavior_id = find_varint_field(bytes, 1).unwrap_or(0) as i32;
    let param1 = find_varint_field(bytes, 2).unwrap_or(0) as u32;
    let param2 = find_varint_field(bytes, 3).unwrap_or(0) as u32;
    Ok(
        match catalog.role_by_id.get(&behavior_id).map(String::as_str) {
            Some("key") => format!("&kp {}", HidUsage::from_encoded(param1)),
            Some("key-toggle") => format!("&kt {}", HidUsage::from_encoded(param1)),
            Some("layer-tap") => format!("&lt {param1} {}", HidUsage::from_encoded(param2)),
            Some("mod-tap") => format!(
                "&mt {} {}",
                HidUsage::from_encoded(param1),
                HidUsage::from_encoded(param2)
            ),
            Some("sticky-key") => format!("&sk {}", HidUsage::from_encoded(param1)),
            Some("sticky-layer") => format!("&sl {param1}"),
            Some("momentary") => format!("&mo {param1}"),
            Some("toggle-layer") => format!("&tog {param1}"),
            Some("to-layer") => format!("&to {param1}"),
            Some("bluetooth") => format!("&bt {param1} {param2}"),
            Some("mouse-key") => format!("&mkp {param1}"),
            Some("mouse-move") => format!("&mmv {param1}"),
            Some("mouse-scroll") => format!("&msc {param1}"),
            Some("caps-word") => "&caps_word".to_string(),
            Some("key-repeat") => "&key_repeat".to_string(),
            Some("reset") => "&sys_reset".to_string(),
            Some("bootloader") => "&bootloader".to_string(),
            Some("soft-off") => "&soft_off".to_string(),
            Some("studio-unlock") => "&studio_unlock".to_string(),
            Some("grave-escape") => "&gresc".to_string(),
            Some("transparent") => "&trans".to_string(),
            Some("none") => "&none".to_string(),
            _ => format!("&unknown {behavior_id} {param1} {param2}"),
        },
    )
}

fn decode_set_combo_response(combo_response: &[u8]) -> Result<(), String> {
    let set_response = find_len_field(combo_response, 2)
        .ok_or_else(|| "Device did not return setCombo result".to_string())?;
    match find_varint_field(set_response, 2).unwrap_or(0) {
        0 => Ok(()),
        2 => Err("Combo index is invalid".to_string()),
        3 => Err("Combo parameters are invalid".to_string()),
        code => Err(format!("Set combo failed with error code {code}")),
    }
}

fn decode_add_combo_response(combo_response: &[u8]) -> Result<(), String> {
    let add_response = find_len_field(combo_response, 3)
        .ok_or_else(|| "Device did not return addCombo result".to_string())?;
    if find_varint_field(add_response, 1).is_some() {
        return Ok(());
    }
    match find_varint_field(add_response, 2).unwrap_or(0) {
        0 => Ok(()),
        2 => Err("No combo slots are available on the device".to_string()),
        3 => Err("Combo parameters are invalid".to_string()),
        code => Err(format!("Add combo failed with error code {code}")),
    }
}

fn decode_remove_combo_response(combo_response: &[u8]) -> Result<(), String> {
    let remove_response = find_len_field(combo_response, 4)
        .ok_or_else(|| "Device did not return removeCombo result".to_string())?;
    match find_varint_field(remove_response, 2).unwrap_or(0) {
        0 => Ok(()),
        2 => Err("Combo index is invalid".to_string()),
        code => Err(format!("Remove combo failed with error code {code}")),
    }
}

fn decode_subsystem_response_frame(
    frame: &[u8],
    request_id: u64,
    subsystem_field: u32,
) -> Result<Option<Vec<u8>>, String> {
    let request_response = match find_len_field(frame, 1) {
        Some(value) => value,
        None => return Ok(None),
    };
    if find_varint_field(request_response, 1) != Some(request_id) {
        return Ok(None);
    }
    if let Some(meta) = find_len_field(request_response, 2) {
        return Err(decode_meta_error(meta));
    }
    find_len_field(request_response, subsystem_field)
        .map(|value| Some(value.to_vec()))
        .ok_or_else(|| "Device response did not include the requested subsystem".to_string())
}

const STUDIO_FRAME_SOF: u8 = 0xAB;
const STUDIO_FRAME_ESC: u8 = 0xAC;
const STUDIO_FRAME_EOF: u8 = 0xAD;

#[derive(Default)]
struct StudioFrameDecoder {
    state: DecodeState,
    data: Vec<u8>,
}

#[derive(Default)]
enum DecodeState {
    #[default]
    Idle,
    AwaitingData,
    Escaped,
}

impl StudioFrameDecoder {
    fn push(&mut self, chunk: &[u8]) -> Result<Vec<Vec<u8>>, String> {
        let mut frames = Vec::new();
        for &byte in chunk {
            match self.state {
                DecodeState::Idle => {
                    if byte == STUDIO_FRAME_SOF {
                        self.state = DecodeState::AwaitingData;
                    }
                }
                DecodeState::AwaitingData => match byte {
                    STUDIO_FRAME_SOF => {
                        self.data.clear();
                        return Err("Unexpected Studio frame start".to_string());
                    }
                    STUDIO_FRAME_ESC => {
                        self.state = DecodeState::Escaped;
                    }
                    STUDIO_FRAME_EOF => {
                        frames.push(std::mem::take(&mut self.data));
                        self.state = DecodeState::Idle;
                    }
                    _ => self.data.push(byte),
                },
                DecodeState::Escaped => {
                    self.data.push(byte);
                    self.state = DecodeState::AwaitingData;
                }
            }
        }
        Ok(frames)
    }
}

fn encode_studio_frame(payload: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(payload.len() + 2);
    out.push(STUDIO_FRAME_SOF);
    for &byte in payload {
        if matches!(byte, STUDIO_FRAME_SOF | STUDIO_FRAME_ESC | STUDIO_FRAME_EOF) {
            out.push(STUDIO_FRAME_ESC);
        }
        out.push(byte);
    }
    out.push(STUDIO_FRAME_EOF);
    out
}

fn push_varint_field(out: &mut Vec<u8>, field_number: u32, value: u32) {
    push_varint(out, u64::from(field_number << 3));
    push_varint(out, u64::from(value));
}

fn push_len_field(out: &mut Vec<u8>, field_number: u32, bytes: &[u8]) {
    push_varint(out, u64::from((field_number << 3) | 2));
    push_varint(out, bytes.len() as u64);
    out.extend_from_slice(bytes);
}

fn push_varint(out: &mut Vec<u8>, mut value: u64) {
    while value >= 0x80 {
        out.push((value as u8) | 0x80);
        value >>= 7;
    }
    out.push(value as u8);
}

fn find_varint_field(bytes: &[u8], field_number: u32) -> Option<u64> {
    let mut cursor = 0;
    while cursor < bytes.len() {
        let tag = read_varint(bytes, &mut cursor)?;
        let field = (tag >> 3) as u32;
        let wire = tag & 0x07;
        match wire {
            0 => {
                let value = read_varint(bytes, &mut cursor)?;
                if field == field_number {
                    return Some(value);
                }
            }
            2 => {
                let length = read_varint(bytes, &mut cursor)? as usize;
                cursor = cursor.checked_add(length)?;
            }
            _ => return None,
        }
    }
    None
}

fn find_varint_fields(bytes: &[u8], field_number: u32) -> Vec<u64> {
    let mut values = Vec::new();
    let mut cursor = 0;
    while cursor < bytes.len() {
        let Some(tag) = read_varint(bytes, &mut cursor) else {
            break;
        };
        let field = (tag >> 3) as u32;
        let wire = tag & 0x07;
        match wire {
            0 => {
                let Some(value) = read_varint(bytes, &mut cursor) else {
                    break;
                };
                if field == field_number {
                    values.push(value);
                }
            }
            2 => {
                let Some(length) = read_varint(bytes, &mut cursor).map(|value| value as usize)
                else {
                    break;
                };
                let Some(end) = cursor.checked_add(length) else {
                    break;
                };
                if end > bytes.len() {
                    break;
                }
                cursor = end;
            }
            _ => break,
        }
    }
    values
}

fn find_len_field(bytes: &[u8], field_number: u32) -> Option<&[u8]> {
    let mut cursor = 0;
    while cursor < bytes.len() {
        let tag = read_varint(bytes, &mut cursor)?;
        let field = (tag >> 3) as u32;
        let wire = tag & 0x07;
        match wire {
            0 => {
                let _ = read_varint(bytes, &mut cursor)?;
            }
            2 => {
                let length = read_varint(bytes, &mut cursor)? as usize;
                let end = cursor.checked_add(length)?;
                if end > bytes.len() {
                    return None;
                }
                if field == field_number {
                    return Some(&bytes[cursor..end]);
                }
                cursor = end;
            }
            _ => return None,
        }
    }
    None
}

fn find_len_fields(bytes: &[u8], field_number: u32) -> Vec<&[u8]> {
    let mut values = Vec::new();
    let mut cursor = 0;
    while cursor < bytes.len() {
        let Some(tag) = read_varint(bytes, &mut cursor) else {
            break;
        };
        let field = (tag >> 3) as u32;
        let wire = tag & 0x07;
        match wire {
            0 => {
                if read_varint(bytes, &mut cursor).is_none() {
                    break;
                }
            }
            2 => {
                let Some(length) = read_varint(bytes, &mut cursor).map(|value| value as usize)
                else {
                    break;
                };
                let Some(end) = cursor.checked_add(length) else {
                    break;
                };
                if end > bytes.len() {
                    break;
                }
                if field == field_number {
                    values.push(&bytes[cursor..end]);
                }
                cursor = end;
            }
            _ => break,
        }
    }
    values
}

fn read_varint(bytes: &[u8], cursor: &mut usize) -> Option<u64> {
    let mut value = 0_u64;
    let mut shift = 0;
    while *cursor < bytes.len() && shift < 64 {
        let byte = bytes[*cursor];
        *cursor += 1;
        value |= u64::from(byte & 0x7F) << shift;
        if byte & 0x80 == 0 {
            return Some(value);
        }
        shift += 7;
    }
    None
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

fn collect_manifest_files(dir: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.is_dir() {
            collect_manifest_files(&path, files)?;
        } else if path
            .file_name()
            .is_some_and(|name| name == "manifest.json" || name == "firmware-manifest.json")
        {
            files.push(path);
        }
    }

    files.sort();
    Ok(())
}

fn read_firmware_manifest(
    manifest_path: &Path,
    uf2_files: &[String],
) -> Result<Option<(Option<String>, Option<String>)>, String> {
    let contents = fs::read_to_string(manifest_path).map_err(|error| error.to_string())?;
    let value: serde_json::Value =
        serde_json::from_str(&contents).map_err(|error| error.to_string())?;
    let base_dir = manifest_path.parent().unwrap_or_else(|| Path::new(""));
    let mut left = side_file_from_manifest(&value, "left", base_dir, uf2_files);
    let mut right = side_file_from_manifest(&value, "right", base_dir, uf2_files);

    if let Some(outputs) = value.get("outputs").and_then(serde_json::Value::as_array) {
        for output in outputs {
            let side = output
                .get("side")
                .and_then(serde_json::Value::as_str)
                .map(|side| side.to_ascii_lowercase());
            let Some(file) = output.get("file").and_then(serde_json::Value::as_str) else {
                continue;
            };
            let resolved = resolve_manifest_file(base_dir, file, uf2_files);
            match side.as_deref() {
                Some("left") => left = left.or(resolved),
                Some("right") => right = right.or(resolved),
                _ => {}
            }
        }
    }

    if left.is_some() || right.is_some() {
        Ok(Some((left, right)))
    } else {
        Ok(None)
    }
}

fn side_file_from_manifest(
    value: &serde_json::Value,
    side: &str,
    base_dir: &Path,
    uf2_files: &[String],
) -> Option<String> {
    let side_value = value.get(side)?;
    if let Some(file) = side_value.as_str() {
        return resolve_manifest_file(base_dir, file, uf2_files);
    }
    side_value
        .get("file")
        .and_then(serde_json::Value::as_str)
        .and_then(|file| resolve_manifest_file(base_dir, file, uf2_files))
}

fn resolve_manifest_file(base_dir: &Path, file: &str, uf2_files: &[String]) -> Option<String> {
    let path = base_dir.join(file);
    if path.exists() {
        return Some(display_path(&path));
    }

    uf2_files
        .iter()
        .find(|candidate| {
            candidate == &file
                || candidate.ends_with(&format!("/{file}"))
                || Path::new(candidate)
                    .file_name()
                    .is_some_and(|name| name == file)
        })
        .cloned()
}

fn classify_uf2_files_by_name(files: &[String]) -> (Option<String>, Option<String>) {
    let left = files.iter().find(|file| is_left_uf2_name(file)).cloned();
    let right = files.iter().find(|file| is_right_uf2_name(file)).cloned();
    (left, right)
}

fn is_left_uf2_name(path: &str) -> bool {
    let name = Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(path)
        .to_ascii_lowercase();
    side_token_match(&name, "left") || side_token_match(&name, "l")
}

fn is_right_uf2_name(path: &str) -> bool {
    let name = Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(path)
        .to_ascii_lowercase();
    side_token_match(&name, "right") || side_token_match(&name, "r")
}

fn side_token_match(name: &str, token: &str) -> bool {
    name.split(|char: char| !char.is_ascii_alphanumeric())
        .any(|part| part == token)
}

fn open_studio_client(port_path: &str) -> Result<StudioClient<SerialTransport>, String> {
    StudioClient::open_serial(port_path).map_err(|error| error.to_string())
}

fn ensure_desktop_bluetooth_direct_enabled() -> Result<(), StudioConnectionError> {
    if DESKTOP_BLUETOOTH_DIRECT_ENABLED {
        return Ok(());
    }

    Err(StudioConnectionError::new(
        "bluetooth_disabled",
        "Desktop Bluetooth Direct is disabled because the native macOS BLE backend can terminate the app on this machine. Use USB Direct for now, or use Chrome/Edge Web Bluetooth from the browser build.",
    ))
}

fn list_ble_devices_safe() -> Result<Vec<BleDeviceInfo>, String> {
    run_ble_operation(StudioClient::<PlatformBleTransport>::list_ble_devices)
}

fn open_ble_client_safe(device_id: &str) -> Result<StudioClient<PlatformBleTransport>, String> {
    run_ble_operation(|| StudioClient::<PlatformBleTransport>::open_ble(device_id))
}

fn connect_ble_transport_safe(device_id: &str) -> Result<PlatformBleTransport, String> {
    run_ble_operation(|| PlatformBleTransport::connect_device(device_id))
}

fn run_ble_operation<T, E, F>(operation: F) -> Result<T, String>
where
    E: std::fmt::Display,
    F: FnOnce() -> Result<T, E>,
{
    match catch_unwind(AssertUnwindSafe(operation)) {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(error)) => Err(error.to_string()),
        Err(payload) => Err(format!(
            "Bluetooth backend crashed before returning an error: {}",
            panic_payload_message(payload)
        )),
    }
}

fn panic_payload_message(payload: Box<dyn std::any::Any + Send>) -> String {
    if let Some(message) = payload.downcast_ref::<&str>() {
        return (*message).to_string();
    }
    if let Some(message) = payload.downcast_ref::<String>() {
        return message.clone();
    }
    "unknown panic".to_string()
}

fn resolve_ble_device(device_id: Option<String>) -> Result<BleDeviceInfo, String> {
    let requested = device_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let devices = list_ble_devices_safe()
        .map_err(|error| format!("Bluetooth device discovery failed: {error}"))?;

    if let Some(requested) = requested {
        return devices
            .into_iter()
            .find(|device| device.device_id == requested || device.local_name.as_deref() == Some(&requested))
            .ok_or_else(|| {
                "Bluetooth Studio device was not found. Pair or connect it in macOS Bluetooth settings first."
                    .to_string()
            });
    }

    devices.into_iter().next().ok_or_else(|| {
        "Bluetooth Studio device was not found. Pair or connect it in macOS Bluetooth settings first."
            .to_string()
    })
}

enum StudioTarget {
    Usb { port_path: String },
    Bluetooth { device_id: String },
}

fn resolve_studio_target(kind: &str, port_path: Option<String>) -> Result<StudioTarget, String> {
    match kind {
        "usb" => {
            let port_path = port_path
                .filter(|path| !path.trim().is_empty())
                .ok_or_else(|| "USB Direct Mode requires a serial port path.".to_string())?;
            Ok(StudioTarget::Usb { port_path })
        }
        "bluetooth" => {
            let device = resolve_ble_device(port_path)?;
            Ok(StudioTarget::Bluetooth {
                device_id: device.device_id,
            })
        }
        _ => Err(format!("Unsupported Direct Mode connection kind: {kind}")),
    }
}

struct BehaviorCatalog {
    role_by_id: HashMap<i32, String>,
    id_by_role: HashMap<String, i32>,
}

impl BehaviorCatalog {
    fn id_for(&self, role: &str) -> Result<i32, String> {
        self.id_by_role
            .get(role)
            .copied()
            .ok_or_else(|| format!("Device firmware does not expose behavior: {role}"))
    }
}

fn load_behavior_catalog_from_transport<T: Read + Write + ?Sized>(
    transport: &mut T,
) -> Result<BehaviorCatalog, String> {
    let mut client = StudioClient::new(transport);
    load_behavior_catalog_from_client(&mut client)
}

fn load_behavior_catalog_from_client<T: Read + Write>(
    client: &mut StudioClient<T>,
) -> Result<BehaviorCatalog, String> {
    let behavior_ids = client
        .list_all_behaviors()
        .map_err(|error| error.to_string())?;
    let mut role_by_id = HashMap::new();
    let mut id_by_role = HashMap::new();

    for behavior_id in behavior_ids {
        let details = client
            .get_behavior_details(behavior_id)
            .map_err(|error| error.to_string())?;
        if let Some(role) = role_from_behavior_display_name(&details.display_name) {
            role_by_id.insert(behavior_id as i32, role.to_string());
            id_by_role
                .entry(role.to_string())
                .or_insert(behavior_id as i32);
        }
    }

    Ok(BehaviorCatalog {
        role_by_id,
        id_by_role,
    })
}

fn save_studio_changes_from_transport<T: Read + Write + ?Sized>(
    transport: &mut T,
) -> Result<(), String> {
    let mut client = StudioClient::new(transport);
    client.save_changes().map_err(|error| error.to_string())
}

fn role_from_behavior_display_name(display_name: &str) -> Option<&'static str> {
    match display_name.trim().to_ascii_lowercase().as_str() {
        "key press" => Some("key"),
        "key toggle" => Some("key-toggle"),
        "layer-tap" => Some("layer-tap"),
        "mod-tap" => Some("mod-tap"),
        "sticky key" => Some("sticky-key"),
        "sticky layer" => Some("sticky-layer"),
        "momentary layer" => Some("momentary"),
        "toggle layer" => Some("toggle-layer"),
        "to layer" => Some("to-layer"),
        "bluetooth" => Some("bluetooth"),
        "mouse key press" => Some("mouse-key"),
        "mouse move" | "mouse_move" => Some("mouse-move"),
        "mouse scroll" | "mouse_scroll" => Some("mouse-scroll"),
        "caps word" => Some("caps-word"),
        "key repeat" => Some("key-repeat"),
        "reset" => Some("reset"),
        "bootloader" => Some("bootloader"),
        "soft off" | "z_so_off" => Some("soft-off"),
        "studio unlock" => Some("studio-unlock"),
        "grave/escape" => Some("grave-escape"),
        "transparent" => Some("transparent"),
        "none" => Some("none"),
        _ => None,
    }
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
        "&kp" => Ok(Behavior::KeyPress(parse_hid_usage(required_token(
            &tokens, 1, "key",
        )?)?)),
        "&kt" => Ok(Behavior::KeyToggle(parse_hid_usage(required_token(
            &tokens, 1, "key",
        )?)?)),
        "&lt" => Ok(Behavior::LayerTap {
            layer_id: parse_u32(required_token(&tokens, 1, "layer")?)?,
            tap: parse_hid_usage(required_token(&tokens, 2, "tap key")?)?,
        }),
        "&mt" => Ok(Behavior::ModTap {
            hold: parse_hid_usage(required_token(&tokens, 1, "hold key")?)?,
            tap: parse_hid_usage(required_token(&tokens, 2, "tap key")?)?,
        }),
        "&sk" => Ok(Behavior::StickyKey(parse_hid_usage(required_token(
            &tokens, 1, "key",
        )?)?)),
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
            value: tokens
                .get(2)
                .map(|value| parse_u32(value))
                .transpose()?
                .unwrap_or(0),
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
        "BT_NXT" => Ok(1),
        "BT_PRV" => Ok(2),
        "BT_SEL" => Ok(3),
        "BT_CLR_ALL" => Ok(4),
        "BT_DISC" => Ok(5),
        _ => parse_u32(value),
    }
}

fn parse_u32(value: &str) -> Result<u32, String> {
    value
        .parse::<u32>()
        .map_err(|_| format!("Expected number, got {value}"))
}

fn run_gh(root: &str, args: &[&str], repo_url: Option<&str>) -> Result<String, String> {
    let args = gh_args_with_repo(
        args.iter().map(|arg| (*arg).to_string()).collect(),
        repo_url,
    )?;
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

fn run_gh_owned(root: &str, args: Vec<String>, repo_url: Option<&str>) -> Result<String, String> {
    let args = gh_args_with_repo(args, repo_url)?;
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

fn latest_successful_github_run_id(
    root: &str,
    repo_url: Option<&str>,
    head_sha: &str,
) -> Result<String, String> {
    let output = run_gh(
        root,
        &[
            "run",
            "list",
            "--workflow",
            "build.yml",
            "--limit",
            "1",
            "--status",
            "success",
            "--commit",
            head_sha,
            "--json",
            "databaseId,headSha",
        ],
        repo_url,
    )?;
    parse_first_run_id(&output).ok_or_else(|| {
        format!("No successful GitHub Actions run found for current commit {head_sha}")
    })
}

fn parse_first_run_id(output: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(output).ok()?;
    let run = value.as_array()?.first()?;
    let id = run.get("databaseId")?;
    if let Some(number) = id.as_u64() {
        return Some(number.to_string());
    }
    id.as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn run_firmware_build_checks(root: &str, repo_url: Option<&str>) -> FirmwareBuildCheck {
    let mut items = Vec::new();
    let root_path = PathBuf::from(root);

    push_check(
        &mut items,
        "local repository",
        root_path.join(".git").exists(),
        if root_path.join(".git").exists() {
            "git repository found".to_string()
        } else {
            "selected folder is not a git repository".to_string()
        },
    );
    push_required_file_check(&mut items, &root_path, "config/KobitoKey.keymap");
    push_required_file_check(
        &mut items,
        &root_path,
        "config/boards/shields/KobitoKey/KobitoKey_left.overlay",
    );
    push_required_file_check(
        &mut items,
        &root_path,
        "config/boards/shields/KobitoKey/KobitoKey_right.overlay",
    );

    let origin = run_git(root, &["remote", "get-url", "origin"]);
    push_check_result(
        &mut items,
        "git origin",
        origin.as_ref().map(|value| value.as_str()),
    );
    push_repository_target_check(&mut items, origin.as_deref(), repo_url);

    let branch = run_git(root, &["rev-parse", "--abbrev-ref", "HEAD"]);
    let branch_detail = match branch {
        Ok(value) if value == "HEAD" => {
            Err("detached HEAD; checkout a branch before pushing".to_string())
        }
        other => other,
    };
    push_check_result(
        &mut items,
        "git branch",
        branch_detail.as_ref().map(|value| value.as_str()),
    );

    let gh = Command::new("gh").arg("--version").output();
    push_command_check(&mut items, "gh CLI", gh, "gh is available");

    let gh_auth = Command::new("gh").args(["auth", "status"]).output();
    push_command_check(&mut items, "gh auth", gh_auth, "gh is authenticated");

    let workflow = run_gh(
        root,
        &["workflow", "view", "build.yml", "--json", "name,state"],
        repo_url,
    );
    push_check_result(
        &mut items,
        "build workflow",
        workflow.as_ref().map(|value| value.as_str()),
    );

    FirmwareBuildCheck {
        ok: items.iter().all(|item| item.ok),
        items,
    }
}

fn push_required_file_check(
    items: &mut Vec<FirmwareBuildCheckItem>,
    root: &Path,
    relative_path: &str,
) {
    let exists = root.join(relative_path).exists();
    push_check(
        items,
        relative_path,
        exists,
        if exists {
            "found".to_string()
        } else {
            "missing".to_string()
        },
    );
}

fn push_check(items: &mut Vec<FirmwareBuildCheckItem>, label: &str, ok: bool, detail: String) {
    items.push(FirmwareBuildCheckItem {
        label: label.to_string(),
        ok,
        detail,
    });
}

fn push_check_result(
    items: &mut Vec<FirmwareBuildCheckItem>,
    label: &str,
    result: Result<&str, &String>,
) {
    match result {
        Ok(value) => push_check(items, label, true, value.to_string()),
        Err(error) => push_check(items, label, false, error.to_string()),
    }
}

fn push_command_check(
    items: &mut Vec<FirmwareBuildCheckItem>,
    label: &str,
    result: Result<std::process::Output, std::io::Error>,
    success_detail: &str,
) {
    match result {
        Ok(output) if output.status.success() => {
            push_check(items, label, true, success_detail.to_string())
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            push_check(
                items,
                label,
                false,
                if stderr.is_empty() { stdout } else { stderr },
            );
        }
        Err(error) => push_check(items, label, false, error.to_string()),
    }
}

fn push_repository_target_check(
    items: &mut Vec<FirmwareBuildCheckItem>,
    origin: Result<&str, &String>,
    repo_url: Option<&str>,
) {
    let Some(repo_url) = repo_url.and_then(normalize_github_repo_arg) else {
        return;
    };
    let origin_repo = match origin.ok().and_then(normalize_github_repo_arg) {
        Some(value) => value,
        None => return,
    };

    push_check(
        items,
        "repository target",
        origin_repo == repo_url,
        if origin_repo == repo_url {
            format!("origin and build target both use {repo_url}")
        } else {
            format!("origin is {origin_repo}, but build target is {repo_url}")
        },
    );
}

fn current_git_branch(root: &str) -> Result<String, String> {
    let branch = run_git(root, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    if branch == "HEAD" {
        Err("detached HEAD; checkout a branch before running the workflow".to_string())
    } else {
        Ok(branch)
    }
}

fn current_git_head_sha(root: &str) -> Result<String, String> {
    run_git(root, &["rev-parse", "HEAD"])
}

fn run_git(root: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(root)
        .args(args)
        .output()
        .map_err(|error| error.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            Err(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            Err(stderr)
        }
    }
}

fn has_staged_changes_for_paths(root: &str, paths: &[&str]) -> Result<bool, String> {
    let mut args = vec!["diff", "--cached", "--quiet", "--"];
    args.extend(paths);
    let output = Command::new("git")
        .current_dir(root)
        .args(args)
        .output()
        .map_err(|error| error.to_string())?;

    match output.status.code() {
        Some(0) => Ok(false),
        Some(1) => Ok(true),
        _ => Err(String::from_utf8_lossy(&output.stderr).trim().to_string()),
    }
}

fn gh_args_with_repo(mut args: Vec<String>, repo_url: Option<&str>) -> Result<Vec<String>, String> {
    if let Some(repo) = repo_url.and_then(normalize_github_repo_arg) {
        args.push("-R".to_string());
        args.push(repo);
    }
    Ok(args)
}

fn normalize_github_repo_arg(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }

    let trimmed = value
        .trim_end_matches('/')
        .trim_end_matches(".git")
        .to_string();

    if let Some(path) = trimmed.strip_prefix("https://github.com/") {
        return normalize_owner_repo(path);
    }
    if let Some(path) = trimmed.strip_prefix("http://github.com/") {
        return normalize_owner_repo(path);
    }
    if let Some(path) = trimmed.strip_prefix("git@github.com:") {
        return normalize_owner_repo(path);
    }
    normalize_owner_repo(&trimmed)
}

fn normalize_owner_repo(path: &str) -> Option<String> {
    let mut parts = path.split('/').filter(|part| !part.is_empty());
    let owner = parts.next()?;
    let repo = parts.next()?;
    Some(format!("{owner}/{repo}"))
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
#[serde(rename_all = "camelCase")]
struct FirmwareBuildStart {
    committed: bool,
    commit_output: Option<String>,
    push_output: Option<String>,
    build_output: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct FirmwareBuildCheck {
    ok: bool,
    items: Vec<FirmwareBuildCheckItem>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct FirmwareBuildCheckItem {
    label: String,
    ok: bool,
    detail: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct FirmwareFlashTargets {
    uf2_files: Vec<String>,
    bootloader_volumes: Vec<String>,
    left_uf2: Option<String>,
    right_uf2: Option<String>,
    unknown_uf2: Vec<String>,
    manifest_path: Option<String>,
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
#[serde(rename_all = "camelCase")]
struct StudioBluetoothDevice {
    device_id: String,
    local_name: Option<String>,
    label: String,
}

impl From<BleDeviceInfo> for StudioBluetoothDevice {
    fn from(device: BleDeviceInfo) -> Self {
        let label = device.display_name();
        Self {
            device_id: device.device_id,
            local_name: device.local_name,
            label,
        }
    }
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
struct StudioConnection {
    kind: String,
    transport: String,
    port_path: Option<String>,
    keymap: StudioKeymap,
}

#[derive(serde::Serialize)]
struct StudioConnectionError {
    code: String,
    message: String,
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct StudioTrackballSettings {
    cpi: u32,
    cursor_numerator: u32,
    cursor_denominator: u32,
    scroll_numerator: u32,
    scroll_denominator: u32,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct StudioComboSet {
    combos: Vec<StudioCombo>,
    max_combos: u32,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct StudioCombo {
    id: String,
    index: u32,
    binding: String,
    key_positions: Vec<u32>,
    timeout_ms: u32,
    require_prior_idle_ms: u32,
    layer_mask: u32,
    slow_release: bool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct StudioComboInput {
    binding: String,
    key_positions: Vec<u32>,
    timeout_ms: u32,
    require_prior_idle_ms: Option<u32>,
    layer_mask: Option<u32>,
    slow_release: Option<bool>,
}

impl StudioConnectionError {
    fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
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
            check_firmware_build_ready,
            save_commit_push_and_trigger_build,
            latest_github_run,
            download_latest_artifact,
            list_uf2_files,
            resolve_firmware_flash_targets,
            list_bootloader_volumes,
            copy_uf2_to_volume,
            list_studio_ports,
            list_studio_bluetooth_devices,
            read_studio_keymap,
            connect_studio_device,
            write_studio_key,
            read_studio_trackball_settings,
            write_studio_trackball_settings,
            read_studio_combos,
            add_studio_combo,
            set_studio_combo,
            remove_studio_combo
        ])
        .run(tauri::generate_context!())
        .expect("error while running KobitoKey Studio");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_behavior_catalog() -> BehaviorCatalog {
        BehaviorCatalog {
            role_by_id: std::collections::HashMap::from([
                (1, "key".to_string()),
                (2, "bluetooth".to_string()),
                (3, "momentary".to_string()),
            ]),
            id_by_role: std::collections::HashMap::from([
                ("key".to_string(), 1),
                ("bluetooth".to_string(), 2),
                ("momentary".to_string(), 3),
            ]),
        }
    }

    #[test]
    fn set_combo_decoder_reads_nested_error() {
        let mut set_response = Vec::new();
        push_varint_field(&mut set_response, 2, 2);
        let mut wrapper = Vec::new();
        push_len_field(&mut wrapper, 2, &set_response);

        let error = decode_set_combo_response(&wrapper).expect_err("invalid index must fail");
        assert_eq!(error, "Combo index is invalid");
    }

    #[test]
    fn remove_combo_decoder_reads_nested_error() {
        let mut remove_response = Vec::new();
        push_varint_field(&mut remove_response, 2, 2);
        let mut wrapper = Vec::new();
        push_len_field(&mut wrapper, 4, &remove_response);

        let error = decode_remove_combo_response(&wrapper).expect_err("invalid index must fail");
        assert_eq!(error, "Combo index is invalid");
    }

    #[test]
    fn get_combos_request_uses_length_delimited_oneof() {
        let request = encode_get_combos_request();

        assert!(find_len_field(&request, 1).is_some());
        assert_eq!(find_varint_field(&request, 1), None);
    }

    #[test]
    fn parse_direct_behavior_accepts_all_bluetooth_commands() {
        let cases = [
            ("&bt BT_CLR 2", 0, 2),
            ("&bt BT_NXT", 1, 0),
            ("&bt BT_PRV", 2, 0),
            ("&bt BT_SEL 4", 3, 4),
            ("&bt BT_CLR_ALL", 4, 0),
            ("&bt BT_DISC", 5, 0),
        ];

        for (binding, expected_command, expected_value) in cases {
            let behavior = parse_direct_behavior(binding).expect("Bluetooth command should parse");
            assert!(matches!(
                behavior,
                Behavior::Bluetooth {
                    command,
                    value
                } if command == expected_command && value == expected_value
            ));
        }
    }

    #[test]
    fn combo_config_round_trips_common_fields() {
        let catalog = test_behavior_catalog();
        let combo = StudioComboInput {
            binding: "&kp A".to_string(),
            key_positions: vec![0, 3],
            timeout_ms: 75,
            require_prior_idle_ms: Some(20),
            layer_mask: Some(0b101),
            slow_release: Some(true),
        };

        let config = encode_combo_config(&combo, &catalog).expect("combo config should encode");
        let decoded =
            decode_combo_config(0, &config, &catalog).expect("combo config should decode");

        assert_eq!(decoded.binding, "&kp A");
        assert_eq!(decoded.key_positions, vec![0, 3]);
        assert_eq!(decoded.timeout_ms, 75);
        assert_eq!(decoded.require_prior_idle_ms, 20);
        assert_eq!(decoded.layer_mask, 0b101);
        assert!(decoded.slow_release);
    }

    #[test]
    fn get_combos_response_decodes_combos_and_capacity() {
        let catalog = test_behavior_catalog();
        let combo = StudioComboInput {
            binding: "&mo 2".to_string(),
            key_positions: vec![4, 5],
            timeout_ms: 60,
            require_prior_idle_ms: None,
            layer_mask: None,
            slow_release: None,
        };
        let combo_config =
            encode_combo_config(&combo, &catalog).expect("combo config should encode");
        let mut combos_payload = Vec::new();
        push_len_field(&mut combos_payload, 1, &combo_config);
        push_varint_field(&mut combos_payload, 2, 12);
        let mut response = Vec::new();
        push_len_field(&mut response, 1, &combos_payload);

        let decoded =
            decode_get_combos_response(&response, &catalog).expect("combo response should decode");

        assert_eq!(decoded.max_combos, 12);
        assert_eq!(decoded.combos.len(), 1);
        assert_eq!(decoded.combos[0].binding, "&mo 2");
        assert_eq!(decoded.combos[0].key_positions, vec![4, 5]);
    }

    #[test]
    fn normalizes_github_repository_url_for_gh() {
        let cases = [
            (
                "https://github.com/s-hiraoku/KobitoKey_QWERTY",
                "s-hiraoku/KobitoKey_QWERTY",
            ),
            (
                "https://github.com/s-hiraoku/KobitoKey_QWERTY.git",
                "s-hiraoku/KobitoKey_QWERTY",
            ),
            (
                "git@github.com:s-hiraoku/KobitoKey_QWERTY.git",
                "s-hiraoku/KobitoKey_QWERTY",
            ),
            ("s-hiraoku/KobitoKey_QWERTY", "s-hiraoku/KobitoKey_QWERTY"),
        ];

        for (input, expected) in cases {
            assert_eq!(normalize_github_repo_arg(input).as_deref(), Some(expected));
        }
    }

    #[test]
    fn repository_target_check_detects_origin_mismatch() {
        let mut items = Vec::new();
        let origin = Ok("git@github.com:s-hiraoku/KobitoKey_QWERTY.git");

        push_repository_target_check(
            &mut items,
            origin,
            Some("https://github.com/other/KobitoKey_QWERTY"),
        );

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].label, "repository target");
        assert!(!items[0].ok);
        assert!(items[0].detail.contains("s-hiraoku/KobitoKey_QWERTY"));
        assert!(items[0].detail.contains("other/KobitoKey_QWERTY"));
    }

    #[test]
    fn staged_change_check_is_limited_to_studio_managed_paths() {
        let root = unique_test_dir("kobitokey-staged-change-check");
        fs::create_dir_all(root.join("config")).expect("test config dir should be created");
        fs::write(root.join("config/KobitoKey.keymap"), "initial")
            .expect("keymap fixture should be written");
        fs::write(root.join("notes.txt"), "initial").expect("notes fixture should be written");
        run_test_git(&root, &["init"]);
        run_test_git(&root, &["config", "user.email", "test@example.com"]);
        run_test_git(&root, &["config", "user.name", "Test User"]);
        run_test_git(&root, &["add", "."]);
        run_test_git(&root, &["commit", "-m", "initial"]);

        fs::write(root.join("notes.txt"), "unrelated").expect("notes change should be written");
        run_test_git(&root, &["add", "notes.txt"]);
        assert!(!has_staged_changes_for_paths(&display_path(&root), &["config/KobitoKey.keymap"])
            .expect("path-limited diff should run"));

        fs::write(root.join("config/KobitoKey.keymap"), "updated")
            .expect("keymap change should be written");
        run_test_git(&root, &["add", "config/KobitoKey.keymap"]);
        assert!(has_staged_changes_for_paths(&display_path(&root), &["config/KobitoKey.keymap"])
            .expect("path-limited diff should run"));

        fs::remove_dir_all(root).expect("test repo should be removed");
    }

    fn unique_test_dir(prefix: &str) -> PathBuf {
        let mut dir = std::env::temp_dir();
        dir.push(format!(
            "{prefix}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time should be after epoch")
                .as_nanos()
        ));
        dir
    }

    fn run_test_git(root: &Path, args: &[&str]) {
        let output = Command::new("git")
            .current_dir(root)
            .args(args)
            .output()
            .expect("git should run");
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }
}
