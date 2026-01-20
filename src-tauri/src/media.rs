use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use bsky_sdk::api::app::bsky::feed::defs::PostView;
use image::codecs::webp::WebPEncoder;
use image::{imageops, ColorType};
use infer;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Semaphore;

use crate::error::AppError;

/// Maximum number of concurrent media downloads
const MAX_CONCURRENT_DOWNLOADS: usize = 4;

/// Global semaphore to limit concurrent downloads
static DOWNLOAD_SEMAPHORE: LazyLock<Semaphore> =
    LazyLock::new(|| Semaphore::new(MAX_CONCURRENT_DOWNLOADS));

#[derive(Serialize, Deserialize, Clone, Copy)]
pub struct AspectRatio {
    pub width: u32,
    pub height: u32,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CachedImage {
    pub thumb: String,
    pub fullsize: String,
    pub alt: String,
    pub aspect_ratio: Option<AspectRatio>,
    pub original_mime: Option<String>,
    pub suggested_download: Vec<String>,
    pub source_url: Option<String>,
    /// Whether this image is still loading (placeholder)
    #[serde(default)]
    pub loading: bool,
    /// Whether this is an animated GIF
    #[serde(default)]
    pub is_gif: bool,
}

/// Event payload emitted when media finishes downloading
#[derive(Serialize, Clone)]
pub struct MediaReadyEvent {
    /// The original remote URL used as key
    pub source_url: String,
    /// Local file:// URL for thumbnail
    pub thumb: String,
    /// Local file:// URL for fullsize
    pub fullsize: String,
}

#[derive(Serialize, Clone)]
pub struct ExternalView {
    pub uri: String,
    pub title: String,
    pub description: String,
    pub thumb: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct VideoView {
    pub playlist: String,
    pub thumbnail: Option<String>,
    pub alt: Option<String>,
    pub aspect_ratio: Option<AspectRatio>,
}

#[derive(Serialize)]
pub struct RecordViewAuthor {
    pub did: String,
    pub handle: String,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    pub avatar: Option<String>,
}

#[derive(Serialize)]
pub struct RecordViewValue {
    pub text: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

/// Embed type for nested embeds in viewRecord (non-recursive to avoid infinite types)
#[derive(Serialize, Clone)]
#[serde(tag = "$type")]
pub enum NestedEmbed {
    #[serde(rename = "app.bsky.embed.images#view")]
    Images { images: Vec<CachedImage> },
    #[serde(rename = "app.bsky.embed.external#view")]
    External { external: ExternalView },
}

#[derive(Serialize)]
#[serde(tag = "$type")]
pub enum RecordView {
    #[serde(rename = "app.bsky.embed.record#viewRecord")]
    ViewRecord {
        uri: String,
        cid: String,
        author: RecordViewAuthor,
        value: RecordViewValue,
        #[serde(rename = "indexedAt")]
        indexed_at: String,
        #[serde(skip_serializing_if = "Vec::is_empty")]
        embeds: Vec<NestedEmbed>,
    },
    #[serde(rename = "app.bsky.embed.record#viewNotFound")]
    ViewNotFound { uri: String },
    #[serde(rename = "app.bsky.embed.record#viewBlocked")]
    ViewBlocked { uri: String },
}

#[derive(Serialize)]
#[serde(tag = "$type")]
pub enum MediaView {
    #[serde(rename = "app.bsky.embed.images#view")]
    Images { images: Vec<CachedImage> },
    #[serde(rename = "app.bsky.embed.external#view")]
    External { external: ExternalView },
}

#[derive(Serialize)]
#[serde(tag = "$type")]
pub enum EmbedView {
    #[serde(rename = "app.bsky.embed.images#view")]
    Images { images: Vec<CachedImage> },
    #[serde(rename = "app.bsky.embed.external#view")]
    External { external: ExternalView },
    #[serde(rename = "app.bsky.embed.video#view")]
    Video { video: VideoView },
    #[serde(rename = "app.bsky.embed.record#view")]
    Record { record: RecordView },
    #[serde(rename = "app.bsky.embed.recordWithMedia#view")]
    RecordWithMedia {
        record: RecordView,
        media: MediaView,
    },
}

fn url_hash(url: &str) -> u64 {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    url.hash(&mut h);
    h.finish()
}

async fn cache_base_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let mut dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| AppError::InternalError(format!("cache dir not available: {e}")))?;
    dir.push("media");
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| AppError::InternalError(format!("cache dir create failed: {e}")))?;
    Ok(dir)
}

