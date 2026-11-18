// Splits a text field's props into event handlers (called through a ref, so
// they never cause a DOM update) and plain attributes plus a stable string key
// that only changes when an attribute really changes. Used by StableField.

export function splitFieldProps(props: Record<string, unknown>): {
  handlers: Record<string, (...args: unknown[]) => unknown>;
  attrs: Record<string, unknown>;
  attrsKey: string;
} {
  const handlers: Record<string, (...args: unknown[]) => unknown> = {};
  const attrs: Record<string, unknown> = {};
  for (const [name, val] of Object.entries(props)) {
    if (typeof val === "function") handlers[name] = val as (...args: unknown[]) => unknown;
    else if (val !== undefined) attrs[name] = val;
  }
  let attrsKey: string;
  try {
    attrsKey = JSON.stringify(Object.keys(attrs).sort().map((k) => [k, attrs[k]]));
  } catch {
    attrsKey = String(Math.random());
  }
  return { handlers, attrs, attrsKey };
}
