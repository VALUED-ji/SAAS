<!-- Hallmark · pre-emit critique: P5 H4 E4 S5 R5 V4 -->

# Design — Renovation SaaS System UI

Locked design system for the renovation SaaS back office. Future UI work reads
this file first. Amend intentionally: this file is the rule, not a moodboard.

## System

- Product surface · decoration-company SaaS back office for customer lifecycle, quotations, contracts, construction, finance, materials, organization, and analytics.
- Primary users · sales consultants, designers, project managers, finance staff, branch managers, and company operators.
- Primary workflow · scan current state, filter down, open a record, take the next operational action, and return to the queue without losing context.
- Genre · modern-minimal product system.
- Visual language · Soft Enterprise + Neutral Chrome.
- Density · 7/10 for lists, tables, approvals, and editors; 5/10 for dashboards; 4/10 for onboarding or empty setup screens.
- Tone · calm, competent, precise, work-focused.

## Principles

- First viewport must look like usable software, not a marketing page.
- Preserve business behavior: API shape, permission checks, sorting, default filters, approval state, and data scope are not visual concerns.
- Prefer panes, toolbars, tables, drawers, and compact resource rows over repeated large cards.
- Use blue as a signal, not decoration. It marks primary actions, focus, selected navigation, and current state.
- Make status visible through text, shape, and position; color alone is never the only signal.
- Keep motion quiet. State changes may fade or slide lightly; no cinematic scroll effects in product screens.
- Do not invent metrics, testimonials, logos, or sample business facts.

## Tokens

Canonical implementation should live in Tailwind theme tokens plus CSS custom
properties. Existing Tailwind colors remain valid; new code should reference
semantic roles first.

```css
:root {
  --color-canvas: #f6f7f9;
  --color-canvas-raised: #f9fafb;
  --color-panel: #ffffff;
  --color-panel-muted: #fafaf9;
  --color-panel-tint: #f4f7fb;

  --color-ink: #171717;
  --color-ink-2: #344054;
  --color-ink-muted: #667085;
  --color-ink-subtle: #98a2b3;

  --color-rule: #e2e7ee;
  --color-rule-strong: #cbd5df;

  --color-primary: #407aff;
  --color-primary-hover: #2f66e8;
  --color-primary-soft: #edf4ff;
  --color-primary-rule: #cfe0ff;

  --color-success: #0f766e;
  --color-success-soft: #ecfdfa;
  --color-warning: #d97706;
  --color-warning-soft: #fff7ed;
  --color-danger: #dc2626;
  --color-danger-soft: #fff1f2;
  --color-info: #2563eb;
  --color-info-soft: #eff6ff;

  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
  --font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-7: 28px;
  --space-8: 32px;

  --radius-control: 8px;
  --radius-field: 10px;
  --radius-panel: 12px;
  --radius-section: 14px;
  --radius-dialog: 16px;
  --radius-pill: 999px;

  --shadow-panel: 0 8px 20px rgba(24, 34, 48, 0.04);
  --shadow-floating: 0 18px 44px rgba(27, 51, 88, 0.14),
    0 4px 14px rgba(27, 51, 88, 0.06);

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-fast: 120ms;
  --dur-base: 180ms;
  --dur-slow: 260ms;
}
```

## Typography

- App font · system sans, optimized for Chinese UI and numeric business data.
- Page title · 24-30px / 650. Use 30px only on dashboards and major workspaces.
- Section title · 15-17px / 650.
- Table header · 12px / 650, muted ink, compact uppercase only when the term is already an acronym.
- Body text · 13-14px / 500.
- Metadata · 12px / 500.
- Numeric values · tabular numerals, right-aligned in tables, 600-700 weight for key amounts.
- Letter spacing · 0 by default. Do not apply negative tracking to Chinese UI text.

## Layout

- Shell · persistent sidebar, top work area, page toolbar, content pane, optional right drawer.
- Desktop page margin · 20-28px depending on density. Mobile margin · 14-16px.
- Page stack gap · 16-24px.
- Panel padding · 16px for dense resource pages, 20px for details and forms, 24px for analytics.
- Table row height · 44-52px. Approval/editor rows may be taller only when they contain multiline business content.
- Modal body · independent scroll; header and footer remain stable.
- Detail pages · use continuous information grids and timeline/list structures, not one card per field.
- Editors · use command toolbar + canvas/table + inspector/footer status rather than isolated controls.

## Surfaces

- Canvas · neutral gray, never pure blue.
- Primary panel · white with visible low-contrast border.
- Secondary panel · muted near-white for headers, empty states, filter bands, read-only zones.
- Floating surface · menus, popovers, dialogs use stronger shadow and explicit border.
- Avoid cards inside cards. If a section already has a panel, inner groups use rows, dividers, or tinted bands.

## Components

Standard component rules live in `docs/system-ui-component-library.md`.

Required families:

- App shell · sidebar, top bar, breadcrumbs, command/search area.
- Resource index · toolbar, filter chips, segmented tabs, table/list, pagination, batch actions.
- Detail workspace · record header, tab bar, section header, info grid, timeline, related tables.
- Form controls · input, select, date input, textarea, checkbox, radio, switch, validation.
- Feedback · status badge, alert, toast, empty, loading skeleton, recoverable error.
- Overlays · modal, drawer, popover, dropdown, attachment preview.
- Data display · KPI, chart panel, ranking list, amount cell, progress, audit trail.

## Interaction

- Every interactive control needs default, hover, focus-visible, active, disabled, loading, error, and success states when applicable.
- Focus rings use primary blue with enough contrast and appear instantly.
- Hover states should clarify clickability without moving layout.
- Loading states match the final shape: skeleton for page/table/panel, spinner only inside compact buttons.
- Destructive actions require visual separation, plain wording, and a recovery path when the business supports it.
- Keyboard behavior matters for menus, selects, dialogs, drawers, and table row actions.
- Reduced motion collapses spatial motion to opacity under 150ms.

## Mobile

- Main navigation collapses to drawer or compact bottom/rail pattern based on route.
- Tables become card rows, column-priority lists, or horizontal scroll only for true data grids.
- Dialogs become sheets when width is constrained.
- Sticky action bars are allowed on mobile detail/edit flows.
- Touch targets must be at least 40px high.
- No horizontal body scroll.

## Protected Surfaces

Do not redesign these without explicit scope:

- `/dashboard`
- `/group-dashboard`
- `/projects` customer list
- `Sidebar`
- Login and public/mobile share experiences

## Handoff Standard

Before implementing any UI upgrade:

- Name the workflow pattern: resource index, detail workspace, settings console, analytics workspace, command center, or editor.
- List the components to reuse or create.
- State what is preserved: API, permissions, filters, sorting, data shape, and business actions.
- Provide loading, empty, error, and disabled states in the component plan.
- Verify desktop and mobile behavior before marking the UI complete.
