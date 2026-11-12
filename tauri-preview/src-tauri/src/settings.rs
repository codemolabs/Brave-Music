use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tempfile::NamedTempFile;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserSettings {
    #[serde(default)]
    pub downloads_dir: Option<PathBuf>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

pub fn load(path: &Path) -> Result<UserSettings, String> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|error| format!("Settings file is invalid JSON: {error}")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(UserSettings::default())
        }
        Err(error) => Err(format!("Could not read settings: {error}")),
    }
}

pub fn save_atomic(path: &Path, settings: &UserSettings) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Could not determine settings directory".to_owned())?;
    fs::create_dir_all(parent).map_err(|error| format!("Could not create settings directory: {error}"))?;

    let bytes = serde_json::to_vec_pretty(settings)
        .map_err(|error| format!("Could not serialize settings: {error}"))?;
    let mut temporary = NamedTempFile::new_in(parent)
        .map_err(|error| format!("Could not stage settings file: {error}"))?;
    use std::io::Write;
    temporary
        .write_all(&bytes)
        .and_then(|()| temporary.as_file().sync_all())
        .map_err(|error| format!("Could not write staged settings: {error}"))?;
    temporary
        .persist(path)
        .map_err(|error| format!("Could not replace settings file: {}", error.error))?;
    set_private_permissions(path).map_err(|error| format!("Could not secure settings file: {error}"))?;
    Ok(())
}

/// Read only the legacy `downloadsDir` preference. Other settings may include
/// provider account hints or future sensitive fields and are not migrated.
pub fn legacy_downloads_dir(legacy_data_dir: &Path) -> Option<PathBuf> {
    let settings_path = legacy_data_dir.join("settings.json");
    let bytes = fs::read(settings_path).ok()?;
    let value: Value = serde_json::from_slice(&bytes).ok()?;
    let candidate = value.get("downloadsDir")?.as_str()?;
    let path = PathBuf::from(candidate);
    if !path.is_absolute() || !path.is_dir() {
        return None;
    }
    path.canonicalize().ok()
}

#[cfg(unix)]
fn set_private_permissions(path: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let mut permissions = fs::metadata(path)?.permissions();
    permissions.set_mode(0o600);
    fs::set_permissions(path, permissions)
}

#[cfg(not(unix))]
fn set_private_permissions(_path: &Path) -> std::io::Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{legacy_downloads_dir, load, save_atomic, UserSettings};
    use serde_json::json;
    use std::fs;

    #[test]
    fn legacy_migration_reads_only_an_existing_absolute_downloads_directory() {
        let temp = tempfile::tempdir().unwrap();
        let legacy = temp.path().join("old-data");
        let downloads = temp.path().join("audio");
        fs::create_dir_all(&legacy).unwrap();
        fs::create_dir_all(&downloads).unwrap();
        fs::write(
            legacy.join("settings.json"),
            serde_json::to_vec(&json!({
                "downloadsDir": downloads,
                "spotifyRefreshToken": "never copy this field"
            }))
            .unwrap(),
        )
        .unwrap();

        assert_eq!(legacy_downloads_dir(&legacy), downloads.canonicalize().ok());
    }

    #[test]
    fn legacy_migration_ignores_missing_relative_and_non_directory_paths() {
        let temp = tempfile::tempdir().unwrap();
        let legacy = temp.path().join("old-data");
        fs::create_dir_all(&legacy).unwrap();
        let file = temp.path().join("file.mp3");
        fs::write(&file, b"audio").unwrap();

        for candidate in ["relative/downloads", file.to_str().unwrap()] {
            fs::write(
                legacy.join("settings.json"),
                serde_json::to_vec(&json!({ "downloadsDir": candidate })).unwrap(),
            )
            .unwrap();
            assert!(legacy_downloads_dir(&legacy).is_none());
        }
    }

    #[test]
    fn settings_save_is_atomic_round_trips_and_uses_private_permissions() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("app/settings.json");
        let settings = UserSettings {
            downloads_dir: Some(temp.path().to_path_buf()),
            extra: [("theme".to_owned(), json!("dark"))].into_iter().collect(),
        };

        save_atomic(&path, &settings).unwrap();
        let restored = load(&path).unwrap();
        assert_eq!(restored.downloads_dir, settings.downloads_dir);
        assert_eq!(restored.extra, settings.extra);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(fs::metadata(path).unwrap().permissions().mode() & 0o777, 0o600);
        }
    }
}
