/**
 * Bluesky/AT Protocol TypeScript types
 * Based on AT Protocol lexicons for app.bsky.*
 */

// -----------------
// Core Identifiers
// -----------------

/** Decentralized Identifier for user */
export type DID = string;

/** AT Protocol URI (at://...) */
export type AtUri = string;

/** Content ID (IPLD CID) */
export type CID = string;

/** User handle (e.g., alice.bsky.social) */
export type Handle = string;

// -----------------
// Author/Profile
// -----------------

export interface Author {
  did: DID;
  handle: Handle;
  displayName?: string;
  avatar?: string;
  description?: string;
  banner?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  indexedAt?: string;
  labels?: Label[];
}

export interface Label {
  src: DID;
  uri: AtUri;
  val: string;
  cts: string;
}

// -----------------
// Facets (Rich Text)
// -----------------

export interface ByteSlice {
  byteStart: number;
  byteEnd: number;
}

export interface FacetMention {
  $type: "app.bsky.richtext.facet#mention";
  did: DID;
}

export interface FacetLink {
  $type: "app.bsky.richtext.facet#link";
  uri: string;
}

export interface FacetTag {
  $type: "app.bsky.richtext.facet#tag";
  tag: string;
}

export type FacetFeature = FacetMention | FacetLink | FacetTag;

export interface Facet {
  index: ByteSlice;
  features: FacetFeature[];
}

// -----------------
// Embeds
// -----------------

export interface ImageEmbed {
  $type: "app.bsky.embed.images#view";
  images: {
    thumb: string;
    fullsize: string;
    alt: string;
    aspect_ratio?: { width: number; height: number };
    original_mime?: string;
    suggested_download?: string[];
    source_url?: string;
    /** Whether this image is still loading (placeholder with remote URL) */
    loading?: boolean;
    /** Whether this is an animated GIF */
    is_gif?: boolean;
  }[];
}

/** Event payload for media_ready event from backend */
export interface MediaReadyEvent {
  source_url: string;
  thumb: string;
  fullsize: string;
}

export interface ExternalEmbed {
  $type: "app.bsky.embed.external#view";
  external: {
    uri: string;
    title: string;
    description: string;
    thumb?: string;
  };
}

export type NestedEmbed = ImageEmbed | ExternalEmbed;

export interface RecordEmbed {
  $type: "app.bsky.embed.record#view";
  record:
    | {
        $type: "app.bsky.embed.record#viewRecord";
        uri: AtUri;
        cid: CID;
        author: Author;
        value: {
          text: string;
          createdAt: string;
        };
        indexedAt: string;
        embeds?: NestedEmbed[];
      }
    | {
        $type: "app.bsky.embed.record#viewNotFound";
        uri: AtUri;
      }
    | {
        $type: "app.bsky.embed.record#viewBlocked";
        uri: AtUri;
      };
}

export interface RecordWithMediaEmbed {
  $type: "app.bsky.embed.recordWithMedia#view";
  record: RecordEmbed["record"];
  media: ImageEmbed | ExternalEmbed;
}

export interface VideoEmbed {
  $type: "app.bsky.embed.video#view";
  video: {
    playlist: string;
    thumbnail?: string;
    alt?: string;
    aspect_ratio?: { width: number; height: number };
  };
}

export type Embed =
  | ImageEmbed
  | ExternalEmbed
  | VideoEmbed
  | RecordEmbed
  | RecordWithMediaEmbed;

// -----------------
// Post
// -----------------

export interface Post {
  uri: AtUri;
  cid: CID;
  author: Author;
  isRepost?: boolean;
  repostedByHandle?: Handle;
  repostedByDisplayName?: string;
  record: {
    $type: "app.bsky.feed.post";
    text: string;
    facets?: Facet[];
    createdAt: string;
    reply?: {
      root: { uri: AtUri; cid: CID };
      parent: { uri: AtUri; cid: CID };
    };
    embed?: unknown;
  };
  embed?: Embed;
  replyCount: number;
  repostCount: number;
  likeCount: number;
  quoteCount?: number;
  indexedAt: string;
  viewer?: {
    repost?: AtUri;
    like?: AtUri;
  };
  labels?: Label[];
}

export interface FeedViewPost {
  post: Post;
  reply?: {
    root: Post;
    parent: Post;
  };
  reason?: {
    $type: "app.bsky.feed.defs#reasonRepost";
    by: Author;
    indexedAt: string;
  };
}

// -----------------
// Timeline Response
// -----------------

export interface TimelineResponse {
  cursor?: string;
  feed: FeedViewPost[];
}
