use std::borrow::Cow;
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU16, AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex};

use brave_music_core::library::LibraryDocument;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, Window};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

#[cfg(target_os = "linux")]
use gtk::prelude::*;

static BLOCKED_ADS_COUNT: AtomicU64 = AtomicU64::new(42);
static YTM_BLOCKED_COUNT: AtomicU64 = AtomicU64::new(28);
static SPOTIFY_BLOCKED_COUNT: AtomicU64 = AtomicU64::new(14);
static STREAM_SERVER_PORT: AtomicU16 = AtomicU16::new(0);

struct ActiveDownloadProcess {
    pid: u32,
    canceled: Arc<AtomicBool>,
}

static ACTIVE_DOWNLOADS: LazyLock<Mutex<HashMap<String, ActiveDownloadProcess>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

const EMPTY_1PX_GIF: [u8; 43] = [
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
    0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00,
    0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
];

const CHROME_USER_AGENT: &str =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SHIELDS_SCRIPT: &str = include_str!("../../../src/js/webview-shields.js");

const WINDOW_CHROME_POLYFILL_SCRIPT: &str = r#"
(() => {
  if (!window.chrome) {
    window.chrome = {
      app: {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
      },
      runtime: {
        id: '',
        OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
        connect: function() { return { onDisconnect: { addListener: function() {} }, onMessage: { addListener: function() {} }, postMessage: function() {} }; },
        sendMessage: function() {}
      }
    };
  }
})();
"#;

const GUEST_ERROR_CAPTURE_SCRIPT: &str = r#"
(() => {
  window.addEventListener('error', (e) => {
    try {
      var msg = encodeURIComponent('[Guest Page Error: ' + (e.message || '') + ' at ' + (e.filename || '') + ':' + (e.lineno || 0) + ']');
      fetch('/__brave_shield_blocked__?log_error=1&msg=' + msg).catch(() => {});
    } catch(_) {}
  }, true);

  window.addEventListener('unhandledrejection', (e) => {
    try {
      var reason = e.reason ? (e.reason.stack || e.reason.message || String(e.reason)) : 'unknown';
      var msg = encodeURIComponent('[Guest Page Unhandled Rejection: ' + reason + ']');
      fetch('/__brave_shield_blocked__?log_error=1&msg=' + msg).catch(() => {});
    } catch(_) {}
  }, true);
})();
"#;

