# InnoSaaS Design Guide for AI

## 1. Scope

- This guide must follow the current preview file in `03.DesignGuide/index.html`.
- Do not invent a different visual system before checking the existing preview structure.
- The design tone is a commercial tenant admin console, not a startup landing page and not an AI showcase.
- This guide partially references the review heuristics and anti-pattern language from `pbakaus/impeccable`, but final decisions must follow the current InnoSaaS baseline.

## 2. Page Structure

- The preview tab is composed in this order:
  - `#overview`
  - `#tokens`
  - `#controls`
  - `#status`
  - `#interactions`
  - `#page`
- The top-level tabs are:
  - `Design Guide (Preview)`
  - `Design Guide (Markdown for AI)`
- Keep this dual structure unless there is a clear reason to expand it.

## 3. Layout Rules

- Use white content surfaces on a warm light background.
- Use thin borders and restrained shadows.
- Main layout blocks:
  - `.hero-grid`
  - `.card-grid`
  - `.base-page`
  - `.base-pane`
- The tenant console page must keep a two-pane pattern:
  - left list area
  - right detail area

## 4. Typography Rules

- H1 must look stable on Windows Korean browsers.
- Use the current font stack priority:
  - `"Segoe UI Variable Display"`
  - `"Pretendard Variable"`
  - `"Pretendard"`
  - `"Apple SD Gothic Neo"`
  - `"Malgun Gothic"`
  - `sans-serif`
- Do not over-tighten headings.
- Keep headings and paragraph spacing visually open.
- Avoid line breaks that make Korean words look mechanically chopped.

## 5. Spacing Rules

- Base spacing logic is `8px`.
- Prefer semantic spacing tokens over arbitrary one-off values.
- Practical working gaps in this file are:
  - `10px`
  - `12px`
  - `14px`
  - `16px`
  - `18px`
  - `20px`
  - `22px`
  - `28px`
- Cards should feel breathable, not dense.
- Text and controls should never feel glued together.
- Buttons, badges, labels, and status text all need visible breathing room.
- Do not make every gap identical. Tight and generous spacing should both exist to build hierarchy.

## 6. Form Control Rules

- Do not use browser-default control appearance as the visible final design.
- Inputs, search fields, and textareas must follow the shared `.control` family.
- Interactive controls should stay at or above a practical `44px` touch target.
- All dropdowns must use the custom dropdown structure, not native option list styling.
- Required dropdown structure:
  - `.custom-select`
  - `.custom-select-trigger`
  - `.custom-select-caret`
  - `.custom-select-menu`
  - `.custom-select-option`
- Dropdown menus must stay folded by default.
- Dropdown menus open only on click and close on outside click or `Escape`.
- Closed dropdown menus must not occupy layout space.

## 7. Status Panel Rules

- Status area must use this structure:
  - `.status-panel`
  - `.status-icon`
  - `.status-copy`
- Do not use a thick left color bar.
- Use low-saturation background tint plus icon box.
- Icon and text block must be vertically aligned.

## 8. Button and Badge Rules

- Buttons use:
  - `.btn`
  - `.btn-primary`
  - `.btn-secondary`
  - `.btn-neutral`
  - `.btn-danger`
- Badges use:
  - `.badge`
  - state variants
- Buttons and badges need deliberate spacing.
- Do not pack buttons so tightly that they read as a single block.
- Button text must not break awkwardly.
- Within one local action area, keep one clear primary action and tone the rest down.

## 9. Interaction Rules

- Keep working interaction examples in the guide:
  - toast
  - modal
  - drawer
- These are not optional decorative demos.
- They are part of the component reference and should stay available for review.
- Motion must stay understated and respect `prefers-reduced-motion`.

## 10. Base Page Rules

- The `#page` section is the closest reference for future tenant console screens.
- Left pane contains:
  - list heading
  - search
  - plan filter dropdown
  - tenant list items
- Right pane contains:
  - detail heading
  - action buttons
  - form fields
  - memo textarea
- New admin screens should inherit this density and spacing before adding new patterns.

## 11. Avoid List

- Do not use dark-first UI.
- Do not use purple-led palettes.
- Do not use glassmorphism.
- Do not use decorative gradient blobs.
- Do not use oversized shadows.
- Do not use AI-like left accent alert bars.
- Do not compress text and controls into tight blocks.
- Do not nest cards inside cards when spacing and dividers can solve the hierarchy.
- Do not use low-contrast gray text on tinted or decorative backgrounds.

## 12. React Component Reference

### CustomSelect (dropdown)

**Location**: `frontend/portal/app/components/common/CustomSelect.tsx`

This component implements the `.custom-select` CSS class family from Section 6.
Use this instead of browser-default `<select>` in all portal pages.

**Import**:
```tsx
import CustomSelect, { SelectOption } from '@/components/common/CustomSelect';
```

