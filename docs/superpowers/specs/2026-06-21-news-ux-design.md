# News Tab UX — Design Spec

**Date:** 2026-06-21  
**Scope:** `frontend/src` — News page, news components, news hooks  
**Status:** Approved

---

## Goal

Improve the News Tab UX across four axes: unique per-category color identity, smooth fade transitions on category switch, hover-triggered prefetching for instant navigation, and eliminating visible loading states when cached data is available. All existing functionality (API contracts, business logic, caching, filtering, sorting, SSE stream) is preserved.

---

## Decisions

| Question | Decision |
|---|---|
| Scroll on category switch | Reset to top with a clean fade — no crossfade of old content |
| Prefetch strategy | Hover-triggered only — prefetch fires when user hovers a tab |
| Color scope | Both filter tabs AND article-level category badges |

---

## New Files

### `src/lib/news/categoryColors.js`

A pure JS module (no React dependency) that exports a single `getCategoryColor(category)` function. Returns an object of inline-style-ready values: `{ text, border, bg, activeBg }`. Uses existing bloomberg color tokens from `tailwind.config.js` — no new tokens needed.

**Color assignments:**

| Category key | Color | Hex |
|---|---|---|
| `all` | white/neutral | `#e5e5e5` |
| `markets` | green | `#22c55e` |
| `world` | blue | `#3b82f6` |
| `macro` | amber | `#eab308` |
| `forex` | orange | `#f97316` |
| `crypto` | cyan | `#06b6d4` |
| `finance` | green | `#22c55e` |
| `tech` | blue | `#3b82f6` |
| `central_bank` | amber | `#eab308` |
| `regulatory` | red | `#ef4444` |
| `unknown` | muted | `#525252` (fallback) |

Each color entry exposes hex values with appropriate opacity variants for bg and border (12% opacity for bg, 60% for border). Inline styles are used rather than dynamic Tailwind class names to avoid purge issues.

### `src/lib/news/categoryPrefetch.js`

A plain JS module that exports one function:

```js
export function prefetchCategory(category, { windowDays = 7, limit = 100 } = {})
```

Calls the exported `loadGeneralNews` from `useGeneralNews.js`. Checks the module-level cache first — if data is fresh, returns immediately without a network call. If not, fires a background fetch. No return value consumed by callers; the side-effect is cache warm-up only.

Safe to call redundantly — `loadGeneralNews` already deduplicates in-flight requests via its `inflightRequests` map.

### `src/components/news/CategoryTransition.jsx`

A thin React wrapper component:

```jsx
export default function CategoryTransition({ categoryKey, children })
```

- Renders children inside a `key={categoryKey}` div with class `animate-fade-up` (already defined in `tailwind.config.js`: `opacity 0→1, translateY 12px→0, 0.4s ease`)
- A `useEffect` on `categoryKey` calls `window.scrollTo({ top: 0, behavior: 'instant' })` to reset scroll position on every category switch
- No old-content crossfade — old content disappears immediately, new content fades in (consistent with scroll-reset decision)

### `src/components/news/CategoryTransition.test.jsx`

Two tests:
1. Renders children correctly
2. When `categoryKey` prop changes, `window.scrollTo` is called with `{ top: 0, behavior: 'instant' }`

---

## Modified Files

### `src/hooks/useGeneralNews.js`

**Change:** Export `loadGeneralNews` so `categoryPrefetch.js` can import it.

```js
// Before
async function loadGeneralNews(...)

// After
export async function loadGeneralNews(...)
```

One line changed. No behavioral change.

### `src/components/news/NewsFilterBar.jsx`

**Changes:**
1. Import `prefetchCategory` from `categoryPrefetch.js` and `getCategoryColor` from `categoryColors.js`
2. Add `onMouseEnter={() => prefetchCategory(item.key)}` to each tab `<Button>`
3. Replace hardcoded `bloomberg-orange` class strings with inline styles derived from `getCategoryColor(item.key)`. Since hover states cannot be expressed with inline styles alone, each tab tracks hover via `onMouseEnter`/`onMouseLeave` with local `useState(false)`. Conditional inline styles are then computed from `(isActive, isHovered)`:
   - Active: category `text`, `border`, `activeBg` colors
   - Hovered (inactive): category `text`, `border`, 10% opacity bg
   - Default (inactive, not hovered): muted text, dark bg, muted border
4. Existing `onChange` guard (`if (selectedCategory !== item.key)`) stays in place

**Tests to add in `NewsFilterBar.test.jsx`:**
- `onMouseEnter` fires and `prefetchCategory` is called with the correct category key (mock `categoryPrefetch.js`)
- Active tab renders with the correct inline color for spot-checked categories (e.g., `markets` → green, `crypto` → cyan)

### `src/components/news/NewsRow.jsx`

**Change:** Import `getCategoryColor` and apply category-specific color to the category badge span using inline styles.

The badge currently hardcodes `text-bloomberg-orange border-bloomberg-orange/60`. These become dynamic:
```jsx
const color = getCategoryColor(normalizeCategory(article.category));
// applied as style={{ color: color.text, borderColor: color.border, backgroundColor: color.bg }}
```

The `normalizeCategory` function already exists in the file and handles aliases and unknown values.

**Tests to add in `NewsRow.test.jsx`:**
- Category badge renders with crypto-specific color when `article.category = 'crypto'`
- Category badge renders with regulatory-specific color when `article.category = 'regulatory'`
- Unknown category falls back to muted color

### `src/pages/News.jsx`

**Change:** Wrap the skeleton/content block (everything below `<NewsFilterBar>`) inside `<CategoryTransition categoryKey={category}>`.

```jsx
// Before
<NewsFilterBar ... />
{showSkeleton ? <NewsListSkeleton /> : <>...</>}

// After
<NewsFilterBar ... />
<CategoryTransition categoryKey={category}>
  {showSkeleton ? <NewsListSkeleton /> : <>...</>}
</CategoryTransition>
```

`NewsFilterBar` stays outside the wrapper so the tabs never re-animate on switch.

---

## What Is Not Changed

- `useGeneralNews` hook signature, cache system, TTLs, backoff logic
- `useGeneralNewsStream` SSE connection and reconnect logic
- `NewsList`, `NewsListSkeleton` component interfaces
- Backend API contracts
- News deduplication, sorting, filtering logic
- Existing category structure (no new categories added)
- `NewsTab.jsx` (ticker-specific news in analysis results — out of scope)
- Report disclaimer

---

## File Map

```
src/
  lib/news/
    categoryColors.js          ← NEW
    categoryPrefetch.js        ← NEW
  components/news/
    CategoryTransition.jsx     ← NEW
    CategoryTransition.test.jsx ← NEW
    NewsFilterBar.jsx          ← MODIFIED (hover prefetch + per-category colors)
    NewsRow.jsx                ← MODIFIED (per-category badge colors)
  hooks/
    useGeneralNews.js          ← MODIFIED (export loadGeneralNews)
  pages/
    News.jsx                   ← MODIFIED (wrap content in CategoryTransition)
```

---

## Success Criteria

- Category switching feels instant when hovering before clicking
- No skeleton flash when switching to a cached category
- Smooth fade-in on every category switch, scroll resets to top
- Each filter tab shows its unique color when active
- Each article badge color matches its category
- All existing tests pass without modification
- New tests cover prefetch invocation, color rendering, and scroll reset
