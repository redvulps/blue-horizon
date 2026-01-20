use image::io::Reader as ImageReader;
use image::ImageFormat;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::error::AppError;
use crate::media::CachedImage;

#[tauri::command]
pub async fn save_image(app: AppHandle, source_path: String) -> Result<Option<String>, AppError> {
    let source = PathBuf::from(&source_path);

    if !source.exists() {
        return Err(AppError::InternalError(format!(
            "Source file not found: {}",
            source_path
        )));
    }

    let stem = source
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("image");
    let source_ext = source
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let is_gif = source_ext == "gif";
    let default_file_name = if is_gif {
        format!("{stem}.gif")
    } else {
        format!("{stem}.png")
    };

    let save_path = if is_gif {
        app.dialog()
            .file()
            .set_file_name(&default_file_name)
            .add_filter("GIF Image", &["gif"][..])
            .blocking_save_file()
    } else {
        app.dialog()
            .file()
            .set_file_name(&default_file_name)
            .add_filter("PNG Image", &["png"][..])
            .blocking_save_file()
    };

    if let Some(path) = save_path {
        let mut target_path = path
            .as_path()
            .ok_or_else(|| AppError::InternalError("Invalid save path".into()))?
            .to_path_buf();

        if is_gif {
            if target_path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("gif"))
                != Some(true)
            {
                target_path.set_extension("gif");
            }

            std::fs::copy(&source, &target_path)
                .map_err(|e| AppError::InternalError(format!("Failed to save GIF: {e}")))?;
        } else {
            if target_path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("png"))
                != Some(true)
            {
                target_path.set_extension("png");
            }

            let reader = ImageReader::open(&source).map_err(|e| {
                AppError::InternalError(format!("Failed to open source image: {e}"))
            })?;
            let reader = reader.with_guessed_format().map_err(|e| {
                AppError::InternalError(format!("Failed to detect source image format: {e}"))
            })?;
            let image = reader.decode().map_err(|e| {
                AppError::InternalError(format!("Failed to decode source image: {e}"))
            })?;

            image
                .save_with_format(&target_path, ImageFormat::Png)
                .map_err(|e| AppError::InternalError(format!("Failed to save PNG image: {e}")))?;
        }

        let saved_ext = if is_gif {
            "gif".to_string()
        } else {
            "png".to_string()
        };
        return Ok(Some(saved_ext));
    }

    Ok(None)
}

#[tauri::command]
pub async fn save_video(app: AppHandle, playlist_url: String) -> Result<(), AppError> {
    // Show save dialog first
    let save_path = app
        .dialog()
        .file()
        .set_file_name("video.mp4")
        .add_filter("Video", &["mp4"][..])
        .blocking_save_file();

    let Some(path) = save_path else {
        return Ok(()); // User cancelled
    };

    let target_path = path
        .as_path()
        .ok_or_else(|| AppError::InternalError("Invalid save path".into()))?
        .to_path_buf();

    // Fetch the HLS playlist
    let playlist_content = reqwest::get(&playlist_url)
        .await
        .map_err(|e| AppError::NetworkError(format!("Failed to fetch playlist: {}", e)))?
        .text()
        .await
        .map_err(|e| AppError::NetworkError(format!("Failed to read playlist: {}", e)))?;

    // Parse the playlist to find the highest quality stream
    let base_url = playlist_url
        .rsplit_once('/')
        .map(|(base, _)| base)
        .unwrap_or("");

    // Check if this is a master playlist (contains variant streams)
    let stream_url = if playlist_content.contains("#EXT-X-STREAM-INF") {
        // This is a master playlist, find the highest bandwidth variant
        let mut best_bandwidth = 0u64;
        let mut best_url = String::new();

        let lines: Vec<&str> = playlist_content.lines().collect();
        for (i, line) in lines.iter().enumerate() {
            if line.starts_with("#EXT-X-STREAM-INF") {
                if let Some(bw_str) = line.split("BANDWIDTH=").nth(1) {
                    if let Some(bw) = bw_str.split(',').next().and_then(|s| s.parse::<u64>().ok()) {
                        if bw > best_bandwidth {
                            best_bandwidth = bw;
                            if let Some(url) = lines.get(i + 1) {
                                best_url = if url.starts_with("http") {
                                    url.to_string()
                                } else {
                                    format!("{}/{}", base_url, url)
                                };
                            }
                        }
                    }
                }
            }
        }

        if best_url.is_empty() {
            return Err(AppError::InternalError(
                "No valid stream found in playlist".into(),
            ));
        }
        best_url
    } else {
        playlist_url.clone()
    };

    // Fetch the actual segment playlist
    let segment_playlist = reqwest::get(&stream_url)
        .await
        .map_err(|e| AppError::NetworkError(format!("Failed to fetch segment playlist: {}", e)))?
        .text()
        .await
        .map_err(|e| AppError::NetworkError(format!("Failed to read segment playlist: {}", e)))?;

    let segment_base_url = stream_url
        .rsplit_once('/')
        .map(|(base, _)| base)
        .unwrap_or(base_url);

    // Collect all segment URLs
    let mut segments: Vec<String> = Vec::new();
    for line in segment_playlist.lines() {
        if !line.starts_with('#') && !line.trim().is_empty() {
            let segment_url = if line.starts_with("http") {
                line.to_string()
            } else {
                format!("{}/{}", segment_base_url, line)
            };
            segments.push(segment_url);
        }
    }

    if segments.is_empty() {
        return Err(AppError::InternalError(
            "No segments found in playlist".into(),
        ));
    }

    // Download all segments and concatenate them
    let mut video_data: Vec<u8> = Vec::new();
    for segment_url in &segments {
        let segment_bytes = reqwest::get(segment_url)
            .await
            .map_err(|e| AppError::NetworkError(format!("Failed to fetch segment: {}", e)))?
            .bytes()
            .await
            .map_err(|e| AppError::NetworkError(format!("Failed to read segment: {}", e)))?;
        video_data.extend_from_slice(&segment_bytes);
    }

    // Write the concatenated video data to file
    tokio::fs::write(&target_path, &video_data)
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to save video: {}", e)))?;

    Ok(())
}

#[tauri::command]
pub async fn download_and_save_gif(app: AppHandle, url: String) -> Result<(), AppError> {
    // Download the GIF
    let bytes = reqwest::get(&url)
        .await
        .map_err(|e| AppError::NetworkError(format!("Failed to fetch GIF: {}", e)))?
        .bytes()
        .await
        .map_err(|e| AppError::NetworkError(format!("Failed to read GIF: {}", e)))?;

    // Show save dialog
    let save_path = app
        .dialog()
        .file()
        .set_file_name("animated.gif")
        .add_filter("GIF Images", &["gif"][..])
        .blocking_save_file();

    let Some(path) = save_path else {
        return Ok(()); // User cancelled
    };

    let target_path = path
        .as_path()
        .ok_or_else(|| AppError::InternalError("Invalid save path".into()))?
        .to_path_buf();

    // Write the GIF data to file
    tokio::fs::write(&target_path, &bytes)
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to save GIF: {}", e)))?;

    Ok(())
}

#[tauri::command]
pub async fn get_cached_image(
    app: AppHandle,
    source_url: String,
) -> Result<Option<CachedImage>, AppError> {
    Ok(crate::media::get_cached_image_by_source(&source_url, &app))
}
