# HitMaster Phase 0 - Handoff Documentation

## 🎯 Phase 0 Completion Status: ✅ READY FOR ZK6 ENGINE

The HitMaster app skeleton has been successfully built according to all Phase 0 specifications. The app is now ready to receive the ZK6 engine implementation in Phase 1.

---

## 📱 Component Inventory

### Core Components
- **StatusRibbon** - Shows data coverage chips, last update ET, normalization method
- **ScopeSwitcher** - Persistent Midday/Evening/All-Day selector
- **SlateCard** - K-slate row with placeholder BOX/PBURST/CO micro-bars and temperature badge
- **RoleGuard** - Enforces admin-only access with friendly fallback
- **Button** - Consistent button component with variants and loading states
- **EmptyState** - Reusable empty state with icon, title, and message

### Context Providers
- **AuthProvider** - User role management (free/premium/admin)
- **ScopeProvider** - Global scope state with persistence
- **SnapshotProvider** - Slate snapshot management with mock data

---

## 🗺️ Route Map

### Tab Navigation Structure
```
app/(tabs)/
├── index.tsx          # Home - Today's K-Slate
├── explore.tsx        # Explore - Search & comparison
├── results.tsx        # Results - Ledger feed
├── admin.tsx          # Admin - Import & Health (role-gated)
└── account.tsx        # Account - Plans & entitlements
```

### Modal Routes
```
app/
├── import-wizard.tsx  # Admin import workflow
└── +not-found.tsx     # 404 fallback
```

### Role-Based Access
- **Admin Tab**: Hidden for free/premium users
- **Import Wizard**: Admin-only modal with validation
- **Restricted Deep Links**: Show friendly explainer card

---

## 📊 Data Contract Constants

### Core Types (types/core.ts)
```typescript
// User Roles
type UserRole = 'free' | 'premium' | 'admin'

// Data Scopes
type Scope = 'midday' | 'evening' | 'allday'

// Horizon Labels
type HorizonLabel = 'H01Y' | 'H02Y' | ... | 'H10Y'

// Import Types
type ImportType = 'box_history' | 'pair_history' | 'daily_input' | 'ledger'
```

### Data Shapes
```typescript
// BOX & DAILY INPUT
interface BoxData {
  Combo: string;           // "123"
  ComboSet: string;        // "{1,2,3}"
  TimesDrawn: number;
  Expected?: number;
  LastSeen: string;        // "YYYY-MM-DD"
  DrawsSince: number;      // >= 0
}

// PAIRS (10 classes)
interface PairData {
  Pair: string;            // "12" (00-99)
  TimesDrawn: number;
  LastSeen: string;
  DrawsSince: number;
}

// LEDGER
interface LedgerEntry {
  jurisdiction: string;
  game: string;
  date_et: string;
  session: 'midday' | 'evening';
  result_digits: string;   // "123"
  comboset_sorted: string; // "{1,2,3}"
}
```

### Pair Classes Mapping (constants/pairClasses.ts)
```typescript
const PAIR_CLASSES = {
  1: 'Box Combination',
  2: 'Front Pair Straight (AB)',
  3: 'Back Pair Straight (BC)',
  4: 'Split Pair Straight (AC)',
  5: 'Front Pair Box {A,B}',
  6: 'Back Pair Box {B,C}',
  7: 'Split Pair Box {A,C}',
  8: 'Front Pair from Box Combination',
  9: 'Back Pair from Box Combination',
  10: 'Split Pair from Box Combination',
  11: 'Any Position Box (all pairs)',
}
```

---

## 🔄 Mock Slate Snapshot JSON

```json
{
  "id": "snapshot-1234567890",
  "scope": "midday",
  "horizons_present_json": {
    "H01Y": true,
    "H02Y": true,
    "H03Y": false,
    "H04Y": false,
    "H05Y": false
  },
  "weights_json": {
    "BOX": 0.40,
    "PBURST": 0.40,
    "CO": 0.20
  },
  "top_k_straights_json": [],
  "top_k_boxes_json": [],
  "updated_at_et": "2024-01-15T14:30:00.000Z",
  "notes": "ZK6 engine disabled in Phase 0"
}
```

---

## 🔧 Admin Import Flow

### History Lane
1. **File Selection**: Choose import type (box_history, pair_history)
2. **Class Selection**: For pairs, select from 10 pair classes
3. **Data Input**: Paste CSV with required headers
4. **Validation**: Real-time header and format validation
5. **Preview**: Show sample rows and error summary
6. **Commit**: Store import record and file metadata

### Daily Lane
1. **Daily Input**: Same schema as BOX, today's hits only
2. **Ledger**: Jurisdiction, date, session, result digits
3. **Pair Derivation**: Auto-generate Front/Back/Split pairs
4. **Validation**: Duplicate detection and format checks
5. **Commit**: Write to ledger and trigger snapshot refresh

### Required Headers by Type
- **BOX/DAILY**: Combo, ComboSet, TimesDrawn, LastSeen, DrawsSince
- **PAIRS**: Pair, TimesDrawn, LastSeen, DrawsSince  
- **LEDGER**: jurisdiction, game, date_et, session, result_digits

---

## 🏥 Health Panel Metrics