fn build_image_paths(base: &Path, key: u64, is_gif: bool) -> (PathBuf, PathBuf) {
    let mut thumb = base.to_path_buf();
    thumb.push(format!("{key}_thumb.webp")); // Thumb is always WebP (static preview)
    let mut full = base.to_path_buf();
    // GIFs keep their original format, others convert to WebP
    let ext = if is_gif { "gif" } else { "webp" };
    full.push(format!("{key}_full.{ext}"));
    (thumb, full)
}

fn build_meta_path(base: &Path, key: u64) -> PathBuf {
    let mut meta = base.to_path_buf();
    meta.push(format!("{key}_meta.json"));
    meta
}

fn as_file_url(path: &Path) -> String {
    format!("file://{}", path.display())
}

async fn cache_image(
    url: &str,
    app: &AppHandle,
    alt: Option<&str>,
    aspect_hint: Option<AspectRatio>,
) -> Result<CachedImage, AppError> {
    let cache_dir = cache_base_dir(app).await?;
    let key = url_hash(url);
    let meta_path = build_meta_path(&cache_dir, key);

    // Download image first to detect type
    let bytes = reqwest::get(url)
        .await
        .map_err(|e| AppError::NetworkError(format!("fetch image {url}: {e}")))?
        .bytes()
        .await
        .map_err(|e| AppError::NetworkError(format!("read image {url}: {e}")))?;

    // Detect if it's a GIF
    let is_gif = infer::get(&bytes)
        .map(|t| t.mime_type() == "image/gif")
        .unwrap_or(false);

    let (thumb_path, full_path) = build_image_paths(&cache_dir, key, is_gif);

    // Cache hit reuse (async file check)
    let thumb_exists = tokio::fs::try_exists(&thumb_path).await.unwrap_or(false);
    let full_exists = tokio::fs::try_exists(&full_path).await.unwrap_or(false);

    if thumb_exists && full_exists {
        if let Ok(meta_bytes) = tokio::fs::read(&meta_path).await {
            if let Ok(mut meta) = serde_json::from_slice::<CachedImage>(&meta_bytes) {
                meta.thumb = as_file_url(&thumb_path);
                meta.fullsize = as_file_url(&full_path);
                if let Some(hint) = aspect_hint {
                    meta.aspect_ratio = meta.aspect_ratio.or(Some(hint));
                }
                if let Some(alt_text) = alt {
                    meta.alt = alt_text.to_string();
                }
                meta.loading = false;
                let _ = tokio::fs::write(&meta_path, serde_json::to_vec(&meta).unwrap_or_default())
                    .await;
                return Ok(meta);
            }
        }
    }

    // Get dimensions
    let bytes_clone = bytes.clone();
    let (w, h) = tokio::task::spawn_blocking(move || -> Result<(u32, u32), AppError> {
        let img = image::load_from_memory(&bytes_clone)
            .map_err(|e| AppError::InternalError(format!("decode image: {e}")))?;
        Ok((img.width(), img.height()))
    })
    .await
    .map_err(|e| AppError::InternalError(format!("spawn_blocking failed: {e}")))??;

    // Process and save images in blocking thread pool
    let bytes_for_processing = bytes.clone();
    let thumb_path_clone = thumb_path.clone();
    let full_path_clone = full_path.clone();

    tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        let img = image::load_from_memory(&bytes_for_processing)
            .map_err(|e| AppError::InternalError(format!("decode image: {e}")))?;

        // Thumb: max width 512px, always WebP (static preview for GIFs)
        let thumb_img = if img.width() > 512 {
            img.resize(512, u32::MAX, imageops::FilterType::Triangle)
        } else {
            img.clone()
        };

        // Save thumb as WebP
        let mut thumb_file = std::fs::File::create(&thumb_path_clone)
            .map_err(|e| AppError::InternalError(format!("create thumb: {e}")))?;
        WebPEncoder::new_lossless(&mut thumb_file)
            .encode(
                thumb_img.to_rgba8().as_raw(),
                thumb_img.width(),
                thumb_img.height(),
                ColorType::Rgba8,
            )
            .map_err(|e| AppError::InternalError(format!("encode thumb: {e}")))?;

        if is_gif {
            // GIF: save original bytes directly
            std::fs::write(&full_path_clone, &bytes_for_processing)
                .map_err(|e| AppError::InternalError(format!("save gif: {e}")))?;
        } else {
            // Non-GIF: convert to WebP
            let mut full_file = std::fs::File::create(&full_path_clone)
                .map_err(|e| AppError::InternalError(format!("create full: {e}")))?;
            WebPEncoder::new_lossless(&mut full_file)
                .encode(
                    img.to_rgba8().as_raw(),
                    img.width(),
                    img.height(),
                    ColorType::Rgba8,
                )
                .map_err(|e| AppError::InternalError(format!("encode full: {e}")))?;
        }

        Ok(())
    })
    .await
    .map_err(|e| AppError::InternalError(format!("spawn_blocking failed: {e}")))??;

    let cached = CachedImage {
        thumb: as_file_url(&thumb_path),
        fullsize: as_file_url(&full_path),
        alt: alt.unwrap_or("Image").to_string(),
        aspect_ratio: aspect_hint.or(Some(AspectRatio {
            width: w,
            height: h,
        })),
        original_mime: infer::get(&bytes).map(|m| m.mime_type().to_string()),
        suggested_download: if is_gif {
            vec!["gif".to_string()]
        } else {
            vec!["png".to_string(), "webp".to_string()]
        },
        source_url: Some(url.to_string()),
        loading: false,
        is_gif,
    };

    let _ = tokio::fs::write(&meta_path, serde_json::to_vec(&cached).unwrap_or_default()).await;

    Ok(cached)
}

