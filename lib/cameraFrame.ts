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

// A frame much WIDER than the screen means the camera is sending a landscape
// picture to a portrait screen - the iPhone Duo's inner screen held upright
// does this (16:9 frame on a ~0.7 screen). Fit-whole-frame left a thin strip
// with huge bars, so fill instead. Normal phones (9:16 frame on a ~0.46
// screen, ratio ~1.2) stay well under this and keep showing the whole frame.
const LANDSCAPE_ON_PORTRAIT_RATIO = 1.6;

export function shouldFillPreview(
  videoWidth: number,
  videoHeight: number,
  viewWidth: number,
  viewHeight: number,
): boolean {
  if (videoWidth <= 0 || videoHeight <= 0 || viewWidth <= 0 || viewHeight <= 0) return false;
  const viewAspect = viewWidth / viewHeight;
  const videoAspect = videoWidth / videoHeight;
  if (viewAspect > videoAspect * FILL_TOLERANCE) return true;
  return videoAspect / viewAspect > LANDSCAPE_ON_PORTRAIT_RATIO;
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
    if (viewWidth / viewHeight > videoWidth / videoHeight) {
      // Screen wider than the frame: cover scales to the screen's width, so only
      // a band of the frame's height stays visible.
      sh = Math.min(videoHeight, videoWidth * (viewHeight / viewWidth));
    } else {
      // Frame much wider than the screen: cover scales to the screen's height,
      // so only a band of the frame's width stays visible.
      sw = Math.min(videoWidth, videoHeight * (viewWidth / viewHeight));
    }
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
