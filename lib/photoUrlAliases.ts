// The report builder page used to put every photo's signed URL on the photo
// object under 4-6 different keys (signed_url, signedUrl, signed_video_url,
// signedVideoUrl, signed_thumbnail_url, signedThumbnailUrl) so every component
// could find it. Each signed URL is ~500 characters, so for a 95-photo report
// that was ~235 KB of the ~700 KB page. The server now sends only signed_url
// and signed_thumbnail_url, and the client components rebuild the aliases here.

export function withPhotoUrlAliases(photo: any): any {
  if (!photo || typeof photo !== "object") return photo;
  const full = photo.signed_url || photo.signedUrl || "";
  const thumb = photo.signed_thumbnail_url || photo.signedThumbnailUrl || "";
  return {
    ...photo,
    signed_url: full,
    signedUrl: photo.signedUrl || full,
    signed_video_url: photo.signed_video_url || full,
    signedVideoUrl: photo.signedVideoUrl || full,
    signed_thumbnail_url: thumb,
    signedThumbnailUrl: photo.signedThumbnailUrl || thumb,
  };
}

/** Rebuild aliases on every finding's photos in a grouped-findings array. */
export function groupedFindingsWithPhotoAliases(groups: any[] | null | undefined): any[] {
  return (groups || []).map((group) =>
    group && Array.isArray(group.findings)
      ? {
          ...group,
          findings: group.findings.map((finding: any) =>
            finding && Array.isArray(finding.photos)
              ? { ...finding, photos: finding.photos.map(withPhotoUrlAliases) }
              : finding,
          ),
        }
      : group,
  );
}