**Props**:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| options | SelectOption[] | (required) | `{ value: string, label: string }[]` |
| value | string | (required) | Currently selected value |
| onChange | (value: string) => void | (required) | Callback when selection changes |
| placeholder | string | '선택...' | Placeholder text when nothing is selected |
| allowEmpty | boolean | false | Prepend an empty option for "show all" filters |
| emptyLabel | string | '전체' | Label for the empty option |
| className | string | '' | Additional CSS class on the wrapper |
| disabled | boolean | false | Disable interaction |

**Usage — filter dropdown (with "all" option)**:
```tsx
const [role, setRole] = useState('');
const roleOptions: SelectOption[] = [
  { value: 'admin', label: '관리자' },
  { value: 'user', label: '일반' },
];

<CustomSelect
  value={role}
  onChange={setRole}
  options={roleOptions}
  allowEmpty
  emptyLabel="전체 역할"
/>
```

**Usage — form field (no empty option)**:
```tsx
<CustomSelect
  value={formData.role}
  onChange={(v) => setFormData({ ...formData, role: v })}
  options={roleOptions}
  placeholder="역할 선택"
/>
```

**CSS classes used** (defined in `globals.css` and `design-guide.css`):
- `.custom-select` — wrapper (relative positioning)
- `.custom-select-trigger` — the button that shows the selected value
- `.custom-select-trigger.is-open` — accent border + focus ring when menu is open
- `.custom-select-trigger.is-placeholder` — muted text for unselected state
- `.custom-select-trigger.is-disabled` — reduced opacity
- `.custom-select-caret` — chevron icon, rotates on open
- `.custom-select-menu` — dropdown panel (absolute, z-index 200, shadow)
- `.custom-select-option` — each option row
- `.custom-select-option.is-selected` — accent-soft background highlight

**Rules**:
- Never use `<select>` or `<option>` HTML tags in portal pages.
- Always pass `allowEmpty` with an `emptyLabel` for filter dropdowns.
- For form fields inside modals, omit `allowEmpty` and set a descriptive `placeholder`.

## 13. Checkbox (체크박스)

**CSS classes** (defined in `design-guide.css`):
- `.check-item` — wrapper (flex row with border, padding, rounded)
- `.check-mark` — visual indicator (20×20, border-radius 6px)
- `.check-copy` — label text area (supports `<strong>` title + `<small>` description)

**HTML structure**:
```html
<label class="check-item">
  <input type="checkbox" checked>
  <span class="check-mark" aria-hidden="true"></span>
  <span class="check-copy">
    <strong>Label title</strong>
    <small>Optional description text</small>
  </span>
</label>
```

**States**:
- Default: border `--border-strong`, white background
- Checked: `--accent` background, white checkmark (CSS `::after`)
- Disabled: add `disabled` to `<input>`, style with opacity
- Indeterminate: set via JS `el.indeterminate = true`

**Portal implementation**: `glass-checkbox` class in `globals.css` — same visual language, adapted for table rows.

**Rules**:
- Always wrap in `<label class="check-item">` for accessibility.
- Use `check-copy` with `<strong>` + `<small>` for setting-style checkboxes.
- For table row checkboxes (bulk select), use the `glass-checkbox` class directly on `<input>`.

## 14. Radio Button (라디오 버튼)

**CSS classes** (defined in `design-guide.css`):
- `.radio-item` — wrapper (same layout as `.check-item`)
- `.radio-mark` — circular indicator (20×20, border-radius 999px)

**HTML structure**:
```html
<label class="radio-item">
  <input type="radio" name="group-name" value="option1" checked>
  <span class="radio-mark" aria-hidden="true"></span>
  <span>Option label</span>
</label>
```

**States**:
- Default: circle border `--border-strong`, white fill
- Checked: `--accent` background, white dot center (CSS `::after`)

**Rules**:
- All radio inputs in a group must share the same `name` attribute.
- Wrap each option in `<label class="radio-item">`.
- For horizontal layout, wrap radio-items in a flex container with `gap: 8px`.

## 15. Toggle Switch (토글 스위치)

**CSS classes** (defined in `design-guide.css`):
- `.switch-row` — outer container (flex, space-between, with border and padding)
- `.switch` — inner wrapper around the hidden input + track
- `.switch-track` — the pill-shaped track (44×26, border-radius 999px)
- `.switch-track::after` — the sliding knob (20×20 circle)

**HTML structure**:
```html
<div class="switch-row">
  <div>
    <strong>Setting name</strong>
    <small>Description of what this toggle controls</small>
  </div>
  <label class="switch">
    <input type="checkbox" checked>
    <span class="switch-track" aria-hidden="true"></span>
  </label>
</div>
```

**States**:
- Off: gray track (`#d9d2c9`), knob at left
- On (checked): `--accent` track, knob slides right (`translateX(18px)`)
- Transition: `--motion-fast` (160ms) ease-out

**Rules**:
- Use for binary on/off settings (active/inactive, enable/disable).
- Always place label text on the left, switch on the right (`.switch-row` handles this).
- Do not use toggle for multi-choice — use radio buttons instead.
- For standalone toggle without description, use `.switch` alone without `.switch-row`.

