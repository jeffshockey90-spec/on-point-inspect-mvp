// What the background time-zone sync should save. It used to force the saved
// zone to the device's on every focus / every 15 min, silently reverting a zone
// the user deliberately picked in Settings → Time Preferences.
//
// Rule: if the saved zone currently matches the device zone we last recorded
// (or nothing was recorded), the user is "following the device" — keep
// following it (e.g. a traveling inspector). If they chose a different zone,
// keep their choice and only record the new device zone.
export function decideTimeZoneSync(
  current: { timeZone?: string | null; deviceTimeZone?: string | null },
  deviceTimeZone: string,
): { timeZone: string; deviceTimeZone: string; changed: boolean } {
  const saved = String(current.timeZone || "");
  const lastDevice = String(current.deviceTimeZone || "");
  const followsDevice = !saved || !lastDevice || saved === lastDevice;
  const timeZone = followsDevice ? deviceTimeZone : saved;
  return {
    timeZone,
    deviceTimeZone,
    changed: timeZone !== saved || deviceTimeZone !== lastDevice,
  };
}
