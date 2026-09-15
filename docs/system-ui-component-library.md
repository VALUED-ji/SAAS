<!-- Hallmark · pre-emit critique: P5 H4 E4 S5 R5 V4 -->

# System UI Component Library

This is the standard component library plan for the renovation SaaS back
office. It is a design and implementation contract: future UI work should
reuse these families before creating page-specific components.

## Design Read

Reading this as: a dense operations workspace for renovation teams, optimized
for scan, filter, drill down, edit, approve, and return to work.

## Component Tiers

| Tier | Purpose | Examples | Rule |
| --- | --- | --- | --- |
| Foundation | Tokens and primitives | color, type, spacing, radius, shadow, focus | No page-specific values. |
| Primitive | Single controls | button, input, select, checkbox, badge | Must support states and a11y. |
| Composite | Reused patterns | toolbar, table, modal, drawer, info grid | Owns spacing and layout rules. |
| Template | Page skeletons | resource index, detail workspace, settings console | Assembles composites, no business logic. |

## Existing Components To Keep

- `SystemSelect` · keep as canonical select/dropdown foundation; replace hard-coded menu colors with tokens later.
- `SystemResourceTable` · keep as canonical dense table wrapper.
- `StatusBadge` · keep concept, expand to semantic variants and consistent ring/background tokens.
- `DataPagination` · keep as canonical pagination.
- `SystemDateInput` / `NativeDatePickerActivator` · keep for date entry.
- `DetailInfoField` · keep for detail information grids.
- `RouteLoading` · keep for route-level loading and align skeleton shapes.
- `ThinScrollArea` · keep for table and modal scroll zones.

## Buttons

Variants:

- Primary · main commit action, blue fill, white text.
- Secondary · white surface, border, neutral text.
- Ghost · toolbar or row action, transparent until hover.
- Danger · destructive action, separated from neutral actions.
- Icon · square 32/36/40px sizes using lucide icons.
- Link button · text command, only when it navigates or opens detail.

Sizes:

- `sm` · 32px height, compact toolbar.
- `md` · 40px height, default forms and modals.
- `lg` · 44px height, primary page action.

States:

- default, hover, focus-visible, active, disabled, loading, success, danger-confirm.
- Loading buttons keep width stable.
- Icon-only buttons require `aria-label` and tooltip if meaning is not obvious.

## Form Fields

Applies to input, textarea, select, date, amount, search, checkbox, radio, and switch.

- Label always visible above the control. No placeholder-as-label.
- Helper text below label or field; error text replaces helper in the same slot.
- Required marker belongs to label, not placeholder.
- Field height default 40px; dense toolbar controls may be 36px.
- Prefix/suffix slots allowed for currency, unit, search icon, clear button, and calendar icon.
- Validation states: idle, focused, dirty, valid, error, disabled, loading.
- Search inputs in toolbars may be unlabeled visually, but need accessible labels.

## Select And Dropdown

- Use `SystemSelect` for normal selects.
- Searchable select for organization, staff, customer, material, template, and region lists.
- Dropdown menu min width equals trigger width; max height adapts to viewport.
- Selected option has check icon and tinted background.
- Empty result shows concise text and optional clear-search action.
- Keyboard support: ArrowUp, ArrowDown, Enter, Space, Escape.

## Resource Table

Use for customers, quotations, contracts, finance records, materials, suppliers, orders, team members, and audit logs.

Structure:

- Panel shell with toolbar above table.
- Sticky header for long tables.
- Stable row height: 44-52px.
- Primary entity column left.
- Numeric columns right-aligned with tabular numerals.
- Status column near the operational meaning, not always at the far right.
- Actions column right, sticky only when table is wide.

Required states:

- loading skeleton rows.
- empty state with current filter context.
- error state with retry.
- row hover.
- selected row.
- opening row or optimistic update.
- disabled row when action is unavailable.

Avoid:

- Large table padding.
- Every cell using the same text weight.
- Blue-tinted full rows except selected/focused state.
- Action buttons that appear in unpredictable positions.

## Toolbar And Filters

Resource index toolbar order:

1. Page title and count.
2. Primary action.
3. Search.
4. Quick filters or segmented tabs.
5. Advanced filter button.
6. View/export/batch actions.

