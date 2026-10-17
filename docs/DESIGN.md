# Design System & Authority

## Visual World
- **Theme**: Ultra-Clean Modern Workspace (Linear, Apple & Raycast aesthetic)
- **Palette Mode**: Dual-theme (Light & Dark) with natural contrast, no harsh saturated neon halos.
- **Surface**: Porcelain & Slate for Light Mode; Deep Obsidian & Midnight Navy for Dark Mode.
- **Accents**: Indigo (`#6366f1` / `#4f46e5`), Sky Blue (`#38bdf8`), Emerald (`#10b981`), Amber (`#f59e0b`), Rose (`#f43f5e`).

## Typography Ramp
- Primary Font: `'Plus Jakarta Sans', 'Inter', -apple-system, system-ui, sans-serif`
- Functional Text Floor: Minimum `11px` (WCAG compliance, no undersized 8.5px/9px/10px functional UI text).
- Scale:
  - Micro / Meta: `11px` (font-weight 600+)
  - Caption / Tag: `12px`
  - Body Small: `13px`
  - Body Regular: `14px`
  - Title Small: `16px`
  - Title Section: `18px - 20px`
  - Hero / Display: `24px - 32px`

## Elevation & Depth System
- No AI-slop hairline border + wide 60px diffuse shadow pairing.
- No zero-offset saturated dark glow halos (`box-shadow: 0 0 20px rgb(...)`).
- Depth is expressed through subtle directional offset (`0 1px 3px`, `0 8px 24px -4px`) and refined surface contrast.
- Subtle inner borders (`1px solid var(--border)`).

## Motion & Micro-interactions
- Timing Functions: Smooth exponential ease-out (`cubic-bezier(0.16, 1, 0.3, 1)` or `ease-out`).
- Avoid cartoonish bounce easings (`cubic-bezier(0.34, 1.56, 0.64, 1)`).
- Layout Transitions: Animate `transform` and `opacity` instead of geometry (`width`, `height`, `all`).
