# HitMaster Layout Specifications & Real Data Examples

Use these metrics to refine your Figma "True Layout" implementation. These are extracted directly from the application's stylesheet and data model.

## 1. SlateCard Component Metrics (Auto-Layout Rules)

### Component Bar System (Signal Bars)
*   **Total Width:** 100% of container width (minus padding).
*   **Bar Container:** `height: 4px`, `gap: 6px`.
*   **Label:** `width: 60px`, `fontSize: 9pt`, `color: #666`.
*   **Fill Bar:** `width: (value * 60)px` (max width constraint), `borderRadius: 2px`.
*   **Value Text:** `width: 22px`, `fontSize: 9pt`, `fontWeight: 700`.

### Container Structure
*   **Container Padding:** `12px` (horizontal), `8px` (vertical).
*   **Gap between elements:** `8px` (standard vertical gap).
*   **Rank Container:** `width: 32px`, `paddingRight: 8px`.

---

## 2. Real Data Payload Example
When designing your Figma frames, use this JSON payload to simulate realistic UI states:

```json
{
  "rank": 1,
  "combo": "742",
  "comboSet": "{2,4,7}",
  "temperature": 75,
  "multiplicity": "singles",
  "topPair": "24",
  "components": {
    "BOX": 0.82,
    "PBURST": 0.65,
    "CO": 0.45,
    "DGC": 0.91
  }
}
```

## 3. UI State Simulation
*   **Temperature Color Mapping:**
    *   `>= 80`: Error (#FF3B30)
    *   `>= 60`: Warning (#FFCC00)
    *   `>= 40`: Success (#34C759)
    *   `< 40`: Tertiary (#666666)

## 4. Figma Tips for Real Data
1.  **Use Component Properties:** Create a variant of `SlateCard` for `placeholder` vs `live` states.
2.  **Auto-Layout Constraints:** Set the fill bar to `Fill Container` (horizontal) to handle varying screen widths dynamically, following the `value * 60px` logic for relative sizing.
3.  **Typography:** Ensure you are using `Courier` or your selected Monospaced font for all data numeric values to prevent "jumping" when numbers change.
