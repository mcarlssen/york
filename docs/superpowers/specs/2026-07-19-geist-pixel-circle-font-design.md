# Geist Pixel Circle — game UI font

Date: 2026-07-19

## Goal

Replace the game UI body font with Geist Pixel Circle. Admin stays on the existing mono stack.

## Decisions

| Choice | Decision |
|--------|----------|
| Variant | Circle |
| Scope | Game UI only (`css/styling.css`) |
| Loading | Local `@font-face` (already vendored) |
| Admin | Unchanged (`admin.html` keeps SF Mono stack) |

## Asset

- Path: `fonts/GeistPixel-Circle.woff2` (committed)
- Family name for CSS: `"Geist Pixel Circle"`

## CSS changes (`css/styling.css` only)

1. Add `@font-face`:

```css
@font-face {
  font-family: "Geist Pixel Circle";
  src: url("../fonts/GeistPixel-Circle.woff2") format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
```

2. Change `body` `font-family` to:

```css
font-family: "Geist Pixel Circle", "SF Mono", ui-monospace, Menlo, Consolas, monospace;
```

Fallback stack stays for environments that fail to load the woff2.

## Out of scope

- `admin.html` typography
- Font-size / letter-spacing retunes (revisit only if readability is bad in play)
- Other Geist Pixel variants
- Build tooling or npm `geist` package

## Success

Opening `index.html`, game chrome (title, map, log, input, meters, journal) renders in Geist Pixel Circle. Admin page looks the same as today.
