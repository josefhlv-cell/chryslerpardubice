/**
 * Storage helpers for private bucket access.
 * All photo buckets are private — use signed URLs instead of public URLs.
 */
import { supabase } from "@/integrations/supabase/client";

const SIGNED_URL_EXPIRY = 3600; // 1 hour

/**
 * Extract storage path from a full Supabase public URL or return as-is if already a path.
 */
function extractPath(bucket: string, urlOrPath: string): string {
  if (!urlOrPath.includes("/storage/v1/")) return urlOrPath;
  const marker = `/object/public/${bucket}/`;
  const idx = urlOrPath.indexOf(marker);
  if (idx !== -1) return urlOrPath.slice(idx + marker.length);
  // Try authenticated marker
  const authMarker = `/object/${bucket}/`;
  const authIdx = urlOrPath.indexOf(authMarker);
  if (authIdx !== -1) return urlOrPath.slice(authIdx + authMarker.length);
  return urlOrPath;
}

/**
 * Get a signed URL for a file. Falls back to the original URL on error.
 */
export async function getSignedUrl(
  bucket: string,
  urlOrPath: string,
  expiresIn = SIGNED_URL_EXPIRY
): Promise<string> {
  try {
    const path = extractPath(bucket, urlOrPath);
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);
    if (error || !data?.signedUrl) return urlOrPath;
    return data.signedUrl;
  } catch {
    return urlOrPath;
  }
}

/**
 * Upload a file and return the storage path (NOT a public URL).
 */
export async function uploadAndGetPath(
  bucket: string,
  path: string,
  file: File
): Promise<{ path: string; error: Error | null }> {
  const { error } = await supabase.storage.from(bucket).upload(path, file);
  if (error) return { path: "", error };
  return { path, error: null };
}

/**
 * Batch resolve signed URLs for an array of URLs/paths.
 */
export async function getSignedUrls(
  bucket: string,
  urlsOrPaths: string[],
  expiresIn = SIGNED_URL_EXPIRY
): Promise<string[]> {
  if (!urlsOrPaths.length) return [];
  const paths = urlsOrPaths.map((u) => extractPath(bucket, u));
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, expiresIn);
  if (error || !data) return urlsOrPaths;
  return data.map((d, i) => d.signedUrl || urlsOrPaths[i]);
}
