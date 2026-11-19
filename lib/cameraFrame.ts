// Live camera framing: which part of the video frame is visible on screen, so
// the saved photo matches the preview exactly.
//
// The camera stream is usually a tall 9:16 frame. On a normal phone the screen
// is even taller, so the whole frame fits ("contain") and nothing is cropped.
// On a screen that is WIDER than the frame (folded iPhone Duo, Duo inner screen,
// iPads) "contain" leaves black bars at the sides, so we fill the screen instead
// ("cover"), which hides some of the top and bottom of the frame. The capture
// then crops to that same visible area.

export type CaptureSourceRect = {
  /** Fill the screen (object-fit: cover) instead of fitting the whole frame. */
  fill: boolean;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

// Ignore aspect differences under 1% so a near-match never flips to cover and
// shaves a sliver off the photo.
const FILL_TOLERANCE = 1.01;

export function shouldFillPreview(
  videoWidth: number,
  videoHeight: number,
  viewWidth: number,
  viewHeight: number,
): boolean {
  if (videoWidth <= 0 || videoHeight <= 0 || viewWidth <= 0 || viewHeight <= 0) return false;
  return viewWidth / viewHeight > (videoWidth / videoHeight) * FILL_TOLERANCE;
}

/**
 * Source rectangle (in video pixels) to draw into the saved photo: the part of
 * the frame visible on screen, then narrowed further by software zoom (which
 * scales the preview about its centre).
 */
export function captureSourceRect(
  videoWidth: number,
  videoHeight: number,
  viewWidth: number,
  viewHeight: number,
  zoom = 1,
): CaptureSourceRect {
  const fill = shouldFillPreview(videoWidth, videoHeight, viewWidth, viewHeight);

  let sw = videoWidth;
  let sh = videoHeight;
  if (fill) {
    // Cover scales the frame to the screen's width; only a band of the frame's
    // height, in the screen's aspect ratio, stays visible.
    sh = Math.min(videoHeight, videoWidth * (viewHeight / viewWidth));
  }

  const z = zoom > 1 ? zoom : 1;
  sw /= z;
  sh /= z;

  return {
    fill,
    sx: (videoWidth - sw) / 2,
    sy: (videoHeight - sh) / 2,
    sw,
    sh,
  };
}
