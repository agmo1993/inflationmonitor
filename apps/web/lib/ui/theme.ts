/**
 * Shared DESIGN.md Framer tokens for InflationMonitor UI.
 * Source of truth: repo-root DESIGN.md
 */

export const colors = {
  primary: "#ffffff",
  "on-primary": "#000000",
  onPrimary: "#000000",
  "accent-blue": "#0099ff",
  accentBlue: "#0099ff",
  accent: "#0099ff",
  ink: "#ffffff",
  "ink-muted": "#999999",
  inkMuted: "#999999",
  canvas: "#090909",
  "surface-1": "#141414",
  surface1: "#141414",
  "surface-2": "#1c1c1c",
  surface2: "#1c1c1c",
  hairline: "#262626",
  "hairline-soft": "#1a1a1a",
  hairlineSoft: "#1a1a1a",
  "inverse-canvas": "#ffffff",
  inverseCanvas: "#ffffff",
  "inverse-ink": "#000000",
  inverseInk: "#000000",
  inkInverse: "#000000",
  "gradient-magenta": "#d44df0",
  gradientMagenta: "#d44df0",
  "gradient-violet": "#6a4cf5",
  gradientViolet: "#6a4cf5",
  "gradient-orange": "#ff7a3d",
  gradientOrange: "#ff7a3d",
  "gradient-coral": "#ff5577",
  gradientCoral: "#ff5577",
  "semantic-success": "#22c55e",
  semanticSuccess: "#22c55e",
} as const;

export const rounded = {
  xs: "4px",
  sm: "6px",
  md: "10px",
  lg: "15px",
  xl: "20px",
  xxl: "30px",
  pill: "100px",
  full: "9999px",
} as const;

export const components = {
  "button-primary": {
    backgroundColor: "{colors.primary}",
    textColor: "{colors.on-primary}",
    typography: "{typography.button}",
    rounded: "{rounded.pill}",
    padding: "10px 15px",
  },
  buttonPrimary: {
    backgroundColor: "{colors.primary}",
    textColor: "{colors.on-primary}",
    typography: "{typography.button}",
    rounded: "{rounded.pill}",
    padding: "10px 15px",
  },
  "button-secondary": {
    backgroundColor: "{colors.surface-1}",
    textColor: "{colors.ink}",
    typography: "{typography.button}",
    rounded: "{rounded.pill}",
    padding: "10px 15px",
  },
} as const;

export const theme = { colors, rounded, components } as const;

export default theme;