Rules:

- Search width 260-360px desktop, full width mobile.
- Filter chips are compact, removable, and show active count.
- Advanced filters open drawer or popover based on complexity.
- Reset filters appears only when filters are active.
- Batch action bar appears after row selection and does not shift table columns.

## Status Badge

Semantic families:

- neutral · waiting, draft, closed, inactive.
- info · in progress, contacted, construction.
- success · signed, completed, active, approved.
- warning · pending review, quoted, needs action.
- danger · rejected, overdue, lost, failed.

Rules:

- Badge height 22-24px.
- Include dot only for operational status, not category labels.
- Use text label that explains the state.
- Never create random colors for page-specific statuses; map to a semantic family.

## Panels And Cards

Use panels for work surfaces, not decorative grids.

- Section panel · 12-14px radius, white, border.
- Data card · only for KPIs, chart modules, or meaningful repeated entities.
- Tinted band · for summaries, read-only blocks, filter zones, and empty states.
- Divider row · preferred inside detail panels instead of nested cards.

Do not put cards inside cards unless the inner card is a repeated list item with its own action.

## Detail Workspace

Use for customer detail, construction detail, branch detail, quotation detail, contract detail, and supplier detail.

Required structure:

- Record header with identity, status, ownership, and primary next action.
- Tab strip or section nav.
- Left main content + optional right inspector on desktop.
- Continuous info grid for fields.
- Timeline or activity log for history.
- Related resource tables for quotations, contracts, payments, materials, and files.

Rules:

- Keep current workflow action visible.
- Distinguish read-only facts from editable fields.
- Long text uses expandable blocks, not fixed-height clipping.
- Attachments use preview drawer/modal with stable header actions.

## Modal

Use for focused business tasks.

Anatomy:

- Overlay.
- Dialog container.
- Header with title, subtitle, close button.
- Scrollable body.
- Footer with secondary action left or first, primary action right.

Sizes:

- `sm` 420px · confirm, simple edit.
- `md` 560px · forms.
- `lg` 720-840px · multi-section business modal.
- `xl` 960px+ · attachment preview or complex selector.

Rules:

- Header/footer fixed when body scrolls.
- Escape closes only when unsaved changes are handled.
- Primary action text is specific: "保存客户", "提交审批", not "确定".
- Danger confirmations state the affected object.

## Drawer

Use for contextual detail, advanced filters, quick edit, or preview that should not break the current table context.

- Right drawer desktop, bottom sheet mobile.
- Width 420-560px for filters/detail; 720px for rich preview.
- Keep close, title, and primary action visible.
- Preserve page scroll position behind the drawer.

## Empty, Loading, Error

Empty:

- Explain what is absent.
- Mention active filters when relevant.
- Offer one useful next action.

Loading:

- Skeleton shape matches final layout.
- Table skeleton keeps column widths.
- Button loading keeps label width stable.

Error:

- Recoverable action: retry, clear filters, reopen, or contact admin.
- Preserve user input if submission fails.

## Navigation

- Sidebar remains the primary system navigation.
- Active item must be obvious through background, text weight, icon color, and optional indicator.
- Group labels are muted; do not over-style every section.
- Collapsed sidebar keeps tooltip or accessible title.
- Breadcrumbs appear on deep detail/editor pages when returning matters.

## Analytics Components

Use for dashboard and group-dashboard style pages.

- KPI card with value, label, trend/context, and optional drill-down.
- Chart panel with title, timeframe, legend, and empty state.
- Ranking list with rank, entity, value, and comparison.
- Progress metric with label, value, target, and semantic color.
- Map/chart interactions must not hide the underlying numeric summary.

## Component Acceptance Checklist

Before a component is accepted:

- Uses semantic tokens, not scattered hex values.
- Has default, hover, focus-visible, active, disabled, loading, error, and success where applicable.
- Has accessible name and keyboard path.
- Does not shift layout across state changes.
- Works at desktop and mobile widths.
- Has loading, empty, and error behavior when data-backed.
- Uses lucide icons consistently when icons are needed.
- Does not change API, permission, or business behavior.
