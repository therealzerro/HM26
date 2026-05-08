# HitMaster UI/UX Design Blueprint

This document defines the core visual and structural system for HitMaster. You can import these specifications into Figma to build your design file.

## 1. Design System Tokens (The "DNA")

### Color Palette
*   **Primary (Action/Frequency):** `#007AFF` (Blue)
*   **Secondary (Momentum):** `#FF3B30` (Rose)
*   **Tertiary (Pattern):** `#5856D6` (Indigo)
*   **Quaternary (Consistency):** `#FFCC00` (Gold)
*   **Background (Surface):** `#121212` (Dark Grey)
*   **Surface Light:** `#1E1E1E` (Lighter Grey)
*   **Text Primary:** `#FFFFFF`
*   **Text Secondary:** `#A0A0A0`
*   **Text Tertiary:** `#666666`

### Typography (System: Courier or Monospaced)
*   **H1 (Header):** 24pt, Bold
*   **H2 (Subheader):** 18pt, Semibold
*   **Body:** 14pt, Regular
*   **Small/Data:** 9pt, Bold (Used in SignalBars)

---

## 2. Core Components

### SignalBar
*   **Purpose:** Visualize 0–1 data values (Frequency, Momentum, Pattern).
*   **Properties:** Label (60px width), Track (4px height, background #1E1E1E), Fill (height 100%, background = color, width = pct), Value Text (22px width).
*   **States:** Default.

### SlateCard
*   **Purpose:** Display generated slate combos.
*   **Layout:**
    *   Header: Rank, Confidence, Energy.
    *   Body: 3-digit combo display.
    *   Footer: SignalBars (Box, Pburst, CO, DGC).

---

## 3. Screen Layouts

### Dashboard (Tabs)
*   **Navigation:** Bottom Tab Bar (Account, Results, Explore, Intelligence, Learn).
*   **Content:**
    *   Header: StatusRibbon (Shows current engine version, scope).
    *   Body: EmptyState or GeneratedSlates list.

### Slate Builder/Explorer
*   **Layout:**
    *   Top Bar: ScopeSwitcher (Midday, Evening, Allday).
    *   Center: Scrollable list of `SlateCard` components.
    *   Controls: Floating Action Button (FAB) for "Regen".

### Results View
*   **Header:** Date/Jurisdiction display.
*   **Table:** Sorted list of results with hit indicators.
*   **Detail Modal:** `PickDetailModal` when tapping a result.

---

## 4. Implementation Notes for Figma
*   **Grids:** Use an 8px base grid for spacing.
*   **Corner Radii:** 8px for containers (Cards, Modals), 2px for track bars.
*   **Layers:** Use auto-layout for all components to match React Native `StyleSheet` logic.