/// Check if an image is already cached (without downloading) - sync version for quick check
/// Tries both GIF and non-GIF paths since we can't know the type without downloading
fn check_cache_sync(
    url: &str,
    app: &AppHandle,
    alt: Option<&str>,
    aspect_hint: Option<AspectRatio>,
) -> Option<CachedImage> {
    let mut dir = app.path().app_cache_dir().ok()?;
    dir.push("media");
    let key = url_hash(url);
    let meta_path = build_meta_path(&dir, key);

    // Check metadata first to get is_gif flag
    if let Ok(meta_bytes) = std::fs::read(&meta_path) {
        if let Ok(mut meta) = serde_json::from_slice::<CachedImage>(&meta_bytes) {
            let (thumb_path, full_path) = build_image_paths(&dir, key, meta.is_gif);
            if thumb_path.exists() && full_path.exists() {
                meta.thumb = as_file_url(&thumb_path);
                meta.fullsize = as_file_url(&full_path);
                if let Some(hint) = aspect_hint {
                    meta.aspect_ratio = meta.aspect_ratio.or(Some(hint));
                }
                if let Some(alt_text) = alt {
                    meta.alt = alt_text.to_string();
                }
                meta.loading = false;
                return Some(meta);
            }
        }
    }
    None
}

/// Return cached image metadata for a source URL when present.
/// This is used by frontend reconciliation when an async media_ready event was missed.
pub fn get_cached_image_by_source(url: &str, app: &AppHandle) -> Option<CachedImage> {
    check_cache_sync(url, app, None, None)
}

/// Create a placeholder image entry with remote URLs (for async loading)
fn create_placeholder(
    url: &str,
    alt: Option<&str>,
    aspect_hint: Option<AspectRatio>,
) -> CachedImage {
    CachedImage {
        thumb: url.to_string(),
        fullsize: url.to_string(),
        alt: alt.unwrap_or("Image").to_string(),
        aspect_ratio: aspect_hint,
        original_mime: None,
        suggested_download: vec!["png".to_string()],
        source_url: Some(url.to_string()),
        loading: true,
        is_gif: false, // Unknown until downloaded, defaults to false
    }
}

