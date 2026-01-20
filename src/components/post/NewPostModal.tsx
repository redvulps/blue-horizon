import { useState, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user/UserAvatar";
import { XIcon, ImageIcon, X, CaseSensitive } from "lucide-react";
import { cn, formatCount } from "@/lib/utils";
import { useAuthStore, selectSession } from "@/stores/authStore";
import { useProfile } from "@/hooks/useBluesky";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
import { PostEmbed } from "./PostEmbed";
import type { Embed } from "@/types/bluesky";
import { clearPostDraft, createPost, getPostDraft, savePostDraft } from "@/lib/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

interface NewPostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  replyTo?: {
    uri: string;
    cid: string;
    authorHandle: string;
    text: string;
    embed?: Embed;
  } | null;
  quotePost?: {
    uri: string;
    cid: string;
    authorHandle: string;
    text: string;
    embed?: Embed;
  } | null;
}

interface SelectedImage {
  path: string;
  preview: string;
  alt: string;
}

const MAX_CHARS = 300;

export function NewPostModal({
  open,
  onOpenChange,
  replyTo,
  quotePost,
}: NewPostModalProps) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [activeAltIndex, setActiveAltIndex] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDraftReady, setIsDraftReady] = useState(false);
  const session = useAuthStore(selectSession);
  const { data: profile } = useProfile(session?.handle || "");
  const queryClient = useQueryClient();

  const charCount = text.length;
  const isOverLimit = charCount > MAX_CHARS;
  const isEmpty = text.trim().length === 0 && images.length === 0;
  const canSubmit = !isOverLimit && !isEmpty && !isSubmitting;

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setIsDraftReady(false);

    const loadDraft = async () => {
      try {
        const draft = await getPostDraft(replyTo?.uri, quotePost?.uri);
        if (cancelled) return;

        if (draft) {
          setText(draft.text);
          setImages(
            draft.images.map((img) => ({
              path: img.path,
              preview: convertFileSrc(img.path),
              alt: img.alt,
            })),
          );
        } else {
          setText("");
          setImages([]);
        }
      } catch (error) {
        console.error("Failed to load post draft:", error);
      } finally {
        if (!cancelled) {
          setIsDraftReady(true);
        }
      }
    };

    loadDraft();

    return () => {
      cancelled = true;
    };
  }, [open, replyTo?.uri, quotePost?.uri]);

  useEffect(() => {
    if (!open || !isDraftReady || isSubmitting) return;

    const timer = setTimeout(() => {
      const persist = async () => {
        try {
          if (text.trim().length === 0 && images.length === 0) {
            await clearPostDraft(replyTo?.uri, quotePost?.uri);
            return;
          }

          await savePostDraft({
            text,
            replyTo: replyTo?.uri,
            quoteUri: quotePost?.uri,
            quoteCid: quotePost?.cid,
            images: images.map((img) => ({ path: img.path, alt: img.alt })),
          });
        } catch (error) {
          console.error("Failed to save post draft:", error);
        }
      };

      persist();
    }, 400);

    return () => clearTimeout(timer);
  }, [
    open,
    isDraftReady,
    isSubmitting,
    text,
    images,
    replyTo?.uri,
    quotePost?.uri,
    quotePost?.cid,
  ]);

  const handleSelectImage = useCallback(async () => {
    try {
      const path = await dialogOpen({
        multiple: true,
        directory: false,
        filters: [
          {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "gif", "webp", "heic"],
          },
        ],
      });

      if (path) {
        const paths = Array.isArray(path) ? path : [path];
        const newImages = paths.map((p) => ({
          path: p,
          preview: convertFileSrc(p),
          alt: "",
        }));
        setImages((prev) => [...prev, ...newImages].slice(0, 4));
      }
    } catch (error) {
      console.error("Failed to select image:", error);
    }
  }, []);

  const handleRemoveImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpdateAlt = useCallback((index: number, newAlt: string) => {
    setImages((prev) =>
      prev.map((img, i) => (i === index ? { ...img, alt: newAlt } : img)),
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !session) return;

    setIsSubmitting(true);
    try {
      await createPost({
        text,
        replyTo: replyTo?.uri,
        quoteUri: quotePost?.uri,
        quoteCid: quotePost?.cid,
        images: images.map((img) => ({ path: img.path, alt: img.alt })),
      });

      try {
        await clearPostDraft(replyTo?.uri, quotePost?.uri);
      } catch (error) {
        console.error("Failed to clear post draft after submit:", error);
      }
      setText("");
      setImages([]);
      onOpenChange(false);

      // Invalidate queries to refresh feeds
      queryClient.invalidateQueries({ queryKey: ["timeline-infinite"] });
      queryClient.invalidateQueries({ queryKey: ["author_feed"] });
    } catch (error) {
      console.error("Failed to create post:", error);
    } finally {
      setIsSubmitting(false);
    }
  }, [text, images, canSubmit, session, replyTo, quotePost, onOpenChange, queryClient]);

  const handleClose = useCallback(() => {
    setText("");
    setImages([]);
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        showCloseButton={false}
        onEscapeKeyDown={handleClose}
      >
        <div className="relative">
          <button
            onClick={handleClose}
            className="absolute top-0 right-0 p-2 rounded-full hover:bg-muted transition-colors"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="space-y-4 pr-8">
          {replyTo && (
            <div className="flex items-start gap-3 pb-3 border-b">
              <UserAvatar
                src={profile?.avatar}
                alt={profile?.display_name || session?.handle}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">
                  Replying to @{replyTo.authorHandle}
                </p>
                <p className="text-sm mt-1 line-clamp-3">{replyTo.text}</p>
              </div>
            </div>
          )}

          {quotePost && (
            <div className="flex items-start gap-3 pb-3 border-b bg-muted/30 p-2 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">
                  Quoting @{quotePost.authorHandle}
                </p>
                <p className="text-sm mt-1 line-clamp-3">{quotePost.text}</p>
                {quotePost.embed && (
                  <div className="mt-2 scale-90 origin-top-left">
                    <PostEmbed embed={quotePost.embed} className="mt-1" />
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <UserAvatar
              src={profile?.avatar}
              alt={profile?.display_name || session?.handle}
              size="md"
            />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                replyTo
                  ? "Write your reply..."
                  : quotePost
                    ? "Add a comment to your quote..."
                    : "What's happening?"
              }
              className="flex-1 min-h-[80px] resize-none border-0 bg-transparent text-base placeholder:text-muted-foreground focus:outline-none focus:ring-0 p-0"
              disabled={isSubmitting}
            />
          </div>

          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-2 pl-[52px]">
              {images.map((img, index) => (
                <div key={index} className="relative group rounded-lg overflow-hidden">
                  <img
                    src={img.preview}
                    alt={img.alt || `Upload ${index + 1}`}
                    className="w-full h-24 object-cover"
                  />
                  <div className="absolute top-1 right-1 flex gap-1">
                    <Popover
                      open={activeAltIndex === index}
                      onOpenChange={(open) => setActiveAltIndex(open ? index : null)}
                    >
                      <PopoverTrigger asChild>
                        <button
                          className={cn(
                            "p-1 rounded-full bg-black/50 text-white transition-opacity",
                            img.alt
                              ? "opacity-100 bg-blue-500/80"
                              : "opacity-0 group-hover:opacity-100",
                          )}
                          title="Add Alt Text"
                        >
                          <CaseSensitive className="size-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2">
                        <Input
                          placeholder="Describe this image for accessibility..."
                          value={img.alt}
                          onChange={(e) => handleUpdateAlt(index, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "Escape") {
                              e.preventDefault();
                              e.stopPropagation();
                              setActiveAltIndex(null);
                            }
                          }}
                          className="text-sm"
                        />
                      </PopoverContent>
                    </Popover>

                    <button
                      onClick={() => handleRemoveImage(index)}
                      className="p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleSelectImage}
            disabled={isSubmitting || images.length >= 4}
            title="Add image"
          >
            <ImageIcon className="size-4" />
          </Button>

          <div className="flex items-center gap-3">
            <span
              className={cn(
                "text-xs tabular-nums",
                isOverLimit ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {formatCount(charCount)} / {MAX_CHARS}
            </span>
            <Button onClick={handleSubmit} disabled={!canSubmit} size="sm">
              {replyTo ? "Reply" : quotePost ? "Post Quote" : "Post"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
