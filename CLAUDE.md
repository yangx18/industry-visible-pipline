# 工业效率流水线工具 (Industrial Efficiency Pipeline Tool)

## Project Overview

A visual pipeline tool for industrial teams to track cost-reduction and efficiency progress.
Drawable node graph, zero install, offline-capable.
See @DESIGN.md for the full design doc and @README.md for project intro.

## Architecture — Multi-File (no build step)

Three plain files served together. Open `index.html` directly from disk (file://) or via any
static server. No bundler, no framework, no external CDN dependencies.

```
repo/
├── index.html       # Shell: markup, <link> to CSS, <script> to JS, demo data
├── pipeline.css     # All styles — theming, layout, node/arrow/canvas visuals
├── pipeline.js      # All logic — state, rendering, drawing engine, storage
├── DESIGN.md        # Design document (Chinese)
└── README.md        # GitHub-facing intro
```

> **Portability rule**: the three files must always be shipped together. Keep them in the same
> directory so relative paths (`./pipeline.css`, `./pipeline.js`) always resolve.

## Core Concepts

- **Pipeline**: a directed graph rendered on an SVG/Canvas overlay; nodes are positioned freely
- **Nodes**: each has name, owner, weight, locked flag, position (x, y), and a task pool
- **Arrows**: SVG `<line>` or `<path>` elements with prominent arrowheads connecting nodes in order
- **Subtasks**: each has text, weight, and done (checkbox) state
- **Progress**: weighted calculation at node and global level
- **Owner Profile**: each node owner has a profile panel (name, dept, avatar, contact)
- All state persists in `localStorage` under key `pipeline_state`

## Progress Calculation

```
Node progress   = Σ(completed task weights) / Σ(all task weights in node)
Global progress = Σ(node progress × node weight) / Σ(all node weights)
```

Weights auto-normalize — they don't need to sum to 100.

---

## Drawable Pipeline — Design Rules

### Interaction Model

| Action | How |
|--------|-----|
| **Add node before/after** | Click `＋` handle that appears on the left or right edge of any node |
| **Reorder nodes** | Drag a node card; arrows redraw in real time via SVG |
| **Delete node** | Hover → trash icon (middle nodes only; head/tail locked) |
| **Edit node name / owner** | Double-click the field in-place |
| **Edit project name** | Click the project title in the header — becomes an `<input>` |
| **Edit project owner** | Click the owner name chip in the header — becomes an `<input>` |

### Arrows (Connection Lines)

- Rendered as SVG `<path>` elements overlaid on the pipeline canvas
- **Stroke**: `4 px`, color `#2563EB` (blue-600) for active connections; `#94A3B8` (slate-400) for inactive
- **Arrowhead**: `<marker>` with a filled solid triangle, size `12×10 px` — never just a line end
- Arrow curves slightly (cubic bezier) when nodes are not horizontally aligned
- Arrows animate a "flow pulse" (stroke-dashoffset keyframe) to signal live progress

### Node Visual States

| State | Border color | Background | Icon |
|-------|-------------|------------|------|
| Pending (0 %) | `#94A3B8` slate | `#F8FAFC` | ⏸ |
| In progress (1–99 %) | `#2563EB` blue | `#EFF6FF` | ▶ |
| Complete (100 %) | `#16A34A` green | `#F0FDF4` | ✓ |

Never rely on color alone — always show the icon + percentage text.

---

## Owner Profile

### Clickable Avatar

Every node's owner chip (avatar initials + name) is a `<button>` that opens a slide-in
**owner profile panel** (right-side drawer, `320 px` wide).

### Profile Panel Fields

```
┌─────────────────────────┐
│  [Avatar 64px]           │
│  姓名  Zhang Wei         │
│  部门  总部运营           │
│  职位  降本增效总负责人   │
│  联系  zhangwei@co.com   │
│  负责节点  [tag] [tag]   │
└─────────────────────────┘
```

- Panel slides in from the right with a CSS `transform: translateX` transition (`200 ms ease`)
- Clicking outside or pressing `Escape` closes it
- Owner data is stored in the `owners` map in state (keyed by `ownerName`)

---

## Editable Project Header

The top header bar contains two inline-editable fields:

| Field | Element | Trigger |
|-------|---------|---------|
| Project name (项目名称) | `<h1 contenteditable>` or swap to `<input>` on click | Single click |
| Project owner (总负责人) | Chip with `<button>` → `<input>` on click | Single click |

- On blur or `Enter` key: validate (non-empty), save to state, persist to localStorage
- On `Escape`: revert to previous value
- Empty value is not allowed — revert and shake animation

---

## Code Standards

### HTML (`index.html`)

- Semantic shell: `<main>`, `<header>`, `<nav>`, `<aside>` (profile drawer)
- `<link rel="stylesheet" href="./pipeline.css">` in `<head>`
- `<script src="./pipeline.js" defer></script>` before `</body>`
- `<template>` elements for node card, task row, and profile panel markup
- `<noscript>` fallback message
- Inline SVG `<defs>` block for the arrowhead `<marker>` definition
- Keep DOM nesting ≤ 4 levels

### CSS (`pipeline.css`)

- CSS custom properties at `:root` for theming (colors, spacing, radii, transitions)
- CSS Grid for the pipeline canvas layout; Flexbox for card internals
- BEM-like naming: `pipeline__canvas`, `pipeline__node`, `node__header`, `node__task`,
  `task--done`, `profile-drawer`, `profile-drawer--open`
- Arrow SVG sits in a `<svg class="pipeline__arrows">` that is `position: absolute`,
  `pointer-events: none`, sized to match the canvas scroll area
- Mobile: canvas scrolls horizontally; nodes stack if `width < 480 px`
- No external fonts or icon sets — use Unicode glyphs or inline SVG icons
- Color-blind safe: every state has text label + icon in addition to color

### JavaScript (`pipeline.js`)

Wrap everything in an IIFE. Organize with comment headers in this order:

1. **Constants & Config** — IDs, defaults, schema version, localStorage key
2. **State** — single `state` object; mutate only via dedicated `setState` / action functions
3. **Storage** — `loadState()` / `saveState()` with try/catch; JSON.parse safety; migration shim
4. **Drawing Engine** — node drag, `＋` insertion handles, arrow path calculation (`getArrowPath`)
5. **Owner Registry** — `owners` map CRUD, profile panel open/close
6. **DOM Helpers & Rendering** — `renderPipeline()`, `renderNode()`, `renderArrows()`, `renderProgress()`
7. **Inline Edit** — project name / owner edit handlers (click → input → blur/enter/escape)
8. **Event Handlers** — delegated listeners on `#pipeline-canvas` and `#profile-drawer`
9. **Initialization** — `DOMContentLoaded`, load state, render, attach listeners

Rules:
- No `innerHTML` for user-provided content — use `textContent` or DOM API
- No `eval()`, no `Function()` constructor
- Use `CustomEvent` for cross-module signals (e.g., `pipeline:node-added`)
- All timestamps ISO 8601, UTC

### localStorage

- Single key: `pipeline_state`
- Wrap `setItem` in try/catch for `QuotaExceededError`
- Wrap `JSON.parse` in try/catch with fallback to default demo state
- `schemaVersion` field for future migrations
- Activity log capped at 100 entries (FIFO)
- `lastModified` timestamp for debugging

---

## Data Structure

```js
{
  schemaVersion: 2,
  projectName: "Q1 降本增效专项",
  owner: "张伟",

  owners: {                              // keyed by ownerName
    "张伟": {
      name: "张伟",
      dept: "总部运营",
      title: "降本增效总负责人",
      email: "zhangwei@company.com",
      avatarColor: "#2563EB"             // background for initials avatar
    }
  },

  nodes: [
    {
      id: "node-1",
      name: "总部指挥",
      ownerName: "张伟",
      weight: 2,
      locked: true,                      // head node — cannot delete
      position: { x: 60, y: 200 },      // canvas coordinates (px)
      tasks: [
        { id: "task-1a", text: "制定季度 KPI 体系", weight: 1, done: false },
        { id: "task-1b", text: "跨部门预算审批",    weight: 2, done: true  }
      ]
    }
    // middle nodes (user-drawn, insertable before/after any node) ...
    // tail node: locked: true
  ],

  edges: [                               // ordered connection list
    { from: "node-1", to: "node-2" },
    { from: "node-2", to: "node-3" }
  ],

  activityLog: [                         // max 100 entries (FIFO)
    { taskId, taskText, nodeName, time, done }
  ],

  lastModified: "2026-03-15T10:32:00Z"
}
```

First open: `localStorage` is empty → load built-in demo data.
Head and tail nodes: `locked: true` (cannot be deleted or moved to non-terminal position).

---

## User Roles (honor system — no auth)

| Role | Can do |
|------|--------|
| 总负责人 (Owner) | Draw/add/remove nodes, set weights, assign owners, edit project header |
| 节点负责人 (Node Owner) | Add/remove subtasks in their node, set subtask weights |
| 普通成员 (Member) | Check/uncheck subtask checkboxes, view owner profiles |

---

## Key Constraints

- No frameworks (React, Vue, etc.) — vanilla JS only
- No build step — open `index.html` directly, works offline
- Three files must stay co-located (no absolute paths or CDN URLs)
- Keep total size under 2 MB (all three files combined)
- Must work in Chrome, Firefox, Safari, Edge (modern versions)
- Chinese language UI
- Inline all assets as SVG or CSS — no external images or icon fonts

---

## Git Workflow

- Branch naming: `feature/`, `fix/`, `chore/` prefixes
- Commit messages: imperative mood, under 72 chars
- Most commits touch all three files — commit message should describe what changed *functionally*

---

## Feature Checklist (v0.2)

### Must Have
- [ ] Drawable pipeline canvas — drag nodes, `＋` insertion before/after any node
- [ ] Conspicuous SVG arrows with filled arrowheads and flow-pulse animation
- [ ] Node visual states (pending / in-progress / complete) with color + icon + %
- [ ] Inline-editable project name and owner in header
- [ ] Clickable owner avatar → slide-in profile drawer
- [ ] Owner registry (`owners` map) with name, dept, title, email, avatarColor
- [ ] Global weighted progress bar (real-time)
- [ ] Node weight editing with auto-normalization
- [ ] Subtask add/remove per node
- [ ] Subtask weight editing with auto-normalization
- [ ] Subtask checkbox → progress recalculation → localStorage save
- [ ] Activity log (max 100 entries)
- [ ] First-open demo data

### Should Have
- [ ] Reset progress button (clears checkboxes, keeps structure)
- [ ] Undo last action (single-level)
- [ ] Keyboard accessibility (Tab, Enter, Escape for all interactive elements)

### Out of Scope (this version)
- Multi-user real-time sync
- Auth / permission enforcement
- Export / reporting

---

## Common Pitfalls to Avoid

- Don't use `innerHTML` for user content — XSS risk
- Don't store sensitive data in localStorage
- Don't assume localStorage is available (incognito mode)
- Don't use color alone for state — always add icon + text (8 % of men are color-blind)
- Don't let the activity log grow unbounded — FIFO cap at 100
- Don't break the update chain: checkbox → node progress → global progress → render → save
- Don't hardcode pixel positions for arrows — recalculate from node `position` on every render
- Don't forget to redraw arrows after node drag ends (use `pointerup` + `renderArrows()`)
