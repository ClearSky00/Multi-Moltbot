/**
 * Maps electron-store settings to a CSS --ui-font-scale multiplier on :root.
 * Supports font_scale ('85'|'100'|'115'|'130') and legacy fontScale ('medium', etc.).
 */

const ALLOWED = ["85", "100", "115", "130"];

function mapLegacyFontScale(v) {
  if (v == null) return null;
  const s = String(v);
  if (/^\d+$/.test(s)) return s;
  const m = {
    small: "85",
    sm: "85",
    medium: "100",
    md: "100",
    default: "100",
    large: "115",
    lg: "115",
    xlarge: "130",
    xl: "130",
  };
  return m[s.toLowerCase()] ?? null;
}

/**
 * @param {Record<string, unknown>} settings — raw object from settings:get
 */
export function applyFontScaleFromSettings(settings) {
  if (typeof document === "undefined") return;

  const raw = settings?.font_scale ?? mapLegacyFontScale(settings?.fontScale);
  let pct = parseInt(String(raw ?? "100"), 10);
  if (!Number.isFinite(pct)) pct = 100;
  pct = Math.min(200, Math.max(70, pct));
  const factor = pct / 100;
  document.documentElement.style.setProperty("--ui-font-scale", String(factor));
}

/**
 * Value for the Appearance Font Scale <Select> (string percent).
 */
export function getFontScaleSelectValue(settings) {
  const raw = settings?.font_scale ?? mapLegacyFontScale(settings?.fontScale);
  const s = String(raw ?? "100");
  if (ALLOWED.includes(s)) return s;
  const pct = parseInt(s, 10);
  if (!Number.isFinite(pct)) return "100";
  if (pct <= 90) return "85";
  if (pct <= 107) return "100";
  if (pct <= 122) return "115";
  return "130";
}
