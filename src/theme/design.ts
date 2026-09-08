// ============================================================
// Shared design system — the "clean UI" language for the whole app.
//
// Redesign only: screens keep every element, button and label they have
// now; they just re-skin to these tokens for a calm, airy, white-card look
// (soft cool-gray background, hairline borders, muted gray labels, one blue
// accent, dark near-black primary buttons, generous spacing + radius).
//
// Usage:  import { C, S, R, F, SHADOW, T } from '../../theme/design';
// ============================================================
import { StyleSheet } from 'react-native';

// ---------- Color ----------
export const C = {
  // surfaces
  bg: '#F4F5F7',          // app background
  surface: '#FFFFFF',     // cards / sheets
  surfaceAlt: '#F7F8FA',  // inset fills, secondary buttons
  border: '#ECEEF1',      // hairline divider / card border
  borderStrong: '#E2E5EA',

  // text
  text: '#1A1D21',        // headings / primary
  textSecondary: '#6B7280',
  textMuted: '#9AA1AC',   // small labels, captions, placeholders

  // brand accent (kept: existing I-CarWash blue)
  accent: '#2563EB',
  accentDark: '#1D4ED8',
  accentSoft: '#EEF4FF',  // tinted background for accent icons/pills

  // dark primary CTA (near-black, like the mockup's main buttons)
  ink: '#15171B',
  inkSoft: '#2A2D33',

  // status
  success: '#16A34A', successSoft: '#E7F6EC',
  warning: '#B7791F', warningSoft: '#FBF0DE',
  danger: '#DC2626',  dangerSoft: '#FCECEC',

  white: '#FFFFFF',
  black: '#000000',
};

// ---------- Spacing (4pt scale) ----------
export const S = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  screen: 16,   // default screen horizontal padding
  gap: 12,      // default gap between cards
};

// ---------- Radius ----------
export const R = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  pill: 999,
};

// ---------- Type scale ----------
export const F = {
  display: 24,
  title: 18,
  subtitle: 15,
  body: 14,
  small: 13,
  label: 12,
  caption: 11,
  weightBold: '800' as const,
  weightSemi: '700' as const,
  weightMed: '600' as const,
};

// ---------- Elevation (very soft) ----------
export const SHADOW = {
  card: {
    shadowColor: '#0B1220',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  soft: {
    shadowColor: '#0B1220',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
};

// ---------- Common building blocks ----------
// Reusable, composable style fragments so every screen renders the same
// card, label, button, list row, chip and input.
export const T = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  screenPad: {
    paddingHorizontal: S.screen,
  },

  // Card
  card: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    ...SHADOW.soft,
  },
  cardFlat: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
  },

  // Typography
  h1: { fontSize: F.display, fontWeight: F.weightBold, color: C.text, letterSpacing: 0.2 },
  h2: { fontSize: F.title, fontWeight: F.weightBold, color: C.text },
  subtitle: { fontSize: F.subtitle, color: C.textSecondary, lineHeight: 21 },
  body: { fontSize: F.body, color: C.text, lineHeight: 20 },
  bodyMuted: { fontSize: F.small, color: C.textSecondary, lineHeight: 19 },
  sectionLabel: {
    fontSize: F.label,
    fontWeight: F.weightSemi,
    color: C.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: S.sm,
  },
  caption: { fontSize: F.caption, color: C.textMuted },

  // Primary button (blue accent, full-width, ~52px) -- the app's single
  // primary CTA colour; every screen's main action button uses this blue.
  btnPrimary: {
    backgroundColor: C.accent,
    minHeight: 52,
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: S.xl,
  },
  btnPrimaryText: {
    color: C.white,
    fontSize: F.body,
    fontWeight: F.weightBold,
    letterSpacing: 0.3,
  },

  // Accent button (blue)
  btnAccent: {
    backgroundColor: C.accent,
    minHeight: 52,
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: S.xl,
  },
  btnAccentText: {
    color: C.white,
    fontSize: F.body,
    fontWeight: F.weightBold,
    letterSpacing: 0.3,
  },

  // Secondary / "Previous" button (light fill)
  btnGhost: {
    backgroundColor: C.surfaceAlt,
    minHeight: 52,
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: S.xl,
    borderWidth: 1,
    borderColor: C.border,
  },
  btnGhostText: {
    color: C.text,
    fontSize: F.body,
    fontWeight: F.weightSemi,
  },

  btnDisabled: { opacity: 0.45 },

  // List row (menu item / outlet row): tinted icon chip + title/subtitle + chevron
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: S.md,
    paddingHorizontal: S.lg,
    gap: S.md,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: R.sm,
    backgroundColor: C.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: F.body, fontWeight: F.weightSemi, color: C.text },
  rowSubtitle: { fontSize: F.caption, color: C.textMuted, marginTop: 2 },

  // Chip / selectable pill
  chip: {
    paddingVertical: S.sm,
    paddingHorizontal: S.lg,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.borderStrong,
    backgroundColor: C.surface,
  },
  chipActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  chipText: { fontSize: F.small, fontWeight: F.weightMed, color: C.textSecondary },
  chipTextActive: { color: C.white, fontWeight: F.weightSemi },

  // Status pill (tinted)
  statusPill: {
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: S.sm,
    borderRadius: R.sm,
    backgroundColor: C.surfaceAlt,
  },
  statusPillText: { fontSize: F.caption, fontWeight: F.weightSemi, color: C.textSecondary },

  // Text input
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderStrong,
    borderRadius: R.md,
    paddingHorizontal: S.lg,
    paddingVertical: 13,
    fontSize: F.body,
    color: C.text,
  },

  // Divider
  divider: { height: 1, backgroundColor: C.border },

  // Sticky bottom action bar
  bottomBar: {
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: S.screen,
    paddingTop: S.md,
  },
});
