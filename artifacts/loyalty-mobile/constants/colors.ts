/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    text: '#173B2F',
    tint: '#173B2F',
    background: '#F5F5EE',
    foreground: '#173B2F',
    card: '#FFFFFF',
    cardForeground: '#173B2F',
    primary: '#173B2F',
    primaryForeground: '#FFFFFF',
    secondary: '#E9EDDF',
    secondaryForeground: '#173B2F',
    muted: '#ECEDE5',
    mutedForeground: '#788177',
    accent: '#E8EF61',
    accentForeground: '#173B2F',
    destructive: '#B9493F',
    destructiveForeground: '#FFFFFF',
    border: '#E2E5DA',
    input: '#E2E5DA',
  },
  dark: {
    text: '#F4F5E9',
    tint: '#E8EF61',
    background: '#12271F',
    foreground: '#F4F5E9',
    card: '#1C352A',
    cardForeground: '#F4F5E9',
    primary: '#E8EF61',
    primaryForeground: '#173B2F',
    secondary: '#294338',
    secondaryForeground: '#F4F5E9',
    muted: '#294338',
    mutedForeground: '#A6B2A7',
    accent: '#E8EF61',
    accentForeground: '#173B2F',
    destructive: '#F07C70',
    destructiveForeground: '#1C352A',
    border: '#365044',
    input: '#365044',
  },
  radius: 18,
};

export default colors;
