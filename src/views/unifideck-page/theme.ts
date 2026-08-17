/**
 * Design tokens for the Unifideck catalogue page.
 *
 * Ported from rackdroid.org's visual language: a warm near-black
 * amber/brown palette, monospaced uppercase micro-labels, and softly
 * rounded panels that lift when you touch them.
 *
 * Three deliberate departures, each forced by the target:
 *
 *   - rackdroid keys every interactive state off `:hover`. Gaming Mode
 *     has no pointer, so each of those becomes a *focus* state here —
 *     the gamepad focus ring is the only cursor that exists.
 *   - rackdroid blurs freely; here the blur is rationed. It buys a lot
 *     of the site's character, but it also recomposites its backdrop
 *     every frame the content behind it moves, so it is confined to the
 *     two thin bars and the tile badges. See `glass()` below.
 *   - the site's display face (Geomini) is not bundled: it is a custom
 *     webfont we have no licence to redistribute inside a plugin. The
 *     identity survives without it, because what actually carries the
 *     look is the monospaced label treatment, not the headline face.
 */

import type { CSSProperties } from "react";

/** Palette. Values lifted verbatim from rackdroid.org's `:root`. */
export const C = {
  bg: "#120f0b",
  bg1: "#17130d",
  panel: "#201b14",
  panel2: "#251f17",
  rail: "#2c2519",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.17)",
  text: "#ede6d8",
  textDim: "#a29a8b",
  textFaint: "#6f695d",
  amber: "#f9b130",
  amberSoft: "#ffda9f",
  amberGlow: "rgba(249,177,48,0.35)",
  red: "#d45b52",
  teal: "#4fb8a6",
  violet: "#9b7fd4",
  blue: "#5b9bd5",
  /** Ink used on top of a solid amber fill (rackdroid's `.btn-primary`). */
  onAmber: "#17140f",
} as const;

/**
 * Monospace stack. rackdroid uses this for every piece of UI chrome —
 * nav links, buttons, kickers, meta rows — and reserves the
 * proportional face for prose. Game titles are prose; everything the
 * page says *about* a game is chrome.
 */
export const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/**
 * Per-store accent, used for the tile badge and the store chips.
 *
 * Amber is reserved for selection state, so no store may claim it —
 * a store badge glowing like a focused chip would read as "selected"
 * on a tile the user has not touched. Xbox green has no rackdroid
 * equivalent, so it is mixed to match the palette's muted saturation
 * rather than taken from Microsoft's brand sheet.
 */
export const STORE_COLOR: Record<string, string> = {
  steam: C.blue,
  epic: C.text,
  gog: C.violet,
  amazon: C.teal,
  ubisoft: C.red,
  microsoft: "#6fb85c",
};

/** Accent for a store, falling back to dim text for unknown ids. */
export function storeColor(store: string): string {
  return STORE_COLOR[store] ?? C.textDim;
}

/**
 * rackdroid's `.kicker`: uppercase mono, widely tracked, amber, with a
 * short rule drawn before it. The rule is a `::before` on the site; we
 * render it as a real element since inline styles have no pseudos.
 */
export const kickerText: CSSProperties = {
  fontFamily: MONO,
  fontSize: 12,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color: C.amberSoft,
};

/** The 22px rule that precedes a kicker. */
export const kickerRule: CSSProperties = {
  width: 22,
  height: 1,
  background: C.amberSoft,
  flexShrink: 0,
};

/**
 * Frosted-glass surface.
 *
 * `backdrop-filter` only means anything when something is actually
 * moving behind the element, so the surfaces that use this are laid out
 * as sticky bars *inside* the scroll container rather than as flex rows
 * above and below it — the grid has to pass under them for the effect
 * to read as glass instead of as flat tint.
 *
 * An earlier version of this comment claimed the blur had to be
 * rationed, and that 42 blurred tiles would wreck the frame rate. That
 * was reasoning, not measurement, and measurement disagrees. Sampling
 * `requestAnimationFrame` deltas while scrolling the full grid on the
 * device:
 *
 *   as shipped (two bars)        median 16.7 ms · 0 frames over 33 ms
 *   blur(40px) on all 42 tiles   median 16.7 ms · 0 frames over 33 ms
 *   deliberate overload          median 33.3 ms · 96 frames over 33 ms
 *
 * The third row is a calibration: it confirms the measurement can see
 * compositor cost, so the first two rows mean the headroom is real
 * rather than the metric being blind. Blur here is cheap; if a future
 * effect needs it on the tiles, the budget is there. What actually made
 * this page unstable was mounting 743 tiles and 743 cover images at
 * once — never the blur.
 *
 * `saturate` is what separates convincing glass from grey haze: real
 * frosted surfaces intensify the colour they diffuse.
 */
export function glass(tint: string, blurPx = 16): CSSProperties {
  return {
    background: tint,
    backdropFilter: `blur(${blurPx}px) saturate(140%)`,
    WebkitBackdropFilter: `blur(${blurPx}px) saturate(140%)`,
  } as CSSProperties;
}

/** Translucent ground for the header bar. */
export const GLASS_HEADER = "rgba(23,19,13,0.72)";
/** Translucent ground for the footer bar; denser, it sits over tiles. */
export const GLASS_FOOTER = "rgba(44,37,25,0.78)";

/**
 * rackdroid's `.mod-card-badge` — tiny, boxed, uppercase mono.
 *
 * Blurred as well, but over a *static* backdrop: the badge sits on its
 * own cover image, which does not move relative to it, so this costs
 * one composite at paint rather than one per scrolled frame.
 */
export function badgeStyle(color: string): CSSProperties {
  return {
    fontFamily: MONO,
    fontSize: 9.5,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    padding: "2px 6px",
    borderRadius: 4,
    color,
    background: "rgba(10,8,5,0.45)",
    backdropFilter: "blur(6px) saturate(150%)",
    WebkitBackdropFilter: "blur(6px) saturate(150%)",
    border: `1px solid ${color}55`,
    boxShadow: "0 2px 8px -2px rgba(0,0,0,0.6)",
    whiteSpace: "nowrap",
  } as CSSProperties;
}

/**
 * rackdroid's `.mod-chip`. `active` fills solid amber; `focused` is the
 * translation of the site's `:hover` — amber outline plus the glow that
 * `.btn-primary:hover` gets, so the gamepad's position is unmistakable
 * even against an already-active chip.
 */
export function chipStyle(
  active: boolean,
  focused: boolean,
): CSSProperties {
  return {
    fontFamily: MONO,
    fontSize: 11,
    letterSpacing: "0.03em",
    padding: "4px 10px",
    borderRadius: 999,
    whiteSpace: "nowrap",
    cursor: "pointer",
    transition: "background 0.15s ease, border-color 0.15s ease, color 0.15s ease",
    fontWeight: active ? 600 : 400,
    background: active ? C.amber : C.panel2,
    color: active ? C.onAmber : focused ? C.amberSoft : C.textDim,
    border: `1px solid ${active ? C.amber : focused ? C.amberSoft : C.borderStrong}`,
    boxShadow: focused ? `0 0 0 1px ${C.amberGlow}` : "none",
  };
}
