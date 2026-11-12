use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// The compatible portion of the current `library.json` document.
///
/// Track objects and playlist values remain JSON values for now so fields from
/// older/newer app versions survive a Rust round trip without being discarded.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LibraryDocument {
    #[serde(default)]
    pub tracks: Vec<Value>,
    #[serde(default)]
    pub playlists: Map<String, Value>,
    #[serde(default, rename = "playlistCovers")]
    pub playlist_covers: Map<String, Value>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for LibraryDocument {
    fn default() -> Self {
        Self {
            tracks: Vec::new(),
            playlists: Map::new(),
            playlist_covers: Map::new(),
            extra: Map::new(),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum LibraryError {
    #[error("failed to read library file {path}: {source}")]
    Read {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("library file is not valid JSON: {0}")]
    InvalidJson(#[from] serde_json::Error),
    #[error("library root must be a JSON object")]
    InvalidRoot,
    #[error("failed to serialize library: {0}")]
    Serialize(#[source] serde_json::Error),
    #[error("failed to create temporary library file beside {path}: {source}")]
    CreateTemp {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to write temporary library file: {0}")]
    WriteTemp(#[source] std::io::Error),
    #[error("failed to atomically replace library file {path}: {source}")]
    Persist {
        path: String,
        #[source]
        source: std::io::Error,
    },
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum LibraryOperationError {
    #[error("playlist name cannot be empty")]
    EmptyPlaylistName,
    #[error("playlist was not found")]
    PlaylistNotFound,
    #[error("playlist data is not an array")]
    InvalidPlaylistData,
    #[error("track was not found")]
    TrackNotFound,
    #[error("built-in track is protected and cannot be deleted")]
    BuiltInTrackProtected,
    #[error("no track IDs were provided")]
    NoTrackIds,
    #[error("track ID cannot be empty")]
    InvalidTrackId,
}

#[derive(Debug, thiserror::Error)]
pub enum ManagedPathError {
    #[error("managed filename must be a single relative filename")]
    InvalidFilename,
    #[error("managed file does not exist: {0}")]
    Missing(#[source] std::io::Error),
    #[error("managed path resolves outside the downloads directory")]
    OutsideDownloads,
    #[error("managed path is not a regular file")]
    NotAFile,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PlaylistSnapshot {
    pub name: String,
    pub tracks: Value,
    pub cover: Option<Value>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct DeleteTracksResult {
    pub deleted_ids: Vec<Value>,
    /// Filenames for the platform adapter to delete only after the updated
    /// library document has been saved successfully.
    pub filenames: Vec<String>,
}

impl LibraryDocument {
    /// Read an explicitly supplied library path. A missing file means a new,
    /// empty library; malformed files return an error and are never replaced.
    pub fn load(path: &Path) -> Result<Self, LibraryError> {
        let bytes = match fs::read(path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Self::default());
            }
            Err(source) => {
                return Err(LibraryError::Read {
                    path: path.display().to_string(),
                    source,
                });
            }
        };

        Self::from_json_bytes(&bytes)
    }

    /// Parse one captured `library.json` byte snapshot. Importers can use this
    /// to ensure that the verified backup and imported document describe the
    /// same source revision even if the legacy app is still running.
    pub fn from_json_bytes(bytes: &[u8]) -> Result<Self, LibraryError> {
        let value: Value = serde_json::from_slice(bytes)?;
        let object = value.as_object().ok_or(LibraryError::InvalidRoot)?;
        let mut document: Self = serde_json::from_value(Value::Object(object.clone()))?;
        document.normalize_legacy_relationships();
        Ok(document)
    }

    /// Normalize two legacy invariants in memory. This does not write to disk.
    pub fn normalize_legacy_relationships(&mut self) {
        let built_in_ids: Vec<Value> = self
            .tracks
            .iter()
            .filter(|track| Self::is_built_in_track(track))
            .filter_map(|track| track.get("id").cloned())
            .collect();

        if !built_in_ids.is_empty() {
            for playlist in self.playlists.values_mut() {
                if let Some(track_ids) = playlist.as_array_mut() {
                    track_ids.retain(|id| !built_in_ids.iter().any(|built_in| built_in == id));
                }
            }
        }

        for track in &mut self.tracks {
            let Some(playlist_name) = track.get("playlist").and_then(Value::as_str) else {
                continue;
            };
            let playlist_name = playlist_name.to_owned();
            if self.playlists.contains_key(&playlist_name) {
                continue;
            }

            if track.get("album").and_then(Value::as_str) == Some(&playlist_name) {
                track["album"] = Value::String("Single".to_owned());
            }
            if let Some(track_object) = track.as_object_mut() {
                track_object.remove("playlist");
            }
        }
    }

    /// Resolve an existing managed download without allowing traversal,
    /// nested paths, absolute paths, or symlinks that escape the download root.
    pub fn resolve_managed_file(
        downloads_dir: &Path,
        filename: &str,
    ) -> Result<PathBuf, ManagedPathError> {
        let relative = Path::new(filename);
        let mut components = relative.components();
        if filename.is_empty()
            || filename.contains('/')
            || filename.contains('\\')
            || !matches!(components.next(), Some(Component::Normal(_)))
            || components.next().is_some()
        {
            return Err(ManagedPathError::InvalidFilename);
        }

        let root = downloads_dir
            .canonicalize()
            .map_err(ManagedPathError::Missing)?;
        let candidate = root.join(relative);
        let resolved = candidate
            .canonicalize()
            .map_err(ManagedPathError::Missing)?;
        if !resolved.starts_with(&root) || resolved.parent() != Some(root.as_path()) {
            return Err(ManagedPathError::OutsideDownloads);
        }
        if !resolved.is_file() {
            return Err(ManagedPathError::NotAFile);
        }
        Ok(resolved)
    }

    /// Create a playlist in memory. The caller decides when to persist.
    pub fn create_playlist(
        &mut self,
        name: &str,
        cover: Option<Value>,
    ) -> Result<PlaylistSnapshot, LibraryOperationError> {
        let name = name.trim();
        if name.is_empty() {
            return Err(LibraryOperationError::EmptyPlaylistName);
        }

        self.playlists
            .entry(name.to_owned())
            .or_insert_with(|| Value::Array(Vec::new()));

        if let Some(cover) = cover {
            let should_set_cover = self
                .playlist_covers
                .get(name)
                .and_then(Value::as_str)
                .is_none_or(|existing| existing.starts_with("linear-gradient"));
            if should_set_cover {
                self.playlist_covers.insert(name.to_owned(), cover);
            }
        }

        let tracks = self
            .playlists
            .get(name)
            .ok_or(LibraryOperationError::InvalidPlaylistData)?;
        if !tracks.is_array() {
            return Err(LibraryOperationError::InvalidPlaylistData);
        }

        Ok(PlaylistSnapshot {
            name: name.to_owned(),
            tracks: tracks.clone(),
            cover: self.playlist_covers.get(name).cloned(),
        })
    }

    /// Set a playlist cover, creating an empty playlist if needed.
    pub fn set_playlist_cover(
        &mut self,
        name: &str,
        cover: Value,
    ) -> Result<(), LibraryOperationError> {
        let name = name.trim();
        if name.is_empty() {
            return Err(LibraryOperationError::EmptyPlaylistName);
        }
        self.playlists
            .entry(name.to_owned())
            .or_insert_with(|| Value::Array(Vec::new()));
        self.playlist_covers.insert(name.to_owned(), cover);
        Ok(())
    }

    /// Add a track ID once. Built-in tracks cannot be added to custom lists.
    pub fn add_track_to_playlist(
        &mut self,
        track_id: &Value,
        playlist_name: &str,
    ) -> Result<bool, LibraryOperationError> {
        if playlist_name.is_empty() {
            return Err(LibraryOperationError::EmptyPlaylistName);
        }
        if track_id.is_null() {
            return Err(LibraryOperationError::InvalidTrackId);
        }
        if self
            .tracks
            .iter()
            .any(|track| track.get("id") == Some(track_id) && Self::is_built_in_track(track))
        {
            return Ok(false);
        }

        let playlist = self
            .playlists
            .entry(playlist_name.to_owned())
            .or_insert_with(|| Value::Array(Vec::new()));
        let track_ids = playlist
            .as_array_mut()
            .ok_or(LibraryOperationError::InvalidPlaylistData)?;
        if track_ids.iter().any(|existing| existing == track_id) {
            return Ok(false);
        }
        track_ids.push(track_id.clone());
        Ok(true)
    }

    /// Remove a track ID and clear its matching track-to-playlist metadata.
    pub fn remove_track_from_playlist(
        &mut self,
        track_id: &Value,
        playlist_name: &str,
    ) -> Result<(), LibraryOperationError> {
        let playlist = self
            .playlists
            .get_mut(playlist_name)
            .ok_or(LibraryOperationError::PlaylistNotFound)?;
        let track_ids = playlist
            .as_array_mut()
            .ok_or(LibraryOperationError::InvalidPlaylistData)?;
        track_ids.retain(|existing| existing != track_id);

        if let Some(track) = self
            .tracks
            .iter_mut()
            .find(|track| track.get("id") == Some(track_id))
        {
            let matches_playlist =
                track.get("playlist").and_then(Value::as_str) == Some(playlist_name);
            if matches_playlist && let Some(object) = track.as_object_mut() {
                object.remove("playlist");
            }
            let matches_album = track.get("album").and_then(Value::as_str) == Some(playlist_name);
            if matches_album {
                track["album"] = Value::String("Single".to_owned());
            }
        }
        Ok(())
    }

    /// Remove a track from the document and return its optional filename.
    /// This method never deletes a file; the platform adapter must first save
    /// the returned document, then apply the returned file effect safely.
    pub fn delete_track(
        &mut self,
        track_id: &Value,
    ) -> Result<Option<String>, LibraryOperationError> {
        let index = self
            .tracks
            .iter()
            .position(|track| track.get("id") == Some(track_id))
            .ok_or(LibraryOperationError::TrackNotFound)?;
        if Self::is_built_in_track(&self.tracks[index]) {
            return Err(LibraryOperationError::BuiltInTrackProtected);
        }

        let removed = self.tracks.remove(index);
        let filename = removed
            .get("filename")
            .and_then(Value::as_str)
            .map(str::to_owned);
        for playlist in self.playlists.values_mut() {
            if let Some(track_ids) = playlist.as_array_mut() {
                track_ids.retain(|id| id != track_id);
            }
        }
        Ok(filename)
    }

    /// Add or append a new track to the library document.
    pub fn add_track(&mut self, track: Value) {
        if let Some(id) = track.get("id") {
            if !self.tracks.iter().any(|t| t.get("id") == Some(id)) {
                self.tracks.push(track);
            }
        } else {
            self.tracks.push(track);
        }
    }

    /// Delete a set of tracks in memory, protecting built-in tracks and
    /// returning file effects for the platform adapter to apply after save.
    pub fn delete_tracks(
        &mut self,
        track_ids: &[Value],
    ) -> Result<DeleteTracksResult, LibraryOperationError> {
        if track_ids.is_empty() {
            return Err(LibraryOperationError::NoTrackIds);
        }

        let mut result = DeleteTracksResult::default();
        for track_id in track_ids {
            let Some(track) = self
                .tracks
                .iter()
                .find(|track| track.get("id") == Some(track_id))
            else {
                continue;
            };
            if Self::is_built_in_track(track) {
                continue;
            }
            if let Some(filename) = self.delete_track(track_id)? {
                result.filenames.push(filename);
            }
            result.deleted_ids.push(track_id.clone());
        }
        Ok(result)
    }

    /// Remove a playlist and return files to delete if requested. Built-in
    /// tracks remain protected even when deleting all playlist files.
    pub fn delete_playlist(
        &mut self,
        name: &str,
        delete_files: bool,
    ) -> Result<Vec<String>, LibraryOperationError> {
        let track_ids = if let Some(playlist) = self.playlists.get(name) {
            playlist
                .as_array()
                .ok_or(LibraryOperationError::InvalidPlaylistData)?
                .clone()
        } else if self.playlist_covers.contains_key(name)
            || self
                .tracks
                .iter()
                .any(|t| t.get("playlist").and_then(Value::as_str) == Some(name))
        {
            Vec::new()
        } else {
            return Err(LibraryOperationError::PlaylistNotFound);
        };
        let mut filenames = Vec::new();

        if delete_files && !track_ids.is_empty() {
            let result = self.delete_tracks(&track_ids)?;
            filenames = result.filenames;
        } else {
            for track in &mut self.tracks {
                if track.get("playlist").and_then(Value::as_str) == Some(name)
                    && let Some(object) = track.as_object_mut()
                {
                    object.remove("playlist");
                }
                if track.get("album").and_then(Value::as_str) == Some(name)
                    || track.get("album").and_then(Value::as_str) == Some("Downloaded Playlist")
                {
                    track["album"] = Value::String("Single".to_owned());
                }
            }
        }

        self.playlists.remove(name);
        self.playlist_covers.remove(name);
        self.normalize_legacy_relationships();
        Ok(filenames)
    }

    /// Persist only when explicitly called. The temporary file is created in
    /// the destination directory so replacement stays on the same filesystem.
    pub fn save_atomic(&self, path: &Path) -> Result<(), LibraryError> {
        let bytes = serde_json::to_vec_pretty(self).map_err(LibraryError::Serialize)?;
        let parent = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."));
        fs::create_dir_all(parent).map_err(|source| LibraryError::CreateTemp {
            path: path.display().to_string(),
            source,
        })?;

        let mut temporary =
            tempfile::NamedTempFile::new_in(parent).map_err(|source| LibraryError::CreateTemp {
                path: path.display().to_string(),
                source,
            })?;
        temporary
            .write_all(&bytes)
            .map_err(LibraryError::WriteTemp)?;
        temporary
            .as_file()
            .sync_all()
            .map_err(LibraryError::WriteTemp)?;
        temporary
            .persist(path)
            .map_err(|error| LibraryError::Persist {
                path: path.display().to_string(),
                source: error.error,
            })?;
        Ok(())
    }

    /// Persist a new library atomically without replacing a file created by
    /// another process after the caller's initial existence check.
    pub fn save_new_atomic(&self, path: &Path) -> Result<(), LibraryError> {
        let bytes = serde_json::to_vec_pretty(self).map_err(LibraryError::Serialize)?;
        let parent = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."));
        fs::create_dir_all(parent).map_err(|source| LibraryError::CreateTemp {
            path: path.display().to_string(),
            source,
        })?;

        let mut temporary =
            tempfile::NamedTempFile::new_in(parent).map_err(|source| LibraryError::CreateTemp {
                path: path.display().to_string(),
                source,
            })?;
        temporary
            .write_all(&bytes)
            .map_err(LibraryError::WriteTemp)?;
        temporary
            .as_file()
            .sync_all()
            .map_err(LibraryError::WriteTemp)?;
        temporary
            .persist_noclobber(path)
            .map_err(|error| LibraryError::Persist {
                path: path.display().to_string(),
                source: error.error,
            })?;
        Ok(())
    }

    fn is_built_in_track(track: &Value) -> bool {
        if track.get("isBuiltIn").and_then(Value::as_bool) == Some(true) {
            return true;
        }
        track
            .get("title")
            .and_then(Value::as_str)
            .is_some_and(|title| title.to_lowercase().contains("never gonna give you up"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_library_is_empty_without_creating_a_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("library.json");

        let library = LibraryDocument::load(&path).unwrap();

        assert!(library.tracks.is_empty());
        assert!(library.playlists.is_empty());
        assert!(!path.exists());
    }

    #[test]
    fn malformed_library_is_reported_and_left_untouched() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("library.json");
        fs::write(&path, b"{broken").unwrap();

        assert!(matches!(
            LibraryDocument::load(&path),
            Err(LibraryError::InvalidJson(_))
        ));
        assert_eq!(fs::read(&path).unwrap(), b"{broken");
    }

    #[test]
    fn parse_snapshot_and_create_only_save_do_not_replace_existing_data() {
        let document = LibraryDocument::from_json_bytes(
            br#"{"tracks":[{"id":"snapshot"}],"playlists":{},"custom":42}"#,
        )
        .unwrap();
        assert_eq!(document.tracks[0]["id"], "snapshot");
        assert_eq!(document.extra.get("custom"), Some(&Value::from(42)));

        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("library.json");
        fs::write(&path, b"existing data").unwrap();
        assert!(document.save_new_atomic(&path).is_err());
        assert_eq!(fs::read(path).unwrap(), b"existing data");
    }

    #[test]
    fn normalization_removes_builtin_references_and_repairs_stale_playlist_names() {
        let json = r#"{
          "tracks": [
            {"id":"builtin","title":"Never Gonna Give You Up"},
            {"id":"normal","title":"Song","playlist":"Deleted","album":"Deleted"}
          ],
          "playlists": {"Mix":["builtin","normal"]},
          "playlistCovers": {}
        }"#;
        let library: Value = serde_json::from_str(json).unwrap();
        let mut library: LibraryDocument = serde_json::from_value(library).unwrap();

        library.normalize_legacy_relationships();

        assert_eq!(library.playlists["Mix"], serde_json::json!(["normal"]));
        assert_eq!(library.tracks[1]["album"], "Single");
        assert!(library.tracks[1].get("playlist").is_none());
    }

    #[test]
    fn round_trip_preserves_unknown_document_and_track_fields() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("library.json");
        let json = r#"{
          "futureRootField":{"enabled":true},
          "tracks":[{"id":"t1","title":"Song","futureTrackField":17}],
          "playlists":{"Road Trip":["t1"]},
          "playlistCovers":{"Road Trip":"cover.png"}
        }"#;
        fs::write(&path, json).unwrap();

        let library = LibraryDocument::load(&path).unwrap();
        library.save_atomic(&path).unwrap();
        let saved: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();

        assert_eq!(saved["futureRootField"]["enabled"], true);
        assert_eq!(saved["tracks"][0]["futureTrackField"], 17);
        assert_eq!(saved["playlists"]["Road Trip"][0], "t1");
        assert_eq!(saved["playlistCovers"]["Road Trip"], "cover.png");
    }

    #[test]
    fn playlist_create_and_add_are_idempotent_and_protect_builtin_tracks() {
        let mut library = LibraryDocument {
            tracks: vec![
                serde_json::json!({"id":"builtin","title":"Never Gonna Give You Up"}),
                serde_json::json!({"id":"song","title":"Song"}),
            ],
            ..LibraryDocument::default()
        };

        let snapshot = library
            .create_playlist("  Favorites  ", Some(Value::String("cover.png".into())))
            .unwrap();
        assert_eq!(snapshot.name, "Favorites");
        assert_eq!(snapshot.tracks, serde_json::json!([]));
        assert_eq!(snapshot.cover, Some(Value::String("cover.png".into())));
        assert!(
            !library
                .add_track_to_playlist(&serde_json::json!("builtin"), "Favorites")
                .unwrap()
        );
        assert!(
            library
                .add_track_to_playlist(&serde_json::json!("song"), "Favorites")
                .unwrap()
        );
        assert!(
            !library
                .add_track_to_playlist(&serde_json::json!("song"), "Favorites")
                .unwrap()
        );
        assert_eq!(library.playlists["Favorites"], serde_json::json!(["song"]));
    }

    #[test]
    fn removing_track_from_playlist_clears_matching_metadata() {
        let mut library: LibraryDocument = serde_json::from_value(serde_json::json!({
            "tracks":[{"id":"song","playlist":"Mix","album":"Mix"}],
            "playlists":{"Mix":["song"]}
        }))
        .unwrap();

        library
            .remove_track_from_playlist(&serde_json::json!("song"), "Mix")
            .unwrap();

        assert_eq!(library.playlists["Mix"], serde_json::json!([]));
        assert!(library.tracks[0].get("playlist").is_none());
        assert_eq!(library.tracks[0]["album"], "Single");
    }

    #[test]
    fn delete_track_returns_file_effect_without_deleting_file_and_protects_builtin() {
        let directory = tempfile::tempdir().unwrap();
        let audio_file = directory.path().join("song.m4a");
        fs::write(&audio_file, b"audio").unwrap();
        let mut library: LibraryDocument = serde_json::from_value(serde_json::json!({
            "tracks":[
                {"id":"builtin","title":"Never Gonna Give You Up"},
                {"id":"song","title":"Song","filename":"song.m4a"}
            ],
            "playlists":{"Mix":["builtin","song"]}
        }))
        .unwrap();

        assert_eq!(
            library.delete_track(&serde_json::json!("builtin")),
            Err(LibraryOperationError::BuiltInTrackProtected)
        );
        let filename = library.delete_track(&serde_json::json!("song")).unwrap();

        assert_eq!(filename.as_deref(), Some("song.m4a"));
        assert!(audio_file.exists());
        assert_eq!(library.playlists["Mix"], serde_json::json!(["builtin"]));
    }

    #[test]
    fn bulk_delete_skips_builtin_tracks_and_returns_deleted_ids_and_files() {
        let mut library: LibraryDocument = serde_json::from_value(serde_json::json!({
            "tracks":[
                {"id":"builtin","title":"Never Gonna Give You Up"},
                {"id":"song","filename":"song.m4a"}
            ],
            "playlists":{"Mix":["builtin","song"]}
        }))
        .unwrap();

        let result = library
            .delete_tracks(&[
                serde_json::json!("builtin"),
                serde_json::json!("song"),
                serde_json::json!("missing"),
            ])
            .unwrap();

        assert_eq!(result.deleted_ids, vec![serde_json::json!("song")]);
        assert_eq!(result.filenames, vec!["song.m4a"]);
        assert_eq!(library.tracks.len(), 1);
        assert_eq!(library.playlists["Mix"], serde_json::json!(["builtin"]));
    }

    #[test]
    fn deleting_playlist_without_files_preserves_tracks_and_cleans_references() {
        let mut library: LibraryDocument = serde_json::from_value(serde_json::json!({
            "tracks":[{"id":"song","playlist":"Mix","album":"Mix"}],
            "playlists":{"Mix":["song"]},
            "playlistCovers":{"Mix":"cover.png"}
        }))
        .unwrap();

        let filenames = library.delete_playlist("Mix", false).unwrap();

        assert!(filenames.is_empty());
        assert_eq!(library.tracks.len(), 1);
        assert!(library.tracks[0].get("playlist").is_none());
        assert_eq!(library.tracks[0]["album"], "Single");
        assert!(!library.playlists.contains_key("Mix"));
        assert!(!library.playlist_covers.contains_key("Mix"));
    }

    #[test]
    fn deleting_playlist_with_files_returns_only_non_builtin_file_effects() {
        let mut library: LibraryDocument = serde_json::from_value(serde_json::json!({
            "tracks":[
                {"id":"builtin","title":"Never Gonna Give You Up"},
                {"id":"song","filename":"song.m4a"}
            ],
            "playlists":{"Mix":["builtin","song"]}
        }))
        .unwrap();

        let filenames = library.delete_playlist("Mix", true).unwrap();

        assert_eq!(filenames, vec!["song.m4a"]);
        assert_eq!(library.tracks.len(), 1);
        assert_eq!(library.tracks[0]["id"], "builtin");
        assert!(library.tracks[0].get("playlist").is_none());
        assert!(!library.playlists.contains_key("Mix"));
    }

    #[test]
    fn managed_file_resolution_accepts_regular_files_under_download_root() {
        let directory = tempfile::tempdir().unwrap();
        let downloads = directory.path().join("downloads");
        fs::create_dir(&downloads).unwrap();
        fs::write(downloads.join("song.m4a"), b"audio").unwrap();

        let resolved = LibraryDocument::resolve_managed_file(&downloads, "song.m4a").unwrap();

        assert_eq!(resolved, downloads.join("song.m4a").canonicalize().unwrap());
    }

    #[test]
    fn managed_file_resolution_rejects_absolute_and_traversal_paths() {
        let directory = tempfile::tempdir().unwrap();
        let downloads = directory.path().join("downloads");
        fs::create_dir(&downloads).unwrap();

        for invalid in [
            "",
            "../outside.m4a",
            "nested/song.m4a",
            "/etc/passwd",
            "..\\outside.m4a",
        ] {
            assert!(matches!(
                LibraryDocument::resolve_managed_file(&downloads, invalid),
                Err(ManagedPathError::InvalidFilename)
            ));
        }
    }

    #[cfg(unix)]
    #[test]
    fn managed_file_resolution_rejects_symlinks_that_escape_download_root() {
        use std::os::unix::fs::symlink;

        let directory = tempfile::tempdir().unwrap();
        let downloads = directory.path().join("downloads");
        fs::create_dir(&downloads).unwrap();
        let outside_file = directory.path().join("outside.m4a");
        fs::write(&outside_file, b"private").unwrap();
        symlink(&outside_file, downloads.join("linked.m4a")).unwrap();

        assert!(matches!(
            LibraryDocument::resolve_managed_file(&downloads, "linked.m4a"),
            Err(ManagedPathError::OutsideDownloads)
        ));
    }

    #[test]
    fn add_track_appends_and_prevents_duplicate_id() {
        let mut document = LibraryDocument::default();
        let track1 = serde_json::json!({
            "id": "t-1",
            "title": "First Song",
            "artist": "Artist A"
        });
        document.add_track(track1.clone());
        assert_eq!(document.tracks.len(), 1);

        // Duplicate addition should be ignored
        document.add_track(track1);
        assert_eq!(document.tracks.len(), 1);

        let track2 = serde_json::json!({
            "id": "t-2",
            "title": "Second Song",
            "artist": "Artist B"
        });
        document.add_track(track2);
        assert_eq!(document.tracks.len(), 2);
    }
}
