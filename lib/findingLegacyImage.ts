// A finding can carry its primary image in TWO places: as rows in the `photos`
// table, and mirrored onto its own `findings.image_url` column. The field /
// live-camera save path sets `findings.image_url` to the first photo's
// public_url (see app/field/page.tsx) so surfaces that read the column directly
// still show a thumbnail. The report builder and client report prefer the
// photos[] rows and only fall back to `image_url` when a finding has no photos.
//
// The bug this guards: deleting a photo from the photos table does NOT clear the
// mirrored `image_url`. Once the last/mirrored photo is gone, the client report
// and PDF fall back to `image_url` and the deleted photo keeps showing. This
// predicate lets a delete detect when the photo being removed IS the one the
// legacy column mirrors, so the caller can clear the column in the same step.
//
// It deliberately returns false when `image_url` points at a DIFFERENT image
// (a genuine legacy single-image finding) so that image is never erased.
export function legacyImageMirrorsPhoto(finding: any, photo: any): boolean {
  const legacyImageUrl = String(finding?.image_url || "").trim();
  if (!legacyImageUrl) return false;

  const deletedUrls = [photo?.public_url, photo?.image_url, photo?.publicUrl]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const deletedPath = String(
    photo?.file_path || photo?.storage_path || "",
  ).trim();

  return (
    deletedUrls.includes(legacyImageUrl) ||
    (Boolean(deletedPath) && legacyImageUrl.includes(deletedPath))
  );
}
