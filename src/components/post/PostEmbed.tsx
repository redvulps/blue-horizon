import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import type {
  Embed,
  ImageEmbed,
  ExternalEmbed,
  VideoEmbed,
  RecordEmbed,
  RecordWithMediaEmbed,
  MediaReadyEvent,
} from "@/types/bluesky";
import { listen } from "@tauri-apps/api/event";
import { UserAvatar } from "@/components/user/UserAvatar";
import { cn } from "@/lib/utils";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { DownloadIcon } from "lucide-react";
import Hls from "hls.js";
import { useToastStore } from "@/stores/toastStore";

type EmbedImage = ImageEmbed["images"][number];

interface PostEmbedProps {
  embed: Embed;
  className?: string;
}

interface LightboxState {
  src: string;
  alt: string;
  sourcePath: string;
  isGif: boolean;
}

function ImageEmbedView({ embed }: { embed: ImageEmbed }) {
  const [images, setImages] = useState(embed.images);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const showToast = useToastStore((state) => state.showToast);

  // Keep local state aligned with upstream embed updates.
  useEffect(() => {
    setImages(embed.images);
  }, [embed.images]);

  const loadingSourceUrls = useMemo(
    () =>
      images
        .filter(
          (img): img is EmbedImage & { source_url: string } =>
            !!img.loading &&
            typeof img.source_url === "string" &&
            img.source_url.length > 0,
        )
        .map((img) => img.source_url),
    [images],
  );

  // Listen for media_ready events and reconcile missed events from backend cache.
  useEffect(() => {
    if (loadingSourceUrls.length === 0) return;
    let cancelled = false;

    const markImageReady = (sourceUrl: string, thumb: string, fullsize: string) => {
      setImages((prev) =>
        prev.map((img) =>
          img.source_url === sourceUrl
            ? { ...img, thumb, fullsize, loading: false }
            : img,
        ),
      );
    };

    const reconcileFromCache = async () => {
      await Promise.all(
        loadingSourceUrls.map(async (sourceUrl) => {
          try {
            const cached = await invoke<EmbedImage | null>("get_cached_image", {
              sourceUrl,
            });

            if (!cached || cancelled) return;
            setImages((prev) =>
              prev.map((img) =>
                img.source_url === sourceUrl
                  ? { ...img, ...cached, loading: false }
                  : img,
              ),
            );
          } catch (error) {
            console.error("Failed to reconcile cached image:", error);
          }
        }),
      );
    };

    const unlistenPromise = listen<MediaReadyEvent>("media_ready", (event) => {
      const { source_url, thumb, fullsize } = event.payload;
      if (!loadingSourceUrls.includes(source_url)) return;
      markImageReady(source_url, thumb, fullsize);
    });

    // Handle race where media_ready was emitted before this listener was registered.
    void reconcileFromCache();
    const retryTimer = window.setTimeout(() => {
      void reconcileFromCache();
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      void unlistenPromise.then((fn) => fn());
    };
  }, [loadingSourceUrls]);

  const resolveSrc = (url: string) => {
    if (url.startsWith("asset://")) {
      return url;
    }
    if (url.startsWith("file://")) {
      const path = url.slice(7); // Remove "file://"
      return convertFileSrc(path);
    }
    return url;
  };

  const extractPath = (url: string) => {
    if (url.startsWith("file://")) {
      return url.slice(7);
    }
    return url;
  };

  const handleImageClick = (e: React.MouseEvent, img: EmbedImage) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      const src = resolveSrc(img.fullsize);
      setLightbox({
        src,
        alt: img.alt || "Image",
        sourcePath: extractPath(img.fullsize),
        isGif: img.is_gif ?? false,
      });
    } catch (err) {
      console.error("Lightbox error:", err);
    }
  };

  const handleSaveImage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!lightbox) return;
    try {
      const savedExt = await invoke<string | null>("save_image", {
        sourcePath: lightbox.sourcePath,
      });
      if (savedExt) {
        showToast({
          title: `Saved as ${savedExt.toUpperCase()}`,
          variant: "success",
        });
      }
    } catch (err) {
      console.error("Save image error:", err);
      showToast({
        title: "Failed to save image",
        description: err instanceof Error ? err.message : undefined,
        variant: "error",
      });
    }
  };

  const gridClass =
    images.length === 1
      ? "grid-cols-1"
      : images.length === 2
        ? "grid-cols-2"
        : images.length === 3
          ? "grid-cols-2"
          : "grid-cols-2";

  return (
    <>
      <div className={cn("grid gap-1 rounded-lg overflow-hidden", gridClass)}>
        {images.map((img, index) => (
          <div key={index} className="relative">
            {img.loading ? (
              <div
                className={cn(
                  "w-full bg-muted animate-pulse flex items-center justify-center",
                  images.length === 1 ? "h-64" : "aspect-square",
                  images.length === 3 &&
                    index === 0 &&
                    "row-span-2 aspect-auto h-full min-h-64",
                )}
              >
                <div className="text-muted-foreground text-xs">Loading...</div>
              </div>
            ) : (
              <>
                <img
                  src={resolveSrc(img.thumb)}
                  alt={img.alt || "Image"}
                  onClick={(e) => handleImageClick(e, img)}
                  className={cn(
                    "w-full object-cover cursor-pointer hover:opacity-90 transition-opacity",
                    images.length === 1 ? "max-h-[500px]" : "aspect-square",
                    images.length === 3 && index === 0 && "row-span-2 aspect-auto h-full",
                  )}
                />
                {img.is_gif && (
                  <span className="absolute bottom-1 left-1 px-1.5 py-0.5 text-[10px] font-bold bg-black/60 text-white rounded">
                    GIF
                  </span>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {lightbox &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(null);
            }}
          >
            <div
              className="relative max-w-[90vw] max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={lightbox.src}
                alt={lightbox.alt}
                className="max-w-full max-h-[85vh] object-contain rounded-lg"
              />
              <button
                onClick={handleSaveImage}
                className="absolute bottom-4 right-4 p-2 rounded-full bg-black/70 text-white hover:bg-black/90 transition-colors"
              >
                <DownloadIcon className="size-5" />
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function ExternalEmbedView({ embed }: { embed: ExternalEmbed }) {
  const { external } = embed;
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

  // Detect if this is a GIF from Tenor or Giphy
  const isGifEmbed = (() => {
    try {
      const url = new URL(external.uri);
      const hostname = url.hostname.toLowerCase();
      return (
        hostname.includes("tenor.com") ||
        hostname.includes("giphy.com") ||
        hostname.includes("media.tenor.com") ||
        hostname.includes("media.giphy.com") ||
        external.uri.endsWith(".gif")
      );
    } catch {
      return false;
    }
  })();

  // For GIF embeds, display the actual GIF as an animated inline image
  if (isGifEmbed && external.uri) {
    const gifUrl = external.uri;

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setLightbox({ src: gifUrl, alt: external.title || "GIF" });
    };

    const handleDownload = async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      try {
        // Download the GIF and save via backend
        await invoke("download_and_save_gif", { url: gifUrl });
      } catch (err) {
        console.error("Save GIF error:", err);
      }
    };

    return (
      <>
        <div
          className="relative rounded-lg overflow-hidden cursor-pointer"
          onClick={handleClick}
        >
          <img
            src={gifUrl}
            alt={external.title || "GIF"}
            className="w-full max-h-[500px] object-contain bg-muted"
          />
          <span className="absolute bottom-2 left-2 px-1.5 py-0.5 text-[10px] font-bold bg-black/60 text-white rounded">
            GIF
          </span>
          <button
            onClick={handleDownload}
            className="absolute bottom-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
            title="Download GIF"
          >
            <DownloadIcon className="size-4" />
          </button>
        </div>

        {lightbox &&
          createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
              onClick={(e) => {
                e.stopPropagation();
                setLightbox(null);
              }}
            >
              <div
                className="relative max-w-[90vw] max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={lightbox.src}
                  alt={lightbox.alt}
                  className="max-w-full max-h-[85vh] object-contain rounded-lg"
                />
                <button
                  onClick={handleDownload}
                  className="absolute bottom-4 right-4 p-2 rounded-full bg-black/70 text-white hover:bg-black/90 transition-colors"
                  title="Download GIF"
                >
                  <DownloadIcon className="size-5" />
                </button>
              </div>
            </div>,
            document.body,
          )}
      </>
    );
  }

  // Regular external link card
  return (
    <a
      href={external.uri}
      target="_blank"
      rel="noopener noreferrer"
      className="block border rounded-lg overflow-hidden hover:bg-muted/50 transition-colors"
    >
      {external.thumb && (
        <img src={external.thumb} alt="" className="w-full h-32 object-cover" />
      )}
      <div className="p-3">
        <p className="font-medium text-sm line-clamp-2">{external.title}</p>
        <p className="text-muted-foreground text-xs line-clamp-2 mt-1">
          {external.description}
        </p>
        <p className="text-muted-foreground text-xs mt-2 truncate">
          {new URL(external.uri).hostname}
        </p>
      </div>
    </a>
  );
}

function RecordEmbedView({ embed }: { embed: RecordEmbed }) {
  const { record } = embed;
  const navigate = useNavigate();

  if (record.$type === "app.bsky.embed.record#viewNotFound") {
    return (
      <div className="border rounded-lg p-3 bg-muted/30">
        <p className="text-muted-foreground text-sm">Post not found</p>
      </div>
    );
  }

  if (record.$type === "app.bsky.embed.record#viewBlocked") {
    return (
      <div className="border rounded-lg p-3 bg-muted/30">
        <p className="text-muted-foreground text-sm">Blocked post</p>
      </div>
    );
  }

  // Build post path from AT URI
  const getPostPath = (uri: string) => {
    if (uri.startsWith("at://")) {
      return `/post/${uri.slice(5)}`;
    }
    return `/post/${uri}`;
  };

  const handlePostClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on the author link
    if ((e.target as HTMLElement).closest("a")) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    navigate(getPostPath(record.uri));
  };

  const handleAuthorClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/profile/${record.author.handle}`);
  };

  // ViewRecord
  return (
    <div
      className="border rounded-lg p-3 hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={handlePostClick}
    >
      <div
        className="flex items-center gap-2 mb-2 hover:underline cursor-pointer w-fit"
        onClick={handleAuthorClick}
      >
        <UserAvatar
          src={record.author.avatar}
          alt={record.author.displayName || record.author.handle}
          size="xs"
        />
        <span className="font-medium text-sm">
          {record.author.displayName || record.author.handle}
        </span>
        <span className="text-muted-foreground text-sm">@{record.author.handle}</span>
      </div>
      <p className="text-sm line-clamp-3">{record.value.text}</p>
      {/* Render nested embeds from the quoted post */}
      {record.embeds && record.embeds.length > 0 && (
        <div className="mt-2 space-y-2">
          {record.embeds.map((nestedEmbed, index) => (
            <div key={index}>
              {nestedEmbed.$type === "app.bsky.embed.images#view" && (
                <ImageEmbedView embed={nestedEmbed} />
              )}
              {nestedEmbed.$type === "app.bsky.embed.external#view" && (
                <ExternalEmbedView embed={nestedEmbed} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VideoEmbedView({ embed }: { embed: VideoEmbed }) {
  const { video } = embed;
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const hlsRef = React.useRef<Hls | null>(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !video.playlist) return;

    // Check if HLS is supported
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hlsRef.current = hls;
      hls.loadSource(video.playlist);
      hls.attachMedia(videoEl);
    } else if (videoEl.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari has native HLS support
      videoEl.src = video.playlist;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [video.playlist]);

  const handleContainerClick = (e: React.MouseEvent) => {
    // Stop propagation so clicking the video doesn't navigate to post detail
    e.stopPropagation();
    e.preventDefault();
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (video.playlist) {
      try {
        await invoke("save_video", { playlistUrl: video.playlist });
      } catch (err) {
        console.error("Save video error:", err);
      }
    }
  };

  const aspectRatio = video.aspect_ratio
    ? `${video.aspect_ratio.width} / ${video.aspect_ratio.height}`
    : "16 / 9";

  return (
    <div className="relative" onClick={handleContainerClick}>
      <video
        ref={videoRef}
        poster={video.thumbnail}
        loop
        controls
        playsInline
        className="w-full max-h-[500px] rounded-lg object-contain bg-black"
        style={{ aspectRatio }}
      >
        {video.alt && <track kind="captions" label={video.alt} />}
      </video>
      <button
        onClick={handleDownload}
        className="absolute bottom-4 right-4 p-2 rounded-full bg-black/70 text-white hover:bg-black/90 transition-colors"
        title="Open video in new tab"
      >
        <DownloadIcon className="size-5" />
      </button>
    </div>
  );
}

function RecordWithMediaEmbedView({ embed }: { embed: RecordWithMediaEmbed }) {
  // Create a proper RecordEmbed structure from the record data
  const recordEmbed: RecordEmbed = {
    $type: "app.bsky.embed.record#view",
    record: embed.record,
  };

  return (
    <div className="space-y-2">
      {embed.media.$type === "app.bsky.embed.images#view" && (
        <ImageEmbedView embed={embed.media} />
      )}
      {embed.media.$type === "app.bsky.embed.external#view" && (
        <ExternalEmbedView embed={embed.media} />
      )}
      <RecordEmbedView embed={recordEmbed} />
    </div>
  );
}

export function PostEmbed({ embed, className }: PostEmbedProps) {
  return (
    <div className={cn("mt-3", className)}>
      {embed.$type === "app.bsky.embed.images#view" && <ImageEmbedView embed={embed} />}
      {embed.$type === "app.bsky.embed.external#view" && (
        <ExternalEmbedView embed={embed} />
      )}
      {embed.$type === "app.bsky.embed.video#view" && <VideoEmbedView embed={embed} />}
      {embed.$type === "app.bsky.embed.record#view" && <RecordEmbedView embed={embed} />}
      {embed.$type === "app.bsky.embed.recordWithMedia#view" && (
        <RecordWithMediaEmbedView embed={embed} />
      )}
    </div>
  );
}