const SPOTIFY_NAVBAR_FIX_SCRIPT: &str = r#"
(() => {
  try {
    const style = document.createElement('style');
    style.id = 'brave-music-spotify-fix';
    style.textContent = `
      [data-testid="left-sidebar"], nav[aria-label="Main"] {
        display: flex !important;
        visibility: visible !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  } catch(e) {}
})();
"#;

#[derive(Serialize)]
struct RuntimeInfo {
    tauri: &'static str,
    os: &'static str,
    arch: &'static str,
}

#[tauri::command]
fn runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        tauri: "2.x",
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
    }
}

fn app_library_path(app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(target_os = "linux")]
    {
        if let Some(home) = std::env::var_os("HOME") {
            let legacy_path = PathBuf::from(home).join(".local/share/brave-music/library.json");
            if legacy_path.exists() {
                return Ok(legacy_path);
            }
        }
    }
    app.path()
        .app_data_dir()
        .map(|path| path.join("library.json"))
        .map_err(|error| error.to_string())
}

fn read_library(app: &AppHandle) -> Result<LibraryDocument, String> {
    let path = app_library_path(app)?;
    LibraryDocument::load(&path).map_err(|error| error.to_string())
}

fn write_library(app: &AppHandle, document: &LibraryDocument) -> Result<(), String> {
    let path = app_library_path(app)?;
    document
        .save_atomic(&path)
        .map_err(|error| error.to_string())
}

fn import_library_file(
    source: &std::path::Path,
    target: &std::path::Path,
    backup: &std::path::Path,
) -> Result<LibraryDocument, String> {
    if target.exists() {
        return Err("The new app already has a library; import was not run".to_owned());
    }

    let source_bytes =
        fs::read(source).map_err(|error| format!("Could not read legacy library: {error}"))?;
    let document =
        LibraryDocument::from_json_bytes(&source_bytes).map_err(|error| error.to_string())?;
    let backup_dir = backup
        .parent()
        .ok_or_else(|| "Could not determine migration backup directory".to_owned())?;
    fs::create_dir_all(backup_dir)
        .map_err(|error| format!("Could not create migration backup directory: {error}"))?;
    set_private_permissions(backup_dir, 0o700)
        .map_err(|error| format!("Could not secure migration backup directory: {error}"))?;

    if backup.exists() {
        let existing_backup = fs::read(backup)
            .map_err(|error| format!("Could not verify prior migration backup: {error}"))?;
        if existing_backup != source_bytes {
            return Err("A different migration backup already exists; import stopped".to_owned());
        }
    } else {
        let mut temporary_backup = tempfile::NamedTempFile::new_in(backup_dir)
            .map_err(|error| format!("Could not stage migration backup: {error}"))?;
        temporary_backup
            .write_all(&source_bytes)
            .and_then(|()| temporary_backup.as_file().sync_all())
            .map_err(|error| format!("Could not write staged migration backup: {error}"))?;
        if let Err(error) = temporary_backup.persist_noclobber(backup) {
            if error.error.kind() != std::io::ErrorKind::AlreadyExists {
                return Err(format!(
                    "Could not publish migration backup: {}",
                    error.error
                ));
            }
            let existing_backup = fs::read(backup).map_err(|error| {
                format!("Could not verify concurrent migration backup: {error}")
            })?;
            if existing_backup != source_bytes {
                return Err(
                    "A different migration backup already exists; import stopped".to_owned(),
                );
            }
        }
        set_private_permissions(backup, 0o600)
            .map_err(|error| format!("Could not secure migration backup: {error}"))?;
        let verified_backup = fs::read(backup)
            .map_err(|error| format!("Could not verify migration backup: {error}"))?;
        if verified_backup != source_bytes {
            return Err("Migration backup verification failed; import stopped".to_owned());
        }
    }
    set_private_permissions(backup, 0o600)
        .map_err(|error| format!("Could not secure migration backup: {error}"))?;

    document
        .save_new_atomic(target)
        .map_err(|error| format!("Could not write the new library: {error}"))?;
    Ok(document)
}

#[cfg(unix)]
fn set_private_permissions(path: &std::path::Path, mode: u32) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let mut permissions = fs::metadata(path)?.permissions();
    permissions.set_mode(mode);
    fs::set_permissions(path, permissions)
}

#[cfg(not(unix))]
fn set_private_permissions(_path: &std::path::Path, _mode: u32) -> std::io::Result<()> {
    Ok(())
}

#[tauri::command]
fn get_library(app: AppHandle) -> Result<LibraryDocument, String> {
    let path = app_library_path(&app)?;
    if !path.exists() {
        if let Ok(imported) = import_legacy_library(app.clone()) {
            return Ok(imported);
        }
    }
    read_library(&app)
}

#[tauri::command]
fn import_legacy_library(app: AppHandle) -> Result<LibraryDocument, String> {
    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
        return Err("Legacy Linux library import is only available on Linux".to_owned());
    }

    #[cfg(target_os = "linux")]
    {
        let home = std::env::var_os("HOME")
            .map(PathBuf::from)
            .ok_or_else(|| "Could not locate the current user's home directory".to_owned())?;
        let source = home.join(".local/share/brave-music/library.json");
        let target = app_library_path(&app)?;
        let data_dir = target
            .parent()
            .ok_or_else(|| "Could not determine the new app data directory".to_owned())?;
        let backup = data_dir.join("migration-backups/legacy-library.json");
        import_library_file(&source, &target, &backup)
    }
}

fn get_user_downloads_dir(app: &AppHandle) -> PathBuf {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let legacy_data_dir = home.as_ref().map(|h| h.join(".local/share/brave-music"));

    // 1. Check legacy settings.json
    if let Some(ref dir) = legacy_data_dir {
        let settings_path = dir.join("settings.json");
        if let Ok(bytes) = fs::read(&settings_path) {
            if let Ok(val) = serde_json::from_slice::<Value>(&bytes) {
                if let Some(d) = val.get("downloadsDir").and_then(|v| v.as_str()) {
                    let pb = PathBuf::from(d);
                    if pb.exists() && pb.is_dir() {
                        return pb;
                    }
                }
            }
        }
    }

    // 2. Check preview settings.json
    if let Ok(app_dir) = app.path().app_data_dir() {
        let settings_path = app_dir.join("settings.json");
        if let Ok(bytes) = fs::read(&settings_path) {
            if let Ok(val) = serde_json::from_slice::<Value>(&bytes) {
                if let Some(d) = val.get("downloadsDir").and_then(|v| v.as_str()) {
                    let pb = PathBuf::from(d);
                    if pb.exists() && pb.is_dir() {
                        return pb;
                    }
                }
            }
        }
    }

    // 3. Fallback to legacy downloads dir
    if let Some(ref h) = home {
        let leg = h.join(".local/share/brave-music/downloads");
        if leg.exists() {
            return leg;
        }
    }

    // 4. Fallback to app_data_dir downloads
    app.path()
        .app_data_dir()
        .map(|p| p.join("downloads"))
        .unwrap_or_else(|_| PathBuf::from("downloads"))
}

fn resolve_audio_file(app: &AppHandle, filename: &str) -> Option<PathBuf> {
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return None;
    }

    let downloads_dir = get_user_downloads_dir(app);
    let primary = downloads_dir.join(filename);
    if primary.exists() && primary.is_file() {
        return Some(primary);
    }

    // Fallbacks
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        let legacy = home.join(".local/share/brave-music/downloads").join(filename);
        if legacy.exists() && legacy.is_file() {
            return Some(legacy);
        }
    }

    if let Ok(app_dir) = app.path().app_data_dir() {
        let preview = app_dir.join("downloads").join(filename);
        if preview.exists() && preview.is_file() {
            return Some(preview);
        }
    }

    None
}

fn delete_file_from_downloads(app: &AppHandle, filename: &str) {
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return;
    }
    let downloads_dir = get_user_downloads_dir(app);
    let primary = downloads_dir.join(filename);
    if primary.exists() && primary.is_file() {
        let _ = fs::remove_file(primary);
    }
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        let leg = home.join(".local/share/brave-music/downloads").join(filename);
        if leg.exists() && leg.is_file() {
            let _ = fs::remove_file(leg);
        }
    }
    if let Ok(app_dir) = app.path().app_data_dir() {
        let prev = app_dir.join("downloads").join(filename);
        if prev.exists() && prev.is_file() {
            let _ = fs::remove_file(prev);
        }
    }
}

#[tauri::command]
fn create_playlist(app: AppHandle, name: String) -> Result<LibraryDocument, String> {
    let mut document = read_library(&app)?;
    document
        .create_playlist(&name, None)
        .map_err(|error| error.to_string())?;
    write_library(&app, &document)?;
    let _ = app.emit("library-updated", serde_json::json!({ "status": "playlist_created", "name": name }));
    Ok(document)
}

#[tauri::command]
fn delete_playlist(
    app: AppHandle,
    name: String,
    delete_files: Option<bool>,
) -> Result<LibraryDocument, String> {
    let mut document = read_library(&app)?;
    let should_delete_files = delete_files.unwrap_or(false);
    let filenames = document
        .delete_playlist(&name, should_delete_files)
        .map_err(|error| error.to_string())?;
    write_library(&app, &document)?;

    if should_delete_files {
        for filename in filenames {
            delete_file_from_downloads(&app, &filename);
        }
    }

    let _ = app.emit("library-updated", serde_json::json!({ "status": "playlist_deleted", "name": name }));
    Ok(document)
}

#[tauri::command]
fn set_playlist_cover(
    app: AppHandle,
    name: String,
    cover: Value,
) -> Result<LibraryDocument, String> {
    let mut document = read_library(&app)?;
    document
        .set_playlist_cover(&name, cover)
        .map_err(|error| error.to_string())?;
    write_library(&app, &document)?;
    let _ = app.emit("library-updated", serde_json::json!({ "status": "playlist_cover_updated", "name": name }));
    Ok(document)
}

#[tauri::command]
fn add_track_to_playlist(
    app: AppHandle,
    track_id: Value,
    playlist_name: String,
) -> Result<LibraryDocument, String> {
    let mut document = read_library(&app)?;
    document
        .add_track_to_playlist(&track_id, &playlist_name)
        .map_err(|error| error.to_string())?;
    write_library(&app, &document)?;
    let _ = app.emit("library-updated", serde_json::json!({ "status": "playlist_track_added", "playlist": playlist_name }));
    Ok(document)
}

#[tauri::command]
fn remove_track_from_playlist(
    app: AppHandle,
    track_id: Value,
    playlist_name: String,
) -> Result<LibraryDocument, String> {
    let mut document = read_library(&app)?;
    document
        .remove_track_from_playlist(&track_id, &playlist_name)
        .map_err(|error| error.to_string())?;
    write_library(&app, &document)?;
    let _ = app.emit("library-updated", serde_json::json!({ "status": "playlist_track_removed", "playlist": playlist_name }));
    Ok(document)
}

#[tauri::command]
fn delete_track(app: AppHandle, track_id: Value) -> Result<LibraryDocument, String> {
    let mut document = read_library(&app)?;
    let filename_opt = document
        .delete_track(&track_id)
        .map_err(|error| error.to_string())?;
    write_library(&app, &document)?;

    if let Some(filename) = filename_opt {
        delete_file_from_downloads(&app, &filename);
    }

    let _ = app.emit("library-updated", serde_json::json!({ "status": "track_deleted" }));
    Ok(document)
}

#[tauri::command]
fn delete_tracks(app: AppHandle, track_ids: Vec<Value>) -> Result<LibraryDocument, String> {
    let mut document = read_library(&app)?;
    let result = document
        .delete_tracks(&track_ids)
        .map_err(|error| error.to_string())?;
    write_library(&app, &document)?;

    for filename in result.filenames {
        delete_file_from_downloads(&app, &filename);
    }

    let _ = app.emit("library-updated", serde_json::json!({ "status": "tracks_deleted" }));
    Ok(document)
}

#[cfg(target_os = "linux")]
static CURRENT_LINUX_TAB: LazyLock<Mutex<String>> = LazyLock::new(|| Mutex::new("yt-view".to_string()));
#[cfg(target_os = "linux")]
static IS_MODAL_ACTIVE: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "linux")]
fn setup_linux_overlay(window: &Window) {
    if let Ok(vbox) = window.default_vbox() {
        let children = vbox.children();
        if children.len() >= 3 {
            let main_ui = children[0].clone();
            let yt_wv = children[1].clone();
            let sp_wv = children[2].clone();

            vbox.remove(&main_ui);
            vbox.remove(&yt_wv);
            vbox.remove(&sp_wv);

            let overlay = gtk::Overlay::new();
            overlay.add(&main_ui);

            yt_wv.set_margin_top(58);
            overlay.add_overlay(&yt_wv);

            sp_wv.set_margin_top(58);
            overlay.add_overlay(&sp_wv);

            vbox.pack_start(&overlay, true, true, 0);
            overlay.show_all();
        }
    }
}

#[cfg(target_os = "linux")]
fn update_linux_layout(window: &Window, tab: &str) {
    {
        let mut current = match CURRENT_LINUX_TAB.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        *current = tab.to_string();
    }

    if IS_MODAL_ACTIVE.load(Ordering::SeqCst) {
        return;
    }

    if let Ok(vbox) = window.default_vbox() {
        let children = vbox.children();
        if let Some(overlay_widget) = children.first() {
            if let Ok(overlay) = overlay_widget.clone().downcast::<gtk::Overlay>() {
                let overlay_children = overlay.children();
                if overlay_children.len() >= 3 {
                    let yt_wv = &overlay_children[1];
                    let sp_wv = &overlay_children[2];
                    match tab {
                        "yt-view" | "yt" => {
                            yt_wv.show();
                            sp_wv.hide();
                        }
                        "spotify-view" | "spotify" => {
                            yt_wv.hide();
                            sp_wv.show();
                        }
                        "downloads-view" | "downloads" => {
                            yt_wv.hide();
                            sp_wv.hide();
                        }
                        _ => {}
                    }
                    overlay.queue_draw();
                }
            }
        }
    }
}

#[cfg(not(target_os = "linux"))]
fn update_cross_platform_layout(app: &AppHandle, tab: &str) {
    let yt = app.get_webview("yt-webview");
    let spotify = app.get_webview("spotify-webview");

    let (child_w, child_h) = if let Some(window) = app.get_window("main") {
        let size = window.inner_size().unwrap_or(tauri::PhysicalSize::new(1360, 840));
        let scale = window.scale_factor().unwrap_or(1.0);
        let w = size.width as f64 / scale;
        let h = ((size.height as f64 / scale) - 58.0).max(100.0);
        (w, h)
    } else {
        (1360.0, 782.0)
    };

    match tab {
        "yt-view" | "yt" => {
            if let Some(w) = yt {
                let _ = w.set_position(tauri::LogicalPosition::new(0.0, 58.0));
                let _ = w.set_size(tauri::LogicalSize::new(child_w, child_h));
                let _ = w.show();
            }
            if let Some(w) = spotify {
                let _ = w.hide();
            }
        }
        "spotify-view" | "spotify" => {
            if let Some(w) = yt {
                let _ = w.hide();
            }
            if let Some(w) = spotify {
                let _ = w.set_position(tauri::LogicalPosition::new(0.0, 58.0));
                let _ = w.set_size(tauri::LogicalSize::new(child_w, child_h));
                let _ = w.show();
            }
        }
        "downloads-view" | "downloads" => {
            if let Some(w) = yt {
                let _ = w.hide();
            }
            if let Some(w) = spotify {
                let _ = w.hide();
            }
        }
        _ => {}
    }
}

#[tauri::command]
fn switch_tab(app: AppHandle, tab: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        if let Some(window) = app.get_window("main") {
            let win = window.clone();
            let tab_clone = tab.clone();
            let _ = app.run_on_main_thread(move || {
                update_linux_layout(&win, &tab_clone);
            });
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        update_cross_platform_layout(&app, &tab);
    }

    Ok(())
}

#[tauri::command]
fn set_modal_state(app: AppHandle, open: bool, current_tab: Option<String>) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let prev = IS_MODAL_ACTIVE.swap(open, Ordering::SeqCst);
        if prev == open {
            return Ok(());
        }

        if let Some(window) = app.get_window("main") {
            let win = window.clone();
            let tab = current_tab.unwrap_or_else(|| {
                CURRENT_LINUX_TAB
                    .lock()
                    .map(|g| g.clone())
                    .unwrap_or_else(|p| p.into_inner().clone())
            });
            let _ = app.run_on_main_thread(move || {
                if let Ok(vbox) = win.default_vbox() {
                    let children = vbox.children();
                    if let Some(overlay_widget) = children.first() {
                        if let Ok(overlay) = overlay_widget.clone().downcast::<gtk::Overlay>() {
                            let overlay_children = overlay.children();
                            if overlay_children.len() >= 3 {
                                let yt_wv = &overlay_children[1];
                                let sp_wv = &overlay_children[2];
                                if open {
                                    yt_wv.hide();
                                    sp_wv.hide();
                                } else {
                                    match tab.as_str() {
                                        "yt-view" | "yt" => {
                                            yt_wv.show();
                                            sp_wv.hide();
                                        }
                                        "spotify-view" | "spotify" => {
                                            yt_wv.hide();
                                            sp_wv.show();
                                        }
                                        _ => {
                                            yt_wv.hide();
                                            sp_wv.hide();
                                        }
                                    }
                                }
                                overlay.queue_draw();
                            }
                        }
                    }
                }
            });
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        let yt = app.get_webview("yt-webview");
        let spotify = app.get_webview("spotify-webview");
        if open {
            if let Some(w) = yt {
                let _ = w.hide();
            }
            if let Some(w) = spotify {
                let _ = w.hide();
            }
        } else {
            let tab = current_tab.as_deref().unwrap_or("yt-view");
            update_cross_platform_layout(&app, tab);
        }
    }

    Ok(())
}

#[derive(Serialize)]
struct ShieldStats {
    #[serde(rename = "totalBlocked")]
    total_blocked: u64,
    #[serde(rename = "ytmBlocked")]
    ytm_blocked: u64,
    #[serde(rename = "spotifyBlocked")]
    spotify_blocked: u64,
}

#[tauri::command]
fn get_shield_stats() -> ShieldStats {
    ShieldStats {
        total_blocked: BLOCKED_ADS_COUNT.load(Ordering::Relaxed),
        ytm_blocked: YTM_BLOCKED_COUNT.load(Ordering::Relaxed),
        spotify_blocked: SPOTIFY_BLOCKED_COUNT.load(Ordering::Relaxed),
    }
}

#[tauri::command]
fn reset_shield_stats(app: AppHandle) -> ShieldStats {
    BLOCKED_ADS_COUNT.store(0, Ordering::Relaxed);
    YTM_BLOCKED_COUNT.store(0, Ordering::Relaxed);
    SPOTIFY_BLOCKED_COUNT.store(0, Ordering::Relaxed);
    let _ = app.emit("shield-update", serde_json::json!({ "count": 0 }));
    ShieldStats {
        total_blocked: 0,
        ytm_blocked: 0,
        spotify_blocked: 0,
    }
}

#[tauri::command]
fn record_ad_blocked(app: AppHandle, count: Option<u64>, source: Option<String>) -> Result<u64, String> {
    let inc = count.unwrap_or(1);
    let total = BLOCKED_ADS_COUNT.fetch_add(inc, Ordering::SeqCst) + inc;
    if let Some(src) = source {
        if src.contains("spotify") {
            SPOTIFY_BLOCKED_COUNT.fetch_add(inc, Ordering::Relaxed);
        } else {
            YTM_BLOCKED_COUNT.fetch_add(inc, Ordering::Relaxed);
        }
    } else {
        YTM_BLOCKED_COUNT.fetch_add(inc, Ordering::Relaxed);
    }
    let _ = app.emit("shield-update", serde_json::json!({ "count": total }));
    Ok(total)
}

fn is_ad_or_tracker_request(uri: &tauri::http::Uri) -> bool {
    let path_and_query = uri.path_and_query().map(|pq| pq.as_str()).unwrap_or("");
    let host = uri.host().unwrap_or("").to_lowercase();

    // Never block auth / account / Google login requests
    if host.contains("accounts.google.")
        || host.contains("accounts.youtube.")
        || host.contains("oauth")
        || (host.contains("spotify.com") && (path_and_query.contains("/login") || path_and_query.contains("/signup") || path_and_query.contains("/authorize")))
    {
        return false;
    }

    // Ping from webview-shields.js
    if host == "brave-shields.local" || path_and_query.starts_with("/__brave_shield_blocked__") {
        return true;
    }

    // Known ad & tracking networks
    host.contains("doubleclick.net")
        || host.contains("googleads")
        || host.contains("pagead")
        || host.contains("adnxs.com")
        || host.contains("scorecardresearch.com")
        || (host.contains("youtube.com") && (path_and_query.contains("/api/stats/ads") || path_and_query.contains("/pagead/")))
}

#[tauri::command]
fn eval_script(app: AppHandle, webview: String, script: String) -> Result<(), String> {
    if let Some(w) = app.get_webview(&webview) {
        let _ = w.eval(&script);
    }
    Ok(())
}

#[tauri::command]
fn reload_tab(app: AppHandle, tab: String) -> Result<(), String> {
    match tab.as_str() {
        "yt-view" | "yt" => {
            if let Some(yt) = app.get_webview("yt-webview") {
                let _ = yt.eval("window.location.reload()");
            }
        }
        "spotify-view" | "spotify" => {
            if let Some(sp) = app.get_webview("spotify-webview") {
                let _ = sp.eval("window.location.reload()");
            }
        }
        _ => {}
    }
    Ok(())
}

#[derive(serde::Deserialize)]
struct DownloadParams {
    url: String,
    #[serde(rename = "isPlaylist")]
    is_playlist: Option<bool>,
    #[serde(rename = "playlistName")]
    playlist_name: Option<String>,
    format: Option<String>,
}

#[derive(serde::Serialize, Clone)]
struct DownloadProgressData {
    #[serde(rename = "downloadId")]
    download_id: String,
    pct: u32,
    percent: u32,
    #[serde(rename = "itemIndex")]
    item_index: u32,
    #[serde(rename = "itemTotal")]
    item_total: u32,
    title: String,
    artist: String,
    speed: String,
    status: String,
    complete: bool,
    #[serde(rename = "trackSaved")]
    track_saved: Option<Value>,
}

fn parse_download_percentage(line: &str) -> Option<u32> {
    if let Some(idx) = line.find('%') {
        let before = &line[..idx];
        if let Some(space_idx) = before.rfind(|c: char| c.is_whitespace() || c == ']') {
            let num_str = before[space_idx + 1..].trim();
            if let Ok(f) = num_str.parse::<f32>() {
                return Some(f.round() as u32);
            }
        }
    }
    None
}

fn parse_download_speed(line: &str) -> Option<String> {
    if let Some(at_idx) = line.find(" at ") {
        let after_at = &line[at_idx + 4..];
        let parts: Vec<&str> = after_at.split_whitespace().collect();
        if let Some(speed_part) = parts.first() {
            return Some(speed_part.to_string());
        }
    }
    None
}

fn current_timestamp_str() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{secs}")
}

fn clean_track_metadata(raw_title: &str, raw_artist: &str) -> (String, String) {
    let mut title = raw_title.trim().to_string();
    let mut artist = raw_artist.trim().to_string();

    artist = artist
        .replace(" - Topic", "")
        .replace("- Topic", "")
        .replace("VEVO", "")
        .trim()
        .to_string();

    let noise_patterns = [
        "(Official Music Video)", "[Official Music Video]",
        "(Official Video)", "[Official Video]",
        "(Official Audio)", "[Official Audio]",
        "(Lyric Video)", "[Lyric Video]",
        "(Lyrics Video)", "[Lyrics Video]",
        "(Lyrics)", "[Lyrics]",
        "(Audio)", "[Audio]",
        "(Visualizer)", "[Visualizer]",
        "(Video)", "[Video]",
        "(HD)", "[HD]",
        "(4K)", "[4K]",
        "(Remastered)", "[Remastered]",
        "(Explicit)", "[Explicit]",
    ];

    for pattern in &noise_patterns {
        let pattern_lower = pattern.to_lowercase();
        while let Some(idx) = title.to_lowercase().find(&pattern_lower) {
            let end_idx = idx + pattern.len();
            title.replace_range(idx..end_idx, "");
            title = title.trim().to_string();
        }
    }

    if let Some(pipe_pos) = title.find('|') {
        let after_pipe = title[pipe_pos..].to_lowercase();
        if after_pipe.contains("official") || after_pipe.contains("audio") || after_pipe.contains("lyric") {
            title = title[..pipe_pos].trim().to_string();
        }
    }

    if artist.is_empty() || artist.eq_ignore_ascii_case("unknown") || artist.eq_ignore_ascii_case("na") {
        if let Some(dash_pos) = title.find(" - ") {
            artist = title[..dash_pos].trim().to_string();
            title = title[dash_pos + 3..].trim().to_string();
        } else {
            artist = "Unknown Artist".to_string();
        }
    }

    (title, artist)
}

fn percent_encode(s: &str) -> String {
    let mut encoded = String::new();
    for b in s.bytes() {
        match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(b as char);
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", b));
            }
        }
    }
    encoded
}

fn percent_decode(s: &str) -> Option<String> {
    let mut bytes = Vec::new();
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '%' {
            let h1 = chars.next()?;
            let h2 = chars.next()?;
            let byte = u8::from_str_radix(&format!("{h1}{h2}"), 16).ok()?;
            bytes.push(byte);
        } else if c == '+' {
            bytes.push(b' ');
        } else {
            let mut buf = [0u8; 4];
            let encoded = c.encode_utf8(&mut buf);
            bytes.extend_from_slice(encoded.as_bytes());
        }
    }
    String::from_utf8(bytes).ok()
}

fn start_local_streaming_server(app: AppHandle) {
    std::thread::spawn(move || {
        let listener = match std::net::TcpListener::bind("127.0.0.1:0") {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[StreamServer] Failed to bind local streaming server: {e}");
                return;
            }
        };

        let port = match listener.local_addr() {
            Ok(addr) => addr.port(),
            Err(e) => {
                eprintln!("[StreamServer] Failed to get local addr: {e}");
                return;
            }
        };

        STREAM_SERVER_PORT.store(port, Ordering::SeqCst);
        println!("[StreamServer] Local audio streaming server listening on 127.0.0.1:{port}");

        for stream in listener.incoming() {
            let mut stream = match stream {
                Ok(s) => s,
                Err(_) => continue,
            };

            let app_clone = app.clone();
            std::thread::spawn(move || {
                handle_stream_client(&app_clone, &mut stream);
            });
        }
    });
}

fn handle_stream_client(app: &AppHandle, stream: &mut std::net::TcpStream) {
    use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};

    let clone = match stream.try_clone() {
        Ok(c) => c,
        Err(_) => return,
    };
    let mut reader = BufReader::new(clone);
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).is_err() || request_line.is_empty() {
        return;
    }

    let mut range_header: Option<String> = None;
    let mut line = String::new();
    while reader.read_line(&mut line).is_ok() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            break;
        }
        if trimmed.to_ascii_lowercase().starts_with("range:") {
            range_header = Some(trimmed[6..].trim().to_string());
        }
        line.clear();
    }

    let parts: Vec<&str> = request_line.split_whitespace().collect();
    if parts.len() < 2 {
        let _ = stream.write_all(b"HTTP/1.1 400 Bad Request\r\n\r\n");
        return;
    }

    if parts[0] == "OPTIONS" {
        let _ = stream.write_all(
            b"HTTP/1.1 204 No Content\r\n\
              Access-Control-Allow-Origin: *\r\n\
              Access-Control-Allow-Methods: GET, OPTIONS\r\n\
              Access-Control-Allow-Headers: *\r\n\
              Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges\r\n\r\n",
        );
        return;
    }

    let is_head = parts[0] == "HEAD";
    if parts[0] != "GET" && !is_head {
        let _ = stream.write_all(b"HTTP/1.1 405 Method Not Allowed\r\n\r\n");
        return;
    }

    let raw_path = parts[1].trim_start_matches('/');
    let clean_path = raw_path.split('?').next().unwrap_or("");
    let filename = match percent_decode(clean_path) {
        Some(f) => f,
        None => clean_path.to_string(),
    };

    let file_path = match resolve_audio_file(app, &filename) {
        Some(p) => p,
        None => {
            let _ = stream.write_all(
                b"HTTP/1.1 404 Not Found\r\n\
                  Content-Type: text/plain\r\n\
                  Access-Control-Allow-Origin: *\r\n\
                  Access-Control-Allow-Headers: *\r\n\
                  Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges\r\n\r\n\
                  File Not Found",
            );
            return;
        }
    };

    let mut file = match fs::File::open(&file_path) {
        Ok(f) => f,
        Err(_) => {
            let _ = stream.write_all(
                b"HTTP/1.1 404 Not Found\r\n\
                  Content-Type: text/plain\r\n\
                  Access-Control-Allow-Origin: *\r\n\
                  Access-Control-Allow-Headers: *\r\n\
                  Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges\r\n\r\n\
                  File Not Found",
            );
            return;
        }
    };

    let total_len = match file.metadata() {
        Ok(m) => m.len(),
        Err(_) => return,
    };

    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let content_type = match ext.as_str() {
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "m4a" | "aac" => "audio/mp4",
        "ogg" | "opus" => "audio/ogg",
        "wav" => "audio/wav",
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        _ => "application/octet-stream",
    };

    if let Some(range_str) = range_header {
        if let Some(bytes_spec) = range_str.strip_prefix("bytes=") {
            let range_parts: Vec<&str> = bytes_spec.split('-').collect();
            let start: u64 = range_parts[0].parse().unwrap_or(0);
            let end: u64 = if range_parts.len() > 1 && !range_parts[1].is_empty() {
                range_parts[1].parse().unwrap_or(total_len.saturating_sub(1))
            } else {
                total_len.saturating_sub(1)
            };

            if start >= total_len || end >= total_len || start > end {
                let header = format!(
                    "HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */{}\r\nAccess-Control-Allow-Origin: *\r\n\r\n",
                    total_len
                );
                let _ = stream.write_all(header.as_bytes());
                return;
            }

            let chunk_size = end - start + 1;
            let response_headers = format!(
                "HTTP/1.1 206 Partial Content\r\n\
                 Accept-Ranges: bytes\r\n\
                 Content-Range: bytes {}-{}/{}\r\n\
                 Content-Length: {}\r\n\
                 Content-Type: {}\r\n\
                 Access-Control-Allow-Origin: *\r\n\
                 Access-Control-Allow-Headers: *\r\n\
                 Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges\r\n\
                 Connection: close\r\n\r\n",
                start, end, total_len, chunk_size, content_type
            );

            if stream.write_all(response_headers.as_bytes()).is_err() {
                return;
            }

            if is_head {
                return;
            }

            if file.seek(SeekFrom::Start(start)).is_err() {
                return;
            }

            let mut remaining = chunk_size;
            let mut buf = [0u8; 64 * 1024];
            while remaining > 0 {
                let to_read = std::cmp::min(remaining as usize, buf.len());
                let n = match file.read(&mut buf[..to_read]) {
                    Ok(0) => break,
                    Ok(n) => n,
                    Err(_) => break,
                };
                if stream.write_all(&buf[..n]).is_err() {
                    break;
                }
                remaining -= n as u64;
            }
            return;
        }
    }

    // 200 OK
    let response_headers = format!(
        "HTTP/1.1 200 OK\r\n\
         Accept-Ranges: bytes\r\n\
         Content-Length: {}\r\n\
         Content-Type: {}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Headers: *\r\n\
         Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges\r\n\
         Connection: close\r\n\r\n",
        total_len, content_type
    );

    if stream.write_all(response_headers.as_bytes()).is_err() {
        return;
    }

    if is_head {
        return;
    }

    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = match file.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => n,
            Err(_) => break,
        };
        if stream.write_all(&buf[..n]).is_err() {
            break;
        }
    }
}

#[tauri::command]
async fn start_download(app: AppHandle, params: DownloadParams) -> Result<Value, String> {
    let url = params.url.trim().to_string();
    if url.is_empty() {
        return Err("Download URL is required".to_string());
    }

    let download_id = format!("dl-{}", uuid::Uuid::new_v4());
    let id_clone = download_id.clone();
    let is_playlist = params.is_playlist.unwrap_or(false);
    let requested_format = params.format.unwrap_or_else(|| "audio-mp3".to_string());
    let target_playlist = params.playlist_name.unwrap_or_default();

    let downloads_dir = get_user_downloads_dir(&app);
    let _ = fs::create_dir_all(&downloads_dir);

    let app_handle = app.clone();
    let canceled_flag = Arc::new(AtomicBool::new(false));
    let canceled_clone = canceled_flag.clone();

    let res = tauri::async_runtime::spawn_blocking(move || -> Result<Value, String> {
        let _ = app_handle.emit("download-progress", DownloadProgressData {
            download_id: id_clone.clone(),
            pct: 5,
            percent: 5,
            item_index: 1,
            item_total: 1,
            title: "Resolving stream & audio metadata...".to_string(),
            artist: "Brave Music Downloader".to_string(),
            speed: "".to_string(),
            status: "Fetching stream information via yt-dlp...".to_string(),
            complete: false,
            track_saved: None,
        });

        let output_template = downloads_dir.join("%(title).100B [%(id)s].%(ext)s");
        let mut cmd = std::process::Command::new("yt-dlp");

        cmd.arg("--newline")
           .arg("--progress")
           .arg("--no-warnings")
           .arg("--continue");

        if requested_format.contains("video") {
            cmd.arg("-f").arg("mp4");
        } else if requested_format.contains("flac") {
            cmd.arg("-x").arg("--audio-format").arg("flac");
        } else if requested_format.contains("m4a") {
            cmd.arg("-x").arg("--audio-format").arg("m4a");
        } else {
            cmd.arg("-x").arg("--audio-format").arg("mp3");
        }

        if is_playlist {
            cmd.arg("--yes-playlist");
        } else {
            cmd.arg("--no-playlist");
        }

        cmd.arg("--output").arg(output_template.to_string_lossy().as_ref());
        cmd.arg("--print").arg("after_move:RECORD:%(filepath)s<DELIM>%(id)s<DELIM>%(title)s<DELIM>%(uploader)s<DELIM>%(duration)s<DELIM>%(thumbnail)s");
        cmd.arg(&url);

        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let err_msg = format!("Failed to launch yt-dlp: {e}");
                let _ = app_handle.emit("download-progress", DownloadProgressData {
                    download_id: id_clone.clone(),
                    pct: 0,
                    percent: 0,
                    item_index: 1,
                    item_total: 1,
                    title: "Download Failed".to_string(),
                    artist: "".to_string(),
                    speed: "".to_string(),
                    status: err_msg.clone(),
                    complete: true,
                    track_saved: None,
                });
                return Ok(serde_json::json!({
                    "success": false,
                    "downloadId": id_clone,
                    "error": err_msg
                }));
            }
        };

        let child_pid = child.id();
        {
            let mut map = ACTIVE_DOWNLOADS.lock().unwrap();
            map.insert(id_clone.clone(), ActiveDownloadProcess {
                pid: child_pid,
                canceled: canceled_clone.clone(),
            });
        }

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let mut downloaded_tracks = Vec::new();
        let mut stderr_lines = Vec::new();

        let stderr_thread = std::thread::spawn(move || {
            let mut lines = Vec::new();
            if let Some(err) = stderr {
                use std::io::{BufRead, BufReader};
                let reader = BufReader::new(err);
                for line in reader.lines().map_while(Result::ok) {
                    if !line.trim().is_empty() {
                        lines.push(line);
                    }
                }
            }
            lines
        });

        if let Some(out) = stdout {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(out);
            for line in reader.lines().map_while(Result::ok) {
                if canceled_clone.load(Ordering::SeqCst) {
                    break;
                }

                if let Some(record) = line.strip_prefix("RECORD:") {
                    let parts: Vec<&str> = record.split("<DELIM>").collect();
                    if parts.len() >= 4 {
                        let filepath = parts[0];
                        let original_id = parts.get(1).unwrap_or(&"");
                        let raw_title = parts.get(2).unwrap_or(&"Downloaded Track");
                        let raw_artist = parts.get(3).unwrap_or(&"Unknown Artist");
                        let duration_sec: u64 = parts.get(4).and_then(|d| d.parse().ok()).unwrap_or(180);
                        let thumbnail = parts.get(5).unwrap_or(&"");

                        let (clean_title, clean_artist) = clean_track_metadata(raw_title, raw_artist);

                        let path_obj = std::path::Path::new(filepath);
                        let filename = path_obj
                            .file_name()
                            .map(|f| f.to_string_lossy().to_string())
                            .unwrap_or_else(|| "track.mp3".to_string());

                        let size_bytes: u64 = fs::metadata(path_obj).map(|m| m.len()).unwrap_or(0);

                        let track_uuid = format!(
                            "track_{}_{}",
                            &uuid::Uuid::new_v4().to_string()[..8],
                            current_timestamp_str()
                        );

                        let new_track = serde_json::json!({
                            "id": track_uuid,
                            "originalId": original_id,
                            "title": clean_title,
                            "artist": clean_artist,
                            "album": if target_playlist.is_empty() { "Downloads".to_string() } else { target_playlist.clone() },
                            "duration": duration_sec,
                            "thumbnail": thumbnail,
                            "filename": filename,
                            "downloadUrl": url,
                            "addedAt": current_timestamp_str(),
                            "sizeBytes": size_bytes,
                            "playlist": if target_playlist.is_empty() { Value::Null } else { Value::String(target_playlist.clone()) }
                        });

                        if let Ok(mut doc) = read_library(&app_handle) {
                            doc.add_track(new_track.clone());
                            if !target_playlist.is_empty() {
                                let _ = doc.create_playlist(&target_playlist, None);
                                let _ = doc.add_track_to_playlist(
                                    &serde_json::Value::String(track_uuid.clone()),
                                    &target_playlist,
                                );
                            }
                            let _ = write_library(&app_handle, &doc);
                        }

                        downloaded_tracks.push(new_track.clone());

                        let _ = app_handle.emit("download-progress", DownloadProgressData {
                            download_id: id_clone.clone(),
                            pct: 95,
                            percent: 95,
                            item_index: downloaded_tracks.len() as u32,
                            item_total: downloaded_tracks.len() as u32,
                            title: clean_title,
                            artist: clean_artist,
                            speed: "".to_string(),
                            status: "Saved to offline library".to_string(),
                            complete: false,
                            track_saved: Some(new_track),
                        });
                        let _ = app_handle.emit("library-updated", serde_json::json!({ "status": "updated" }));
                    }
                } else if line.contains("[download]") && line.contains('%') {
                    let pct = parse_download_percentage(&line).unwrap_or(50);
                    let speed = parse_download_speed(&line).unwrap_or_default();
                    let _ = app_handle.emit("download-progress", DownloadProgressData {
                        download_id: id_clone.clone(),
                        pct,
                        percent: pct,
                        item_index: 1,
                        item_total: 1,
                        title: "Downloading...".to_string(),
                        artist: "".to_string(),
                        speed: speed.clone(),
                        status: if speed.is_empty() { format!("Downloading: {pct}%") } else { format!("Downloading: {pct}% • {speed}") },
                        complete: false,
                        track_saved: None,
                    });
                }
            }
        }

        let status = child.wait();
        if let Ok(err_lines) = stderr_thread.join() {
            stderr_lines = err_lines;
        }

        {
            let mut map = ACTIVE_DOWNLOADS.lock().unwrap();
            map.remove(&id_clone);
        }

        if canceled_clone.load(Ordering::SeqCst) {
            let _ = app_handle.emit("download-progress", DownloadProgressData {
                download_id: id_clone.clone(),
                pct: 0,
                percent: 0,
                item_index: 1,
                item_total: 1,
                title: "Download Canceled".to_string(),
                artist: "".to_string(),
                speed: "".to_string(),
                status: "Download canceled by user".to_string(),
                complete: true,
                track_saved: None,
            });
            return Ok(serde_json::json!({
                "success": false,
                "downloadId": id_clone,
                "canceled": true,
                "error": "Download canceled by user"
            }));
        }

        let is_success = status.map(|s| s.success()).unwrap_or(false);
        if !is_success {
            let raw_err = stderr_lines.join(" ");
            let user_msg = if raw_err.contains("matches filter !is_live") {
                "Live streams cannot be downloaded".to_string()
            } else if raw_err.contains("No space left on device") {
                "Storage full: Device ran out of disk space".to_string()
            } else if raw_err.contains("HTTP Error 403") || raw_err.contains("Sign in to confirm") {
                "Provider restricted stream. Try another format or URL.".to_string()
            } else if raw_err.contains("timed out") {
                "Connection timed out while downloading stream".to_string()
            } else if raw_err.contains("Video unavailable") || raw_err.contains("Private video") {
                "This video or track is unavailable or private".to_string()
            } else if let Some(pos) = raw_err.find("ERROR:") {
                raw_err[pos..].lines().next().unwrap_or("Download failed").to_string()
            } else if !raw_err.is_empty() {
                raw_err.lines().next().unwrap_or("Download process exited with error").to_string()
            } else {
                "Download process exited with non-zero status".to_string()
            };

            let _ = app_handle.emit("download-progress", DownloadProgressData {
                download_id: id_clone.clone(),
                pct: 0,
                percent: 0,
                item_index: 1,
                item_total: 1,
                title: "Download Error".to_string(),
                artist: "".to_string(),
                speed: "".to_string(),
                status: user_msg.clone(),
                complete: true,
                track_saved: None,
            });

            return Ok(serde_json::json!({
                "success": false,
                "downloadId": id_clone,
                "error": user_msg
            }));
        }

        if downloaded_tracks.is_empty() {
            let user_msg = "No downloadable media found at the provided URL".to_string();
            let _ = app_handle.emit("download-progress", DownloadProgressData {
                download_id: id_clone.clone(),
                pct: 0,
                percent: 0,
                item_index: 1,
                item_total: 1,
                title: "No Media Found".to_string(),
                artist: "".to_string(),
                speed: "".to_string(),
                status: user_msg.clone(),
                complete: true,
                track_saved: None,
            });
            return Ok(serde_json::json!({
                "success": false,
                "downloadId": id_clone,
                "error": user_msg
            }));
        }

        let track_count = downloaded_tracks.len() as u32;
        let _ = app_handle.emit("download-progress", DownloadProgressData {
            download_id: id_clone.clone(),
            pct: 100,
            percent: 100,
            item_index: track_count,
            item_total: track_count,
            title: "Download Complete".to_string(),
            artist: "".to_string(),
            speed: "".to_string(),
            status: "All tracks saved to offline library".to_string(),
            complete: true,
            track_saved: downloaded_tracks.last().cloned(),
        });
        let _ = app_handle.emit(
            "library-updated",
            serde_json::json!({ "status": "updated", "count": track_count }),
        );

        Ok(serde_json::json!({
            "success": true,
            "downloadId": id_clone,
            "count": track_count,
            "tracks": downloaded_tracks
        }))
    }).await.map_err(|e| e.to_string())?;

    res
}

#[tauri::command]
fn cancel_download(app: AppHandle, download_id: String) -> Result<Value, String> {
    let mut map = ACTIVE_DOWNLOADS.lock().unwrap();
    if let Some(proc) = map.remove(&download_id) {
        proc.canceled.store(true, Ordering::SeqCst);
        let pid = proc.pid;
        let _ = std::process::Command::new("kill")
            .arg("-TERM")
            .arg(pid.to_string())
            .status();

        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(1200));
            let _ = std::process::Command::new("kill")
                .arg("-KILL")
                .arg(pid.to_string())
                .status();
        });

        let _ = app.emit("download-progress", DownloadProgressData {
            download_id: download_id.clone(),
            pct: 0,
            percent: 0,
            item_index: 1,
            item_total: 1,
            title: "Download Canceled".to_string(),
            artist: "".to_string(),
            speed: "".to_string(),
            status: "Download canceled by user".to_string(),
            complete: true,
            track_saved: None,
        });
    }
    Ok(serde_json::json!({ "success": true, "downloadId": download_id }))
}

#[tauri::command]
fn open_provider(app: AppHandle, provider: String) -> Result<(), String> {
    let address = provider_url(&provider).map_err(str::to_owned)?;

    app.opener()
        .open_url(address, None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if !trimmed.starts_with("https://") && !trimmed.starts_with("mailto:") {
        return Err("Only secure https:// and mailto: URLs may be opened".to_owned());
    }
    app.opener()
        .open_url(trimmed, None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_folder(app: AppHandle) -> Result<(), String> {
    let target = get_user_downloads_dir(&app);
    if !target.exists() {
        let _ = fs::create_dir_all(&target);
    }
    app.opener()
        .open_path(target.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn show_in_folder(app: AppHandle, filename: String) -> Result<(), String> {
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("Invalid filename".to_owned());
    }
    let target = if let Some(resolved) = resolve_audio_file(&app, &filename) {
        resolved
    } else {
        get_user_downloads_dir(&app).join(&filename)
    };
    app.opener()
        .open_path(target.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn select_download_folder(app: AppHandle) -> Result<Value, String> {
    let folder = app.dialog().file().blocking_pick_folder();
    if let Some(path) = folder {
        let path_buf = path.into_path().map_err(|e| e.to_string())?;
        let path_str = path_buf.to_string_lossy().to_string();

        let home = std::env::var_os("HOME").map(PathBuf::from);
        if let Some(h) = home {
            let dir = h.join(".local/share/brave-music");
            let _ = fs::create_dir_all(&dir);
            let settings_path = dir.join("settings.json");
            let mut settings_json = if let Ok(bytes) = fs::read(&settings_path) {
                serde_json::from_slice::<Value>(&bytes).unwrap_or(serde_json::json!({}))
            } else {
                serde_json::json!({})
            };
            if let Some(obj) = settings_json.as_object_mut() {
                obj.insert("downloadsDir".to_string(), Value::String(path_str.clone()));
            }
            if let Ok(data) = serde_json::to_vec_pretty(&settings_json) {
                let _ = fs::write(&settings_path, data);
            }
        }

        Ok(serde_json::json!({
            "success": true,
            "downloadsDir": path_str
        }))
    } else {
        Ok(serde_json::json!({
            "success": false,
            "canceled": true
        }))
    }
}

#[tauri::command]
fn window_minimize(window: Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_maximize(window: Window) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn window_close(window: Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_app_version() -> &'static str {
    "1.0.19-r"
}

#[tauri::command]
fn get_stream_url(app: AppHandle, filename: String) -> Result<Value, String> {
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("Invalid filename".to_owned());
    }

    let _file_path = resolve_audio_file(&app, &filename)
        .ok_or_else(|| format!("Audio file '{filename}' not found on disk in downloads folder"))?;

    let port = STREAM_SERVER_PORT.load(Ordering::SeqCst);
    if port == 0 {
        return Err("Streaming server not initialized".to_owned());
    }

    let encoded = percent_encode(&filename);
    let url = format!("http://127.0.0.1:{port}/{encoded}");

    Ok(serde_json::json!({
        "success": true,
        "url": url,
        "port": port
    }))
}

fn provider_url(provider: &str) -> Result<&'static str, &'static str> {
    match provider {
        "youtube" => Ok("https://music.youtube.com/"),
        "spotify" => Ok("https://open.spotify.com/"),
        _ => Err("Unknown provider"),
    }
}

fn main() {
    #[cfg(target_os = "linux")]
    {
        if std::env::var("WEBKIT_FORCE_COMPOSITING_MODE").is_err() {
            std::env::set_var("WEBKIT_FORCE_COMPOSITING_MODE", "1");
        }
        if std::env::var("WEBKIT_DISABLE_COMPOSITING_MODE").is_err() {
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "0");
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .register_uri_scheme_protocol("brave-shields", move |ctx, _req| {
            let total = BLOCKED_ADS_COUNT.fetch_add(1, Ordering::SeqCst) + 1;
            let _ = ctx.app_handle().emit("shield-update", serde_json::json!({ "count": total }));
            tauri::http::Response::builder()
                .status(tauri::http::StatusCode::OK)
                .header("Content-Type", "image/gif")
                .header("Access-Control-Allow-Origin", "*")
                .body(Cow::Borrowed(&EMPTY_1PX_GIF[..]))
                .unwrap()
        })
        .setup(|app| {
            start_local_streaming_server(app.handle().clone());

            let window = match app.get_window("main") {
                Some(w) => w,
                None => return Ok(()),
            };

            let yt_url = match tauri::Url::parse("https://music.youtube.com/") {
                Ok(u) => u,
                Err(e) => {
                    eprintln!("[Tauri] Failed to parse YouTube Music URL: {e}");
                    return Ok(());
                }
            };

            let spotify_url = match tauri::Url::parse("https://open.spotify.com/") {
                Ok(u) => u,
                Err(e) => {
                    eprintln!("[Tauri] Failed to parse Spotify URL: {e}");
                    return Ok(());
                }
            };

            let size = window.inner_size().unwrap_or(tauri::PhysicalSize::new(1360, 840));
            let scale = window.scale_factor().unwrap_or(1.0);
            let logical_w = size.width as f64 / scale;
            let logical_h = size.height as f64 / scale;
            let child_w = logical_w;
            let child_h = (logical_h - 58.0).max(100.0);

            let app_handle_for_yt = app.handle().clone();
            let yt_builder = tauri::WebviewBuilder::new("yt-webview", tauri::WebviewUrl::External(yt_url))
                .user_agent(CHROME_USER_AGENT)
                .initialization_script(WINDOW_CHROME_POLYFILL_SCRIPT)
                .initialization_script(GUEST_ERROR_CAPTURE_SCRIPT)
                .initialization_script(SHIELDS_SCRIPT)
                .on_navigation(|_url| true)
                .on_new_window(|_url, _features| tauri::webview::NewWindowResponse::Allow)
                .on_web_resource_request(move |request, response| {
                    let uri = request.uri();
                    let path_and_query = uri.path_and_query().map(|pq| pq.as_str()).unwrap_or("");
                    if uri.host() == Some("brave-shields.local") || path_and_query.starts_with("/__brave_shield_blocked__") {
                        if path_and_query.contains("log_error") {
                            eprintln!("[Guest Webview Report] {}", percent_decode(path_and_query).unwrap_or_else(|| path_and_query.to_string()));
                        } else {
                            let total = BLOCKED_ADS_COUNT.fetch_add(1, Ordering::SeqCst) + 1;
                            YTM_BLOCKED_COUNT.fetch_add(1, Ordering::Relaxed);
                            let _ = app_handle_for_yt.emit("shield-update", serde_json::json!({ "count": total }));
                        }
                        *response.status_mut() = tauri::http::StatusCode::NO_CONTENT;
                        *response.body_mut() = Cow::Borrowed(b"");
                        return;
                    }
                    if is_ad_or_tracker_request(uri) {
                        let total = BLOCKED_ADS_COUNT.fetch_add(1, Ordering::SeqCst) + 1;
                        YTM_BLOCKED_COUNT.fetch_add(1, Ordering::Relaxed);
                        let _ = app_handle_for_yt.emit("shield-update", serde_json::json!({ "count": total }));
                        *response.status_mut() = tauri::http::StatusCode::NO_CONTENT;
                        *response.body_mut() = Cow::Borrowed(b"");
                    }
                });

            let app_handle_for_spotify = app.handle().clone();
            let spotify_builder = tauri::WebviewBuilder::new("spotify-webview", tauri::WebviewUrl::External(spotify_url))
                .user_agent(CHROME_USER_AGENT)
                .initialization_script(WINDOW_CHROME_POLYFILL_SCRIPT)
                .initialization_script(GUEST_ERROR_CAPTURE_SCRIPT)
                .initialization_script(SHIELDS_SCRIPT)
                .initialization_script(SPOTIFY_NAVBAR_FIX_SCRIPT)
                .on_navigation(|_url| true)
                .on_new_window(|_url, _features| tauri::webview::NewWindowResponse::Allow)
                .on_web_resource_request(move |request, response| {
                    let uri = request.uri();
                    let path_and_query = uri.path_and_query().map(|pq| pq.as_str()).unwrap_or("");
                    if uri.host() == Some("brave-shields.local") || path_and_query.starts_with("/__brave_shield_blocked__") {
                        if path_and_query.contains("log_error") {
                            eprintln!("[Spotify Webview Report] {}", percent_decode(path_and_query).unwrap_or_else(|| path_and_query.to_string()));
                        } else {
                            let total = BLOCKED_ADS_COUNT.fetch_add(1, Ordering::SeqCst) + 1;
                            SPOTIFY_BLOCKED_COUNT.fetch_add(1, Ordering::Relaxed);
                            let _ = app_handle_for_spotify.emit("shield-update", serde_json::json!({ "count": total }));
                        }
                        *response.status_mut() = tauri::http::StatusCode::NO_CONTENT;
                        *response.body_mut() = Cow::Borrowed(b"");
                        return;
                    }
                    if is_ad_or_tracker_request(uri) {
                        let total = BLOCKED_ADS_COUNT.fetch_add(1, Ordering::SeqCst) + 1;
                        SPOTIFY_BLOCKED_COUNT.fetch_add(1, Ordering::Relaxed);
                        let _ = app_handle_for_spotify.emit("shield-update", serde_json::json!({ "count": total }));
                        *response.status_mut() = tauri::http::StatusCode::NO_CONTENT;
                        *response.body_mut() = Cow::Borrowed(b"");
                    }
                });

            match window.add_child(
                yt_builder,
                tauri::LogicalPosition::new(0.0, 58.0),
                tauri::LogicalSize::new(child_w, child_h),
            ) {
                Ok(yt_wv) => {
                    eprintln!("[Tauri setup] yt-webview added successfully");
                    let _ = yt_wv.show();
                }
                Err(e) => {
                    eprintln!("[Tauri setup] Failed to add yt-webview: {e:?}");
                }
            }

            match window.add_child(
                spotify_builder,
                tauri::LogicalPosition::new(0.0, 58.0),
                tauri::LogicalSize::new(child_w, child_h),
            ) {
                Ok(sp_wv) => {
                    eprintln!("[Tauri setup] spotify-webview added successfully");
                    let _ = sp_wv.hide();
                }
                Err(e) => {
                    eprintln!("[Tauri setup] Failed to add spotify-webview: {e:?}");
                }
            }

            #[cfg(target_os = "linux")]
            {
                let win = window.clone();
                let _ = app.run_on_main_thread(move || {
                    setup_linux_overlay(&win);
                    update_linux_layout(&win, "yt-view");
                });
            }

            #[cfg(not(target_os = "linux"))]
            {
                let app_handle = window.app_handle().clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Resized(physical_size) = event {
                        let scale = app_handle
                            .get_window("main")
                            .and_then(|w| w.scale_factor().ok())
                            .unwrap_or(1.0);
                        let child_w = physical_size.width as f64 / scale;
                        let child_h = ((physical_size.height as f64 / scale) - 58.0).max(100.0);
                        if let Some(yt) = app_handle.get_webview("yt-webview") {
                            let _ = yt.set_position(tauri::LogicalPosition::new(0.0, 58.0));
                            let _ = yt.set_size(tauri::LogicalSize::new(child_w, child_h));
                        }
                        if let Some(sp) = app_handle.get_webview("spotify-webview") {
                            let _ = sp.set_position(tauri::LogicalPosition::new(0.0, 58.0));
                            let _ = sp.set_size(tauri::LogicalSize::new(child_w, child_h));
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            runtime_info,
            get_library,
            import_legacy_library,
            create_playlist,
            delete_playlist,
            set_playlist_cover,
            add_track_to_playlist,
            remove_track_from_playlist,
            delete_track,
            delete_tracks,
            switch_tab,
            set_modal_state,
            get_shield_stats,
            reset_shield_stats,
            record_ad_blocked,
            reload_tab,
            eval_script,
            start_download,
            cancel_download,
            open_provider,
            open_external,
            open_folder,
            show_in_folder,
            select_download_folder,
            window_minimize,
            window_maximize,
            window_close,
            get_app_version,
            get_stream_url
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Brave Music Linux preview");
}

#[cfg(test)]
mod tests {
    use super::{import_library_file, provider_url};
    use brave_music_core::library::LibraryDocument;
    use serde_json::json;
    use std::fs;

    #[test]
    fn maps_supported_providers_to_fixed_https_urls() {
        assert_eq!(provider_url("youtube"), Ok("https://music.youtube.com/"));
        assert_eq!(provider_url("spotify"), Ok("https://open.spotify.com/"));
    }

    #[test]
    fn rejects_arbitrary_urls_and_unknown_providers() {
        for input in [
            "https://attacker.example/",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "youtube?url=https://attacker.example/",
            "",
        ] {
            assert_eq!(provider_url(input), Err("Unknown provider"));
        }
    }

    #[test]
    fn core_library_model_keeps_unknown_legacy_fields() {
        let value = json!({
            "tracks": [{"id": "t1", "title": "Track", "pluginField": true}],
            "playlists": {"Mix": ["t1"]},
            "playlistCovers": {},
            "legacyFeature": {"enabled": true}
        });
        let mut document: LibraryDocument = serde_json::from_value(value.clone()).unwrap();
        document.create_playlist("New Mix", None).unwrap();
        let updated = serde_json::to_value(document).unwrap();

        assert_eq!(updated["tracks"][0]["pluginField"], true);
        assert_eq!(updated["legacyFeature"], value["legacyFeature"]);
        assert_eq!(updated["playlists"]["New Mix"], json!([]));
    }

    #[test]
    fn legacy_import_verifies_backup_and_leaves_source_unchanged() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("legacy/library.json");
        let target = directory.path().join("new-app/library.json");
        let backup = directory.path().join("backup/legacy-library.json");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        fs::write(
            &source,
            r#"{"tracks":[{"id":"t1","title":"Track"}],"playlists":{"Mix":["t1"]}}"#,
        )
        .unwrap();

        let imported = import_library_file(&source, &target, &backup).unwrap();
        assert_eq!(imported.tracks.len(), 1);
        assert_eq!(imported.tracks[0]["id"], "t1");
        assert!(target.exists());
        assert!(backup.exists());
        assert_eq!(
            fs::read_to_string(&source).unwrap(),
            fs::read_to_string(&backup).unwrap()
        );
    }
}