/// Parse nested embeds from a viewRecord's embeds array
fn parse_nested_embeds(
    embeds_arr: Option<&Vec<serde_json::Value>>,
    app: &AppHandle,
) -> Vec<NestedEmbed> {
    let Some(arr) = embeds_arr else {
        return Vec::new();
    };

    let mut result = Vec::new();
    for embed_item in arr {
        let embed_type = embed_item
            .get("$type")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        match embed_type {
            "app.bsky.embed.images#view" => {
                if let Some(images_arr) = embed_item.get("images").and_then(|v| v.as_array()) {
                    let mut images = Vec::new();
                    for img in images_arr {
                        if let Some(full_url) = img.get("fullsize").and_then(|v| v.as_str()) {
                            let aspect_hint = img.get("aspectRatio").and_then(|ratio| {
                                let w = ratio.get("width").and_then(|v| v.as_u64())?;
                                let h = ratio.get("height").and_then(|v| v.as_u64())?;
                                Some(AspectRatio {
                                    width: w as u32,
                                    height: h as u32,
                                })
                            });
                            let alt = img.get("alt").and_then(|v| v.as_str());

                            if let Some(cached) = check_cache_sync(full_url, app, alt, aspect_hint)
                            {
                                images.push(cached);
                            } else {
                                images.push(create_placeholder(full_url, alt, aspect_hint));

                                // Spawn background download
                                let app_handle = app.clone();
                                let url_owned = full_url.to_string();
                                let alt_owned = alt.map(|s| s.to_string());
                                tauri::async_runtime::spawn(async move {
                                    let _permit = DOWNLOAD_SEMAPHORE.acquire().await;
                                    match cache_image(
                                        &url_owned,
                                        &app_handle,
                                        alt_owned.as_deref(),
                                        aspect_hint,
                                    )
                                    .await
                                    {
                                        Ok(cached) => {
                                            let event = MediaReadyEvent {
                                                source_url: url_owned,
                                                thumb: cached.thumb,
                                                fullsize: cached.fullsize,
                                            };
                                            let _ = app_handle.emit("media_ready", event);
                                        }
                                        Err(e) => {
                                            eprintln!("Background media download failed: {e}")
                                        }
                                    }
                                });
                            }
                        }
                    }
                    if !images.is_empty() {
                        result.push(NestedEmbed::Images { images });
                    }
                }
            }
            "app.bsky.embed.external#view" => {
                if let Some(external) = embed_item.get("external") {
                    result.push(NestedEmbed::External {
                        external: ExternalView {
                            uri: external
                                .get("uri")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            title: external
                                .get("title")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            description: external
                                .get("description")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            thumb: external
                                .get("thumb")
                                .and_then(|v| v.as_str())
                                .map(String::from),
                        },
                    });
                }
            }
            _ => {}
        }
    }
    result
}