## 16. Tooltip (툴팁)

**CSS classes**:
- `.tooltip-wrap` — wrapper (relative, inline-flex)
- `.tooltip` — the popup text (absolute, z-300, dark bg, white text, 13px)
- `.tooltip-bottom` — modifier for below-element placement

**HTML structure**:
```html
<span class="tooltip-wrap">
  <button class="btn btn-secondary" type="button">Hover me</button>
  <span class="tooltip">도움말 텍스트</span>
</span>
```

**Rules**:
- Shows on hover and focus-within. Respects keyboard navigation.
- Default position is above. Add `.tooltip-bottom` for below.
- Use for icon buttons or truncated text that needs explanation.

## 17. Tabs (탭)

**CSS classes**:
- `.tab-group` — flex container with bottom border
- `.tab-item` — each tab button
- `.tab-item.is-active` — accent underline + accent text

**HTML structure**:
```html
<div class="tab-group">
  <button class="tab-item is-active" type="button">Tab 1</button>
  <button class="tab-item" type="button">Tab 2</button>
  <button class="tab-item" type="button">Tab 3</button>
</div>
```

**Rules**:
- Toggle `.is-active` with JS on click.
- Use for settings pages with multiple categories.
- Keep tab count under 6 for readability.

## 18. Pagination (페이지네이션)

**CSS classes**:
- `.pagination` — flex container with 4px gap
- `.pagination-item` — each page button (36px min-width, rounded 8px)
- `.pagination-item.is-active` — accent background, white text
- `.pagination-item:disabled` / `.is-disabled` — reduced opacity
- `.pagination-ellipsis` — the "..." separator

**HTML structure**:
```html
<nav class="pagination">
  <button class="pagination-item" disabled>&lsaquo;</button>
  <button class="pagination-item is-active">1</button>
  <button class="pagination-item">2</button>
  <button class="pagination-item">3</button>
  <span class="pagination-ellipsis">&hellip;</span>
  <button class="pagination-item">12</button>
  <button class="pagination-item">&rsaquo;</button>
</nav>
```

**Rules**:
- Use `&lsaquo;` / `&rsaquo;` for prev/next arrows.
- Disable prev on first page, next on last page.
- Show ellipsis when total pages > 7.

## 19. Breadcrumb (브레드크럼)

**CSS classes**:
- `.breadcrumb` — flex container (13px, muted color)
- `.breadcrumb-item` — each link (hover turns accent)
- `.breadcrumb-item.is-current` — final item (text-body, no pointer)
- `.breadcrumb-sep` — the "/" separator

**HTML structure**:
```html
<nav class="breadcrumb">
  <a class="breadcrumb-item" href="#">관리</a>
  <span class="breadcrumb-sep">/</span>
  <a class="breadcrumb-item" href="#">앱 관리</a>
  <span class="breadcrumb-sep">/</span>
  <span class="breadcrumb-item is-current">현재 페이지</span>
</nav>
```

**Rules**:
- Last item uses `<span>` not `<a>`, with `.is-current`.
- Place at the top of page content, before the page title.

## 20. Alert / Inline Message (알림 메시지)

**CSS classes**:
- `.alert` — base (flex, padded, rounded)
- `.alert-success` / `.alert-info` / `.alert-warning` / `.alert-error` — color variants
- `.alert-icon` — left icon (20px)
- `.alert-content` — text area
- `.alert-title` — bold title line

**HTML structure**:
```html
<div class="alert alert-success">
  <span class="alert-icon">&#10003;</span>
  <div class="alert-content">
    <div class="alert-title">저장 완료</div>
    설정이 성공적으로 저장되었습니다.
  </div>
</div>
```

**Variants**: `alert-success` (green), `alert-info` (blue), `alert-warning` (amber), `alert-error` (red).

**Rules**:
- Use for persistent page-level messages (not dismissible popups — use toast for those).
- Always include `.alert-title` for scanability.
- Use semantic icon: checkmark for success, warning triangle for warning, X for error, i for info.

## 21. Skeleton / Loading (스켈레톤)

**CSS classes**:
- `.skeleton` — base (shimmer animation, 6px radius)
- `.skeleton-text` — text line placeholder (14px height)
- `.skeleton-heading` — heading placeholder (22px height, 40% width)
- `.skeleton-avatar` — circular placeholder (40px, border-radius 999px)
- `.skeleton-rect` — rectangular block placeholder (120px height)

**HTML structure**:
```html
<div class="skeleton skeleton-heading"></div>
<div class="skeleton skeleton-text"></div>
<div class="skeleton skeleton-text"></div>
<div class="skeleton skeleton-text" style="width:60%"></div>
```

**Rules**:
- Use to show layout structure while data loads.
- Match skeleton shapes to the actual content that will replace them.
- Respects `prefers-reduced-motion` — animation stops for users who prefer it.
- Combine with avatar for user list skeletons: flex row with `.skeleton-avatar` + text lines.
