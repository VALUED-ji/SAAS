<!-- Hallmark · pre-emit critique: P5 H4 E4 S5 R5 V4 -->

# System UI Upgrade Playbook

This playbook defines how to upgrade the current system UI without rewriting
business logic. It is intentionally practical: every page should be mapped to a
workflow pattern, upgraded with standard components, and verified against the
same acceptance checklist.

## Upgrade Goal

- Establish one coherent product UI system across back-office pages.
- Reduce one-off Tailwind class piles and page-specific visual patches.
- Improve scanning, filtering, editing, approving, and drill-down workflows.
- Keep all API, permissions, data shape, sorting, and workflow behavior intact.

## Scope

In scope:

- Customer lifecycle details.
- Quotations and quotation editor.
- Contract templates and contract approval.
- Construction sites and construction records.
- Finance receipts, settlements, refunds, and approvals.
- Materials, orders, suppliers, quota library, and settings.
- Organization, team, role, branch, and system settings.
- Shared modals, selectors, uploaders, previews, tables, and filters.

Protected unless explicitly reopened:

- `/dashboard`
- `/group-dashboard`
- `/projects` customer list
- `Sidebar`
- Login, public quotation share, VR share, mobile check-in, signature capture.

## Workflow Patterns

### Resource Index

Use for list pages: customers, quotations, contracts, sites, finance records,
materials, orders, suppliers, staff, roles.

Required:

- Page header with title, count, and primary action.
- Toolbar with search, quick filters, advanced filters, and view/batch actions.
- Dense table or list using `SystemResourceTable`.
- Pagination or infinite loading state.
- Empty, loading, error, selected, and row-opening states.

### Detail Workspace

Use for customer detail, site detail, branch detail, contract detail, supplier detail.

Required:

- Record header with object identity and current status.
- Primary next action visible.
- Tab or section navigation.
- Main content with optional right inspector.
- Info grid, activity/timeline, related resources.
- Attachment preview and audit trail patterns where needed.

### Settings Console

Use for personal profile, branch settings, material settings, quota templates,
contract templates, system settings.

Required:

- Left section nav or grouped panels.
- Forms with labels, helper text, validation, dirty/saving/saved states.
- Sticky save/reset actions for long forms.
- Danger zone separated from normal settings.
- Audit metadata when changes affect business rules.

### Analytics Workspace

Use for dashboard, group dashboard, finance analytics, performance views.

Required:

- KPI strip.
- Primary chart canvas.
- Filters and timeframe controls.
- Comparison or ranking table.
- Drill-down path from metric to records.

### Command Center

Use for approvals, todos, operational queues, exception handling.

Required:

- Queue/list on left or main.
- Current item detail.
- Action panel with approve/reject/assign/follow-up.
- Keyboard-friendly navigation.
- Clear state for waiting, in-progress, failed, and completed items.

### Editor

Use for quotation editor, template editor, VR builder, rich document sections.

Required:

- Command toolbar.
- Main canvas or grid.
- Inspector/properties panel when editing selected item.
- Save status, validation, undo/restore where possible.
- Stable footer or status bar for totals and warnings.

## Upgrade Sequence

1. Inventory the page.
   - Identify workflow pattern.
   - List data sources, permissions, mutations, filters, sort, pagination, and modals.
   - Mark protected behavior.

2. Map to standard components.
   - Reuse component families from `docs/system-ui-component-library.md`.
   - Create missing primitives only if they will be reused.
   - Avoid page-only visual abstractions unless the workflow is unique.

3. Normalize layout.
   - Apply shell, header, toolbar, panel, table/detail/editor pattern.
   - Remove decorative card grids that do not support the task.
   - Keep row heights, panel padding, and modal anatomy consistent.

4. Normalize states.
   - Add loading, empty, error, disabled, active, selected, dirty, saving, saved.
   - Stabilize dimensions so UI does not jump.
   - Verify focus-visible and keyboard paths.

5. Verify behavior.
   - Confirm API calls, request parameters, permissions, data shape, default filters, and submit flows did not change.
   - Run typecheck/lint/tests relevant to touched code.
   - Check desktop and mobile layouts.

## Page-Type Standards

### List Pages

- Header height should stay compact.
- Search and filters sit in one predictable toolbar.
- Advanced filters should not permanently consume vertical space unless heavily used.
- Table columns should follow: primary entity, context, status, owner, date/value, actions.
- Pagination stays visually attached to the table panel.

### Detail Pages

- Header identifies the record immediately: name, status, owner, branch, core metadata.
- The next business action must be visible without searching.
- Tabs preserve current order unless scope explicitly includes IA changes.
- Related resources use tables/lists, not scattered cards.
- Activity records use timeline/list pattern with timestamp and actor.

### Forms

- Group related fields.
- Put labels above fields.
- Use helper text for business rules.
- Required fields are visible before submit.
- Validation is inline and recoverable.
- Save action remains reachable in long forms.

### Modals And Selectors

- Use modal for focused task; drawer for contextual preview or advanced filtering.
- Large selectors include search, count, selected state, empty state.
- Modal primary button text names the action.
- Do not close on submit failure; preserve input and show error.

### Tables

- Align numbers right.
- Keep actions in a stable column.
- Use badges sparingly and semantically.
- Use row hover/focus to clarify click target.
- Avoid inserting large buttons into every row unless the action is the primary workflow.

## Token Migration Rule

When touching UI:

- Prefer Tailwind tokens from `primary`, `accent`, and `surface`.
- Prefer semantic CSS variables from `design.md` when adding new shared CSS.
- Move repeated arbitrary hex values into tokens during component extraction.
- Do not convert the whole project in one pass. Token migration follows touched components.

## Quality Gates

A page upgrade is not done until:

- It looks like product software in the first viewport.
- It has app shell, header, toolbar/work area, and appropriate stateful controls.
- It uses at least three surface levels: canvas, panel, muted/tinted panel.
- Repeated UI uses standard components.
- Loading, empty, error, disabled, selected, and focus states exist.
- Mobile behavior is explicit.
- Text does not overflow buttons, badges, tabs, table cells, or modal headers.
- No unrelated business behavior changed.

## Documentation Rule

When a reusable component is introduced or materially changed:

- Update `docs/system-ui-component-library.md`.
- Note accepted variants, sizes, and required states.
- Add the component to the upgrade checklist for future pages.

When a page pattern is established:

- Update this playbook with the pattern decision.
- Mention any protected behavior or route-specific exception.

## Recommended First Pass

1. Standardize shared primitives: button, field, badge, panel, toolbar.
2. Stabilize overlays: modal, drawer, popover, select menu, attachment preview.
3. Consolidate resource tables and pagination.
4. Upgrade detail workspace shell.
5. Upgrade editors last, because they carry the most business risk.