/// Process post embed - returns immediately with cached or placeholder data.
/// Spawns background tasks to download uncached images and emits "media_ready" events.
pub async fn process_post_embed(
    post: &PostView,
    app: &AppHandle,
) -> Result<Option<EmbedView>, AppError> {
    let embed_value = serde_json::to_value(&post.embed)
        .map_err(|e| AppError::InternalError(format!("embed serialize error: {e}")))?;

    let embed_type = embed_value
        .get("$type")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    match embed_type {
        "app.bsky.embed.images#view" => {
            let images_val = embed_value
                .get("images")
                .and_then(|v| v.as_array())
                .ok_or_else(|| AppError::InternalError("images missing".into()))?;

            let mut images = Vec::new();
            for item in images_val {
                if let Some(full_url) = item.get("fullsize").and_then(|v| v.as_str()) {
                    let aspect_hint = item.get("aspectRatio").and_then(|ratio| {
                        let w_opt = ratio.get("width").and_then(|v| v.as_u64());
                        let h_opt = ratio.get("height").and_then(|v| v.as_u64());
                        match (w_opt, h_opt) {
                            (Some(w), Some(h)) => Some(AspectRatio {
                                width: w as u32,
                                height: h as u32,
                            }),
                            _ => None,
                        }
                    });

                    let alt = item.get("alt").and_then(|v| v.as_str());

                    // Check if already cached (quick sync check)
                    if let Some(cached) = check_cache_sync(full_url, app, alt, aspect_hint) {
                        images.push(cached);
                    } else {
                        // Return placeholder and spawn background download
                        let placeholder = create_placeholder(full_url, alt, aspect_hint);
                        images.push(placeholder);

                        // Spawn background task with semaphore-limited concurrency
                        let app_handle = app.clone();
                        let url_owned = full_url.to_string();
                        let alt_owned = alt.map(|s| s.to_string());
                        tauri::async_runtime::spawn(async move {
                            // Acquire semaphore permit (limits concurrent downloads)
                            let _permit = DOWNLOAD_SEMAPHORE.acquire().await;

                            match cache_image(
                                &url_owned,
                                &app_handle,
                                alt_owned.as_deref(),
                                aspect_hint,
                            )
                            .await
                            {
                                Ok(cached) => {
                                    let event = MediaReadyEvent {
                                        source_url: url_owned,
                                        thumb: cached.thumb,
                                        fullsize: cached.fullsize,
                                    };
                                    let _ = app_handle.emit("media_ready", event);
                                }
                                Err(e) => {
                                    eprintln!("Background media download failed: {e}");
                                }
                            }
                            // Permit is dropped here, allowing next download
                        });
                    }
                }
            }

            Ok(Some(EmbedView::Images { images }))
        }
        "app.bsky.embed.external#view" => {
            let external_val = embed_value
                .get("external")
                .ok_or_else(|| AppError::InternalError("external missing".into()))?;

            let external = ExternalView {
                uri: external_val
                    .get("uri")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                title: external_val
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                description: external_val
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                thumb: external_val
                    .get("thumb")
                    .and_then(|v| v.as_str())
                    .map(String::from),
            };

            Ok(Some(EmbedView::External { external }))
        }
        "app.bsky.embed.video#view" => {
            let aspect_hint = embed_value.get("aspectRatio").and_then(|ratio| {
                let w = ratio.get("width").and_then(|v| v.as_u64())?;
                let h = ratio.get("height").and_then(|v| v.as_u64())?;
                Some(AspectRatio {
                    width: w as u32,
                    height: h as u32,
                })
            });

            let video = VideoView {
                playlist: embed_value
                    .get("playlist")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                thumbnail: embed_value
                    .get("thumbnail")
                    .and_then(|v| v.as_str())
                    .map(String::from),
                alt: embed_value
                    .get("alt")
                    .and_then(|v| v.as_str())
                    .map(String::from),
                aspect_ratio: aspect_hint,
            };

            Ok(Some(EmbedView::Video { video }))
        }
        "app.bsky.embed.record#view" => {
            let record_val = embed_value
                .get("record")
                .ok_or_else(|| AppError::InternalError("record missing".into()))?;

            let record_type = record_val
                .get("$type")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            let record = match record_type {
                "app.bsky.embed.record#viewRecord" => {
                    let author_val = record_val.get("author");
                    let value_val = record_val.get("value");

                    RecordView::ViewRecord {
                        uri: record_val
                            .get("uri")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        cid: record_val
                            .get("cid")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        author: RecordViewAuthor {
                            did: author_val
                                .and_then(|a| a.get("did"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            handle: author_val
                                .and_then(|a| a.get("handle"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            display_name: author_val
                                .and_then(|a| a.get("displayName"))
                                .and_then(|v| v.as_str())
                                .map(String::from),
                            avatar: author_val
                                .and_then(|a| a.get("avatar"))
                                .and_then(|v| v.as_str())
                                .map(String::from),
                        },
                        value: RecordViewValue {
                            text: value_val
                                .and_then(|v| v.get("text"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            created_at: value_val
                                .and_then(|v| v.get("createdAt"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                        },
                        indexed_at: record_val
                            .get("indexedAt")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        embeds: parse_nested_embeds(
                            record_val.get("embeds").and_then(|v| v.as_array()),
                            app,
                        ),
                    }
                }
                "app.bsky.embed.record#viewNotFound" => RecordView::ViewNotFound {
                    uri: record_val
                        .get("uri")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                },
                "app.bsky.embed.record#viewBlocked" => RecordView::ViewBlocked {
                    uri: record_val
                        .get("uri")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                },
                _ => {
                    // Unknown record type, try to parse as viewRecord
                    return Ok(None);
                }
            };

            Ok(Some(EmbedView::Record { record }))
        }
        "app.bsky.embed.recordWithMedia#view" => {
            // Get the record part
            let record_val = embed_value
                .get("record")
                .and_then(|r| r.get("record"))
                .ok_or_else(|| AppError::InternalError("recordWithMedia record missing".into()))?;

            let record_type = record_val
                .get("$type")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            let record = match record_type {
                "app.bsky.embed.record#viewRecord" => {
                    let author_val = record_val.get("author");
                    let value_val = record_val.get("value");

                    RecordView::ViewRecord {
                        uri: record_val
                            .get("uri")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        cid: record_val
                            .get("cid")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        author: RecordViewAuthor {
                            did: author_val
                                .and_then(|a| a.get("did"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            handle: author_val
                                .and_then(|a| a.get("handle"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            display_name: author_val
                                .and_then(|a| a.get("displayName"))
                                .and_then(|v| v.as_str())
                                .map(String::from),
                            avatar: author_val
                                .and_then(|a| a.get("avatar"))
                                .and_then(|v| v.as_str())
                                .map(String::from),
                        },
                        value: RecordViewValue {
                            text: value_val
                                .and_then(|v| v.get("text"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            created_at: value_val
                                .and_then(|v| v.get("createdAt"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                        },
                        indexed_at: record_val
                            .get("indexedAt")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        embeds: parse_nested_embeds(
                            record_val.get("embeds").and_then(|v| v.as_array()),
                            app,
                        ),
                    }
                }
                "app.bsky.embed.record#viewNotFound" => RecordView::ViewNotFound {
                    uri: record_val
                        .get("uri")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                },
                "app.bsky.embed.record#viewBlocked" => RecordView::ViewBlocked {
                    uri: record_val
                        .get("uri")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                },
                _ => {
                    return Ok(None);
                }
            };

            // Get the media part
            let media_val = embed_value
                .get("media")
                .ok_or_else(|| AppError::InternalError("recordWithMedia media missing".into()))?;

            let media_type = media_val
                .get("$type")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            let media = match media_type {
                "app.bsky.embed.images#view" => {
                    let images_val = media_val
                        .get("images")
                        .and_then(|v| v.as_array())
                        .ok_or_else(|| AppError::InternalError("media images missing".into()))?;

                    let mut images = Vec::new();
                    for item in images_val {
                        if let Some(full_url) = item.get("fullsize").and_then(|v| v.as_str()) {
                            let aspect_hint = item.get("aspectRatio").and_then(|ratio| {
                                let w_opt = ratio.get("width").and_then(|v| v.as_u64());
                                let h_opt = ratio.get("height").and_then(|v| v.as_u64());
                                match (w_opt, h_opt) {
                                    (Some(w), Some(h)) => Some(AspectRatio {
                                        width: w as u32,
                                        height: h as u32,
                                    }),
                                    _ => None,
                                }
                            });

                            let alt = item.get("alt").and_then(|v| v.as_str());

                            if let Some(cached) = check_cache_sync(full_url, app, alt, aspect_hint)
                            {
                                images.push(cached);
                            } else {
                                let placeholder = create_placeholder(full_url, alt, aspect_hint);
                                images.push(placeholder);

                                let app_handle = app.clone();
                                let url_owned = full_url.to_string();
                                let alt_owned = alt.map(|s| s.to_string());
                                tauri::async_runtime::spawn(async move {
                                    let _permit = DOWNLOAD_SEMAPHORE.acquire().await;

                                    match cache_image(
                                        &url_owned,
                                        &app_handle,
                                        alt_owned.as_deref(),
                                        aspect_hint,
                                    )
                                    .await
                                    {
                                        Ok(cached) => {
                                            let event = MediaReadyEvent {
                                                source_url: url_owned,
                                                thumb: cached.thumb,
                                                fullsize: cached.fullsize,
                                            };
                                            let _ = app_handle.emit("media_ready", event);
                                        }
                                        Err(e) => {
                                            eprintln!("Background media download failed: {e}");
                                        }
                                    }
                                });
                            }
                        }
                    }
                    MediaView::Images { images }
                }
                "app.bsky.embed.external#view" => {
                    let external_val = media_val
                        .get("external")
                        .ok_or_else(|| AppError::InternalError("media external missing".into()))?;

                    MediaView::External {
                        external: ExternalView {
                            uri: external_val
                                .get("uri")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            title: external_val
                                .get("title")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            description: external_val
                                .get("description")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            thumb: external_val
                                .get("thumb")
                                .and_then(|v| v.as_str())
                                .map(String::from),
                        },
                    }
                }
                _ => {
                    return Ok(None);
                }
            };

            Ok(Some(EmbedView::RecordWithMedia { record, media }))
        }
        _ => Ok(None),
    }
}
