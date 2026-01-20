import { useMemo, Fragment } from "react";
import { Link } from "react-router-dom";
import type { Facet, FacetFeature } from "@/types/bluesky";
import { cn } from "@/lib/utils";

// AT Protocol handle regex based on specification
// Handles are valid domain names with ASCII letters, digits, and hyphens only
// Must have at least 2 segments separated by dots, max 253 chars total
// This is the exact regex from the AT Protocol specification
const HANDLE_REGEX =
  /@([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?![a-zA-Z0-9.-])/g;

interface RichTextProps {
  text: string;
  facets?: Facet[];
  className?: string;
}

interface Segment {
  text: string;
  feature?: FacetFeature;
}

/**
 * Detect @mentions in text and create synthetic facets for them
 * This handles cases where the backend doesn't provide facets (e.g., older posts)
 */
function detectMentions(text: string): { text: string; facets: Facet[] } {
  const facets: Facet[] = [];
  let match;

  // Reset regex lastIndex to ensure consistent behavior
  HANDLE_REGEX.lastIndex = 0;

  while ((match = HANDLE_REGEX.exec(text)) !== null) {
    const mention = match[0]; // Full match including @
    const handle = match[1]; // Handle without @
    const startByte = new TextEncoder().encode(text.substring(0, match.index)).length;
    const endByte = startByte + new TextEncoder().encode(mention).length;

    facets.push({
      index: {
        byteStart: startByte,
        byteEnd: endByte,
      },
      features: [
        {
          $type: "app.bsky.richtext.facet#mention",
          did: handle, // We'll use handle as placeholder, backend should resolve to actual DID
        },
      ],
    });
  }

  return { text, facets };
}

/**
 * Simple UTF-8 byte index to JS string index converter
 * AT Protocol uses byte offsets, JS uses UTF-16 code units
 */
function byteToCharIndex(text: string, byteIndex: number): number {
  const encoder = new TextEncoder();
  let byteCount = 0;
  let charIndex = 0;

  for (const char of text) {
    if (byteCount >= byteIndex) break;
    byteCount += encoder.encode(char).length;
    charIndex += char.length;
  }

  return charIndex;
}

function segmentText(text: string, facets?: Facet[]): Segment[] {
  // First, detect any @mentions that don't have facets
  const detectedMentions = detectMentions(text);

  // Merge existing facets with detected mentions
  const allFacets = [...(facets || []), ...detectedMentions.facets];

  if (allFacets.length === 0) {
    return [{ text }];
  }

  // Sort facets by start position
  const sortedFacets = allFacets.sort((a, b) => a.index.byteStart - b.index.byteStart);

  const segments: Segment[] = [];
  let lastIndex = 0;

  for (const facet of sortedFacets) {
    const startChar = byteToCharIndex(text, facet.index.byteStart);
    const endChar = byteToCharIndex(text, facet.index.byteEnd);

    // Add text before this facet
    if (startChar > lastIndex) {
      segments.push({ text: text.slice(lastIndex, startChar) });
    }

    // Add the faceted text
    segments.push({
      text: text.slice(startChar, endChar),
      feature: facet.features[0], // Use first feature
    });

    lastIndex = endChar;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }

  return segments;
}

function RichTextSegment({ segment }: { segment: Segment }) {
  const { text, feature } = segment;

  if (!feature) {
    return <>{text}</>;
  }

  switch (feature.$type) {
    case "app.bsky.richtext.facet#mention": {
      // Use DID if available, otherwise fall back to handle
      const profileId = feature.did;
      return (
        <Link to={`/profile/${profileId}`} className="text-primary hover:underline">
          {text}
        </Link>
      );
    }

    case "app.bsky.richtext.facet#link":
      return (
        <a
          href={feature.uri}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline break-all"
        >
          {text}
        </a>
      );

    case "app.bsky.richtext.facet#tag":
      return (
        <Link to={`/search?tag=${feature.tag}`} className="text-primary hover:underline">
          {text}
        </Link>
      );

    default:
      return <>{text}</>;
  }
}

export function RichText({ text, facets, className }: RichTextProps) {
  const segments = useMemo(() => segmentText(text, facets), [text, facets]);

  return (
    <p className={cn("whitespace-pre-wrap break-words", className)}>
      {segments.map((segment, index) => (
        <Fragment key={index}>
          <RichTextSegment segment={segment} />
        </Fragment>
      ))}
    </p>
  );
}