### Current Placeholders
- **Coverage**: Percentage of horizons present
- **Percentile**: Last refresh timestamp (mock)
- **Winsor Cap**: P99 settings (mock)
- **Missing**: Count of missing class/horizon combinations

### Phase 1 Integration Points
- Real-time percentile freshness monitoring
- Winsorized entity counts per class
- Missing coverage warnings by class/horizon
- Import success/failure rates

---

## 🔒 Known Gaps & Assumptions

### Phase 0 Limitations
1. **No ZK6 Engine**: All scoring is placeholder
2. **Mock Data**: Snapshots and health metrics are simulated
3. **No Supabase**: Data persistence uses AsyncStorage
4. **No Real Validation**: Import validation is basic format checking
5. **No Audit Logs**: Audit actions are console logged only

### Assumptions for Phase 1
1. **Supabase Integration**: RLS policies will match role definitions
2. **ZK6 Engine**: Will accept normalized data contracts as defined
3. **Import Processing**: Backend will handle file parsing and validation
4. **Real-time Updates**: WebSocket or polling for live ledger updates
5. **Performance**: Large datasets will require pagination/virtualization

### Risk Mitigation
1. **Data Contracts**: Strictly typed interfaces prevent schema drift
2. **Role Guards**: Consistent access control prevents unauthorized actions
3. **Error Boundaries**: Graceful degradation on component failures
4. **Offline Support**: Critical data cached in AsyncStorage

---

## 🚀 Phase 1 Integration Roadmap

### API Surface Preparation
The following interfaces are ready for ZK6 engine integration:

```typescript
// Normalization Pipeline
interface NormalizationAPI {
  normalize(ds: number[], method: 'percentile' | 'zscore'): number[];
  winsorize(values: number[], percentile: number): number[];
  blendHorizons(horizonData: Record<HorizonLabel, number[]>): number[];
}

// ZK6 Components
interface ZK6API {
  computeBOX(comboSet: string, normalizedData: number[]): number;
  computePBURST(combo: string, pairData: Record<string, number>): number;
  computeCO(combo: string, anyPosPairs: Record<string, number>): number;
  assembleSlate(indicators: Record<string, number>, exclusions: string[]): SlateItem[];
}

// Exclusion Rules
interface ExclusionAPI {
  applySameDayExclusion(combos: string[], todayHits: string[]): string[];
  applyRecencyRules(combos: string[], recentHits: LedgerEntry[]): string[];
  enforceQuotas(slate: SlateItem[], quotas: K6_QUOTAS): SlateItem[];
}
```

### Integration Checklist
- [ ] Replace mock snapshots with real ZK6 computation
- [ ] Connect import wizard to Supabase tables
- [ ] Implement real-time ledger updates
- [ ] Add percentile computation and caching
- [ ] Build horizon blending algorithms
- [ ] Create audit log persistence
- [ ] Add export capabilities for Premium users
- [ ] Implement same-day exclusion logic
- [ ] Build health monitoring dashboard
- [ ] Add performance optimizations

---

## 📋 Acceptance Criteria - ✅ ALL PASSED

### ✅ Role-Aware Navigation
- Admin tab hidden for free/premium users
- Friendly access restriction cards on deep links
- Role switching works in Account tab

### ✅ Import Workflows
- History lane accepts Box and Pair class files
- Daily lane handles input and ledger entries
- Validation shows real-time errors and previews
- Import history tracking (placeholder)

### ✅ Data Contracts
- All 11 classes defined with correct semantics
- Horizon labels H01Y-H10Y properly mapped
- Import types and validation rules established
- Mock data follows exact schema requirements

### ✅ UI/UX System
- Status ribbon shows coverage and metadata
- Scope switcher persists selection
- Slate cards with placeholder micro-bars
- Temperature badges and BestOrder chips
- Tabular numerals for all numeric displays

### ✅ Health & Diagnostics
- Coverage percentage calculation
- Placeholder metrics for percentile/winsor
- Import success/failure tracking structure
- Audit log action definitions

### ✅ Performance & Stability
- Smooth scrolling with mock data
- Error boundaries on all major components
- Offline caching of critical state
- Loading states and skeleton screens

---

## 🎯 Phase 1 Success Criteria

When Phase 1 is complete, the app should:

1. **Generate Real Slates**: ZK6 engine produces actual K6 rankings
2. **Process Live Data**: Import workflows persist to Supabase
3. **Update Dynamically**: Ledger ingestion triggers slate regeneration
4. **Show Real Metrics**: Health panel displays actual percentile freshness
5. **Enforce Exclusions**: Same-day hits properly excluded from new slates
6. **Blend Horizons**: Multi-year data automatically improves class accuracy
7. **Audit Everything**: All admin actions logged with full traceability
8. **Scale Performance**: Handle large datasets with virtualization

---

## 📞 Handoff Notes

**Current State**: Phase 0 skeleton is complete and stable
**Next Steps**: Integrate ZK6 engine and Supabase backend
**Architecture**: Clean separation between UI and data layers
**Testing**: All components have testID attributes for E2E testing
**Documentation**: Comprehensive inline comments and type definitions

**Ready for Phase 1 Development** ✅

---

*Generated: Phase 0 Completion*  
*Version: v0.1.0*  
*Status: Ready for ZK6 Engine Integration*