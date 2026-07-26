// app/(tabs)/book.tsx — Number Book (BOOK-01 redesign, 2026-07-26)
//
// Mobile-first single-pane rebuild of the old 220px-sidebar master-detail
// layout (docs/design_scope_2026-07-26_book.md). Two views in one route:
// index (list of lists) ⇄ detail, switched on `activeId` — same in-file
// pattern learn.tsx uses. Storage schema (`number_book_lists`,
// `saved_slates`) is unchanged; existing lists load as-is.

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens, type ShadowTokens } from '@/lib/theme';
import { storage } from '@/lib/storage';
import { confirmAsync } from '@/lib/confirm';
import { HeatCheckModal } from '@/components/HeatCheckModal';
import { EmptyState } from '@/components/EmptyState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionTitle } from '@/components/SectionTitle';
import { ScopeSegment } from '@/components/ScopeSegment';
import { scopeAccent } from '@/lib/scopeAccent';
import { heatTier } from '@/lib/theme/heat';
import {
  BookOpen, Plus, Star, Trash2, Flame, ChevronLeft, ChevronRight,
  GraduationCap, Sparkles, Zap, Lock, MapPin, Target,
} from 'lucide-react-native';
import { useSavedHits } from '@/hooks/useSavedHits';
import { JURISDICTION_GROUPS } from '@/hooks/useFollowedStates';
import { fetchFromSupabase } from '@/lib/supabase';
import { getTodayET } from '@/lib/dateUtils';

function toSet(combo: string) {
  return '{' + combo.split('').sort().join(',') + '}';
}

function daysAgo(dateEt: string): string {
  const today = getTodayET();
  if (dateEt === today) return 'today';
  const diff = Math.round((Date.parse(today) - Date.parse(dateEt)) / 86400000);
  if (diff === 1) return 'yesterday';
  return `${diff}d ago`;
}

const SCOPE_LABEL: Record<string, string> = { midday: 'Midday', evening: 'Evening', allday: 'All Day' };

const COMING_FEATURES = [
  { title: 'Slate by State', desc: 'Filter today\'s K6 Slate to only your selected states.' },
  { title: 'Straight-Arrangement Slate', desc: 'Dedicated straight-only intelligence slate powered by ZK6.' },
  { title: '4-digit Box', desc: '4-digit box intelligence — ZK6 expanding to 4-digit analysis.' },
  { title: '4-digit Straight', desc: '4-digit straight slate signals with optimal arrangement.' },
];

interface ComboItem { combo: string; note: string; starred: boolean; energy?: number; hitBox?: boolean; hitStraight?: boolean; }
interface BookList { id: string; name: string; scope: string; states: string[]; combos: ComboItem[]; type?: 'custom' | 'saved_slate'; savedAt?: string; }

// ─── State picker chips (shared by create + edit) ────────────────────────────
function StateChips({ selected, onToggle }: { selected: string[]; onToggle: (code: string) => void }) {
  const { colors } = useTheme();
  return (
    <View>
      {JURISDICTION_GROUPS.map(g => (
        <View key={g.label} style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 9, fontWeight: '800', color: colors.textTertiary, letterSpacing: 1, marginBottom: 5, textTransform: 'uppercase' }}>{g.label}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
            {g.codes.map(code => {
              const on = selected.includes(code);
              return (
                <TouchableOpacity
                  key={code}
                  onPress={() => onToggle(code)}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, borderWidth: 1,
                    borderColor: on ? colors.primary + theme.alpha.border : colors.border,
                    backgroundColor: on ? colors.primaryLight : 'transparent',
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${code}${on ? ', selected' : ''}`}
                >
                  <Text style={{ fontSize: 11, fontWeight: on ? '800' : '600', color: on ? colors.primary : colors.textSecondary }}>{code}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Create List Modal ────────────────────────────────────────────────────────
function CreateListModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, scope: string, states: string[]) => void }) {
  const { colors, shadows } = useTheme();
  const m = useMemo(() => makeM(colors, shadows), [colors, shadows]);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'midday' | 'evening' | 'allday'>('allday');
  const [states, setStates] = useState<string[]>([]);
  const [showStates, setShowStates] = useState(false);

  const toggleState = (code: string) =>
    setStates(prev => prev.includes(code) ? prev.filter(x => x !== code) : [...prev, code]);

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={m.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={m.card} onPress={() => {}}>
          <Text style={m.title}>Create New List</Text>
          <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
            <TextInput
              style={[m.input, name ? { borderColor: colors.primary } : {}]}
              value={name}
              onChangeText={setName}
              placeholder="List name (e.g. NY Evening Signals)"
              placeholderTextColor={colors.textTertiary}
            />
            <ScopeSegment value={scope} onChange={setScope} size="compact" style={{ marginBottom: 12 }} />
            <TouchableOpacity
              style={m.statesRow}
              onPress={() => setShowStates(v => !v)}
              accessibilityRole="button"
              accessibilityLabel="Choose states"
            >
              <MapPin size={14} color={colors.textSecondary} />
              <Text style={{ flex: 1, fontSize: 12, color: colors.textSecondary, fontWeight: '600' }}>
                {states.length === 0 ? 'States: all (tap to choose)' : `States: ${states.join(', ')}`}
              </Text>
              <ChevronRight size={14} color={colors.textTertiary} style={{ transform: [{ rotate: showStates ? '90deg' : '0deg' }] }} />
            </TouchableOpacity>
            {showStates && <View style={{ marginBottom: 12 }}><StateChips selected={states} onToggle={toggleState} /></View>}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            <TouchableOpacity
              style={[m.btn, { backgroundColor: colors.primary, opacity: name.trim() ? 1 : 0.5 }]}
              onPress={() => { if (name.trim()) onCreate(name.trim(), scope, states); }}
              disabled={!name.trim()}
            >
              {/* white-on-primary: intentional in both modes (LIGHT-01) */}
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Create List</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[m.btn, { backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.border }]} onPress={onClose}>
              <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Edit States Modal (detail header → tap the state tags) ──────────────────
function EditStatesModal({ initial, onClose, onSave }: { initial: string[]; onClose: () => void; onSave: (states: string[]) => void }) {
  const { colors, shadows } = useTheme();
  const m = useMemo(() => makeM(colors, shadows), [colors, shadows]);
  const [states, setStates] = useState<string[]>(initial);
  const toggleState = (code: string) =>
    setStates(prev => prev.includes(code) ? prev.filter(x => x !== code) : [...prev, code]);

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={m.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={m.card} onPress={() => {}}>
          <Text style={m.title}>List States</Text>
          <Text style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 12 }}>
            Tag this list to the states you follow. Leave empty for all states.
          </Text>
          <ScrollView style={{ maxHeight: 380 }}>
            <StateChips selected={states} onToggle={toggleState} />
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <TouchableOpacity style={[m.btn, { backgroundColor: colors.primary }]} onPress={() => onSave(states)}>
              {/* white-on-primary: intentional in both modes (LIGHT-01) */}
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[m.btn, { backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.border }]} onPress={onClose}>
              <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Add Number Modal ─────────────────────────────────────────────────────────
function AddNumberModal({ onClose, onAdd }: { onClose: () => void; onAdd: (combo: string, note: string) => void }) {
  const { colors, shadows } = useTheme();
  const m = useMemo(() => makeM(colors, shadows), [colors, shadows]);
  const [combo, setCombo] = useState('');
  const [note, setNote] = useState('');
  const valid = /^\d{3}$/.test(combo);

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={m.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={m.card} onPress={() => {}}>
          <Text style={m.title}>Add Number</Text>
          <TextInput
            style={[m.comboInput, valid ? { borderColor: colors.primary } : {}]}
            value={combo}
            onChangeText={t => setCombo(t.replace(/\D/g, '').slice(0, 3))}
            placeholder="3 digits"
            placeholderTextColor={colors.textTertiary}
            keyboardType="numeric"
            maxLength={3}
          />
          <TextInput
            style={[m.input, { marginBottom: 14 }]}
            value={note}
            onChangeText={setNote}
            placeholder="Note (optional)"
            placeholderTextColor={colors.textTertiary}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[m.btn, { backgroundColor: colors.primary, opacity: valid ? 1 : 0.5 }]}
              onPress={() => { if (valid) onAdd(combo, note); }}
              disabled={!valid}
            >
              {/* white-on-primary: intentional in both modes (LIGHT-01) */}
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Add Number</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[m.btn, { backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.border }]} onPress={onClose}>
              <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const makeM = (colors: ColorTokens, shadows: ShadowTokens) => StyleSheet.create({
  // scrim stays dark in both modes (LIGHT-01) — indigo-tinted full-screen modal backdrop
  backdrop: { flex: 1, backgroundColor: '#1E1B4B77', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: theme.borderRadius.xl, borderWidth: 1, borderColor: colors.border, padding: 22, ...shadows.medium },
  title: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 14 },
  input: { width: '100%', padding: 10, borderRadius: 9, borderWidth: 1.5, borderColor: colors.border, fontSize: 13, color: colors.text, backgroundColor: colors.surface, marginBottom: 10 },
  comboInput: { width: '100%', padding: 12, borderRadius: 9, borderWidth: 1.5, borderColor: colors.border, fontSize: 28, fontWeight: '900', color: colors.text, backgroundColor: colors.surface, marginBottom: 10, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 6, textAlign: 'center' },
  statesRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 9, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: theme.borderRadius.lg, alignItems: 'center' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function NumberBookScreen() {
  const { colors, shadows } = useTheme();
  const s = useMemo(() => makeS(colors, shadows), [colors, shadows]);
  const [lists, setLists] = useState<BookList[]>([]);

  // §4.3 — personal hit history: flatten saved combos across lists,
  // query histories for matches, mark hit rows + surface aggregate.
  const allSavedCombos = useMemo(
    () => lists.flatMap(l => l.combos.map(c => c.combo)),
    [lists],
  );
  const savedHits = useSavedHits(allSavedCombos);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [listsLoaded, setListsLoaded] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showEditStates, setShowEditStates] = useState(false);
  const [heatCheckOpen, setHeatCheckOpen] = useState(false);
  const [heatCheckCombo, setHeatCheckCombo] = useState('');

  // Load custom lists + saved slates from storage on mount. Unlike the old
  // sidebar layout we do NOT auto-select the first list — the index IS the
  // home view now.
  useEffect(() => {
    (async () => {
      let custom: BookList[] = [];
      let saved: BookList[] = [];
      try {
        const raw = await storage.getItem('number_book_lists');
        if (raw) custom = JSON.parse(raw);
      } catch {}
      try {
        const raw = await storage.getItem('saved_slates');
        if (raw) saved = JSON.parse(raw);
      } catch {}
      const existingIds = new Set(custom.map((l: BookList) => l.id));
      setLists([...custom, ...saved.filter((s: BookList) => !existingIds.has(s.id))]);
      setListsLoaded(true);
    })();
  }, []);

  // Persist custom lists to storage whenever they change (skip during initial load)
  useEffect(() => {
    if (!listsLoaded) return;
    const custom = lists.filter(l => l.type !== 'saved_slate');
    storage.setItem('number_book_lists', JSON.stringify(custom)).catch(() => {});
  }, [lists, listsLoaded]);

  const activeList = lists.find(l => l.id === activeId) ?? null;
  const customLists = lists.filter(l => l.type !== 'saved_slate');
  const savedSlateLists = lists.filter(l => l.type === 'saved_slate');

  const handleCreate = useCallback((name: string, scope: string, states: string[]) => {
    const newList: BookList = { id: Date.now() + '', name, scope, states, combos: [] };
    setLists(l => [...l, newList]);
    setActiveId(newList.id);
    setShowCreate(false);
  }, []);

  // Sample-list onboarding (enhancements §8.3) — pre-populated "NY Favorites"
  // so first-run users see a working list without having to add numbers manually.
  // Combos are arbitrary defaults; user can edit/remove freely.
  const handleCreateSample = useCallback(() => {
    const sample: BookList = {
      id: Date.now() + '',
      name: 'NY Favorites (sample)',
      scope: 'midday',
      states: ['NY'],
      combos: [
        { combo: '248', note: 'sample · top singles pattern', starred: true },
        { combo: '069', note: 'sample · spread combo', starred: false },
        { combo: '357', note: 'sample · odd singles', starred: false },
      ],
    };
    setLists(l => [...l, sample]);
    setActiveId(sample.id);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    // confirmAsync, not Alert.alert — multi-button Alert is a no-op on web
    // (the Delete callback never fired there).
    const ok = await confirmAsync('Delete list?', 'This cannot be undone.', { confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    setLists(l => l.filter(x => x.id !== id));
    setActiveId(a => a === id ? null : a);
  }, []);

  const handleAddCombo = useCallback((combo: string, note: string) => {
    if (!activeList) return;
    if (activeList.combos.some(c => c.combo === combo)) return;
    setLists(l => l.map(x => x.id === activeList.id
      ? { ...x, combos: [...x.combos, { combo, note, starred: false }] }
      : x));
    setShowAdd(false);
  }, [activeList]);

  const handleStar = useCallback((combo: string) => {
    if (!activeList) return;
    setLists(l => l.map(x => x.id === activeList.id
      ? { ...x, combos: x.combos.map(c => c.combo === combo ? { ...c, starred: !c.starred } : c) }
      : x));
  }, [activeList]);

  const handleDeleteCombo = useCallback((combo: string) => {
    if (!activeList) return;
    setLists(l => l.map(x => x.id === activeList.id
      ? { ...x, combos: x.combos.filter(c => c.combo !== combo) }
      : x));
  }, [activeList]);

  const handleSaveStates = useCallback((states: string[]) => {
    if (!activeList) return;
    setLists(l => l.map(x => x.id === activeList.id ? { ...x, states } : x));
    setShowEditStates(false);
  }, [activeList]);

  const handleAddFromSlate = useCallback(async () => {
    if (!activeList) return;
    const scope = activeList.scope === 'midday' || activeList.scope === 'evening' ? activeList.scope : 'allday';
    try {
      const today = getTodayET();
      const rows = await fetchFromSupabase<any[]>({
        path: `/rest/v1/slate_snapshots?scope=eq.${scope}&slate_date=eq.${today}&deleted_at=is.null&mode=eq.balanced&order=updated_at_et.desc.nullslast&limit=1&select=top_k_straights_json`,
      });
      const picks: any[] = Array.isArray(rows?.[0]?.top_k_straights_json) ? rows![0].top_k_straights_json.slice(0, 6) : [];
      if (picks.length === 0) {
        Alert.alert('No Slate', `No ${scope} slate found for today. Generate a slate first.`);
        return;
      }
      const existing = new Set(activeList.combos.map((c: ComboItem) => c.combo));
      const toAdd: ComboItem[] = picks
        .filter((p: any) => p?.combo && !existing.has(p.combo))
        .map((p: any) => ({ combo: p.combo, note: `ZK6 #${p.rank ?? ''}`, starred: false, energy: p.energy }));
      if (toAdd.length === 0) {
        Alert.alert('Already Added', "All of today's signals are already in this list.");
        return;
      }
      setLists(l => l.map(x => x.id === activeList!.id ? { ...x, combos: [...x.combos, ...toAdd] } : x));
    } catch {
      Alert.alert('Error', 'Failed to load today\'s slate. Please try again.');
    }
  }, [activeList]);

  // Matched combos surface first (most matches on top); the rest keep
  // insertion order. This is the match-intel promotion from the scope doc.
  const orderedCombos = useMemo(() => {
    if (!activeList) return [];
    const withHits = activeList.combos.filter(c => (savedHits.hitsByCombo.get(c.combo) ?? 0) > 0);
    const rest = activeList.combos.filter(c => (savedHits.hitsByCombo.get(c.combo) ?? 0) === 0);
    withHits.sort((a, b) => (savedHits.hitsByCombo.get(b.combo) ?? 0) - (savedHits.hitsByCombo.get(a.combo) ?? 0));
    return [...withHits, ...rest];
  }, [activeList, savedHits.hitsByCombo]);

  const listMatchCount = useCallback((l: BookList) =>
    l.combos.reduce((sum, c) => sum + (savedHits.hitsByCombo.get(c.combo) ?? 0), 0),
  [savedHits.hitsByCombo]);

  // ── Shared bits ──
  const whatsNextCard = (
    <View style={s.nextCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Sparkles size={14} color={colors.primary} />
        <Text style={s.nextCardTitle}>{"What's next in Number Book"}</Text>
        <View style={s.plusBadge}><Text style={s.plusBadgeText}>PLUS</Text></View>
      </View>
      {COMING_FEATURES.map(f => (
        <Text key={f.title} style={s.nextCardLine} numberOfLines={1}>
          <Text style={{ fontWeight: '700', color: colors.textSecondary }}>{f.title}</Text>
          <Text style={{ color: colors.textTertiary }}>  ·  {f.desc}</Text>
        </Text>
      ))}
    </View>
  );

  // ── Index view ──
  const renderIndex = () => (
    <>
      <ScreenHeader
        title="Number Book"
        subtitle={
          customLists.length === 0
            ? 'Your personal number collection'
            : `${customLists.length} ${customLists.length === 1 ? 'list' : 'lists'} · ${allSavedCombos.length} numbers${savedHits.totalHits > 0 ? ` · ${savedHits.totalHits} matches (30d)` : ''}`
        }
        rightSlot={
          customLists.length > 0 ? (
            <TouchableOpacity style={s.headerBtn} onPress={() => setShowCreate(true)} accessibilityRole="button" accessibilityLabel="New list">
              <Plus size={14} color={colors.primary} />
              <Text style={s.headerBtnText}>New</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={s.indexContent}>
        {customLists.length === 0 ? (
          /* Welcome / onboarding */
          <View>
            <View style={s.welcomeHero}>
              <View style={s.welcomeIcon}><BookOpen size={34} color={colors.primary} /></View>
              <Text style={s.welcomeTitle}>Your Number Book</Text>
              <Text style={s.welcomeDesc}>Save the numbers you track, organize them by scope and state, and see when they match a drawing — automatically.</Text>
              <TouchableOpacity style={s.createBtn} onPress={() => setShowCreate(true)}>
                {/* white-on-cosmic: intentional in both modes (LIGHT-01) */}
                <Text style={s.createBtnText}>Create Your First List</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.sampleBtn} onPress={handleCreateSample} accessibilityRole="button" accessibilityLabel="Try a sample list">
                <Text style={s.sampleBtnText}>Or try a sample list →</Text>
              </TouchableOpacity>
            </View>
            {whatsNextCard}
            <Text style={s.proLine}>Oracle+ unlocks Slate by State and 4-digit analytics first.</Text>
          </View>
        ) : (
          <View>
            <SectionTitle style={{ marginBottom: 8 }}>MY LISTS</SectionTitle>
            {customLists.map(lst => {
              const accent = scopeAccent(lst.scope, colors);
              const matches = listMatchCount(lst);
              return (
                <TouchableOpacity key={lst.id} style={s.listCard} onPress={() => setActiveId(lst.id)} activeOpacity={0.8}>
                  <View style={[s.listAccent, { backgroundColor: accent }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.listCardName} numberOfLines={1}>{lst.name}</Text>
                    <Text style={s.listCardMeta} numberOfLines={1}>
                      {lst.combos.length} {lst.combos.length === 1 ? 'number' : 'numbers'} · {SCOPE_LABEL[lst.scope] ?? lst.scope}
                      {lst.states.length > 0 ? ` · ${lst.states.slice(0, 3).join(', ')}${lst.states.length > 3 ? '…' : ''}` : ''}
                    </Text>
                  </View>
                  {matches > 0 && (
                    <View style={s.matchPill}>
                      <Target size={10} color={colors.gold} />
                      <Text style={s.matchPillText}>{matches}</Text>
                    </View>
                  )}
                  <TouchableOpacity onPress={() => handleDelete(lst.id)} style={s.iconBtn} accessibilityRole="button" accessibilityLabel={`Delete ${lst.name}`}>
                    <Trash2 size={15} color={colors.textTertiary} />
                  </TouchableOpacity>
                  <ChevronRight size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              );
            })}

            {savedSlateLists.length > 0 && (
              <>
                <SectionTitle tone="gold" style={{ marginTop: 14, marginBottom: 8 }}>SAVED SLATES</SectionTitle>
                {savedSlateLists.map(lst => (
                  <TouchableOpacity key={lst.id} style={[s.listCard, s.savedCard]} onPress={() => setActiveId(lst.id)} activeOpacity={0.8}>
                    <Star size={15} color={colors.gold} fill={colors.gold} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.listCardName, { color: colors.gold }]} numberOfLines={1}>{lst.name}</Text>
                      <Text style={s.listCardMeta}>{lst.combos.length} signals · saved slate</Text>
                    </View>
                    <ChevronRight size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                ))}
              </>
            )}

            {/* Learn Center — relocated from the tab bar; ZK30 took its slot */}
            <TouchableOpacity style={s.learnCard} onPress={() => router.push('/(tabs)/learn')} accessibilityRole="button" accessibilityLabel="Open Learn Center" activeOpacity={0.8}>
              <View style={s.learnIcon}><GraduationCap size={17} color={colors.gold} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.learnTitle}>Learn Center</Text>
                <Text style={s.listCardMeta}>3-digit draws from zero to expert</Text>
              </View>
              <ChevronRight size={16} color={colors.textTertiary} />
            </TouchableOpacity>

            {whatsNextCard}
          </View>
        )}
      </ScrollView>
    </>
  );

  // ── Detail view (custom list) ──
  const renderDetail = (lst: BookList) => {
    const accent = scopeAccent(lst.scope, colors);
    const listHitCount = listMatchCount(lst);
    const hitPicks = lst.combos.filter(c => savedHits.hitsByCombo.has(c.combo)).length;
    const lastListHit = orderedCombos.length > 0 ? savedHits.lastHitByCombo.get(orderedCombos[0].combo) : undefined;

    return (
      <>
        <View style={s.detailHeader}>
          <TouchableOpacity style={s.backBtn} onPress={() => setActiveId(null)} accessibilityRole="button" accessibilityLabel="Back to my book">
            <ChevronLeft size={18} color={colors.textSecondary} />
            <Text style={s.backText}>My Book</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={s.addBtn} onPress={() => setShowAdd(true)}>
              {/* white-on-primary: intentional in both modes (LIGHT-01) */}
              <Plus size={13} color="#fff" />
              <Text style={s.addBtnText}>Add</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.slateBtn} onPress={handleAddFromSlate}>
              <Zap size={13} color={colors.teal} />
              <Text style={[s.addBtnText, { color: colors.teal }]}>From Slate</Text>
            </TouchableOpacity>
          </View>
        </View>
        <ScrollView contentContainerStyle={s.panelContent}>
          <Text style={s.panelTitle}>{lst.name}</Text>
          <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginTop: 6, marginBottom: 14, alignItems: 'center' }}>
            <View style={[s.scopeTag, { borderColor: accent + theme.alpha.tint, backgroundColor: accent + theme.alpha.soft }]}>
              <Text style={[s.scopeTagText, { color: accent }]}>{SCOPE_LABEL[lst.scope] ?? lst.scope}</Text>
            </View>
            <TouchableOpacity
              style={s.stateTag}
              onPress={() => setShowEditStates(true)}
              accessibilityRole="button"
              accessibilityLabel="Edit list states"
            >
              <MapPin size={10} color={colors.textTertiary} />
              <Text style={s.stateTagText}>{lst.states.length === 0 ? 'All states' : lst.states.join(' · ')}</Text>
            </TouchableOpacity>
          </View>

          {listHitCount > 0 && (
            <View style={s.activityCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Target size={15} color={colors.gold} />
                <Text style={s.activityTitle}>30-DAY ACTIVITY</Text>
              </View>
              <Text style={s.activityLine}>
                {listHitCount} {listHitCount === 1 ? 'match' : 'matches'} across {hitPicks} {hitPicks === 1 ? 'signal' : 'signals'}
                {lastListHit ? ` · last: ${lastListHit.state} ${lastListHit.session} ${daysAgo(lastListHit.date)}` : ''}
              </Text>
            </View>
          )}

          {lst.combos.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No numbers saved yet"
              message="Add combos you want to track and check against your daily slate."
              action={
                <TouchableOpacity style={s.addBtnOutline} onPress={() => setShowAdd(true)}>
                  <Text style={s.addBtnOutlineText}>Add your first number</Text>
                </TouchableOpacity>
              }
            />
          ) : (
            orderedCombos.map(item => {
              const hitCount = savedHits.hitsByCombo.get(item.combo) ?? 0;
              const lastHit = savedHits.lastHitByCombo.get(item.combo);
              const tier = typeof item.energy === 'number' ? heatTier(item.energy, colors) : null;
              return (
                <View key={item.combo} style={[s.comboRow, hitCount > 0 && s.comboRowHit]}>
                  <TouchableOpacity onPress={() => handleStar(item.combo)} style={s.iconBtn} accessibilityRole="button" accessibilityLabel={item.starred ? 'Unstar' : 'Star'}>
                    <Star size={17} color={item.starred ? colors.gold : colors.textTertiary} fill={item.starred ? colors.gold : 'transparent'} />
                  </TouchableOpacity>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={s.comboNum}>{item.combo}</Text>
                      <Text style={s.comboSet}>{toSet(item.combo)}</Text>
                      {tier && (
                        <View style={[s.energyChip, { borderColor: tier.color + theme.alpha.border, backgroundColor: tier.color + theme.alpha.faint }]}>
                          <Text style={[s.energyChipText, { color: tier.color }]}>{Math.round(item.energy!)}</Text>
                        </View>
                      )}
                    </View>
                    {hitCount > 0 && lastHit ? (
                      <TouchableOpacity
                        onPress={() => router.push({ pathname: '/pattern-explorer', params: { combo: item.combo } })}
                        accessibilityRole="button"
                        accessibilityLabel={`View full history for ${item.combo}`}
                      >
                        <Text style={s.matchLine} numberOfLines={1}>
                          {hitCount === 1 ? 'MATCH' : `${hitCount}× MATCHES`} · {lastHit.state} {lastHit.session} {daysAgo(lastHit.date)}
                          <Text style={{ color: colors.primary }}>  Full history →</Text>
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={s.comboNote} numberOfLines={1}>{item.note || 'No note'}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => { setHeatCheckCombo(item.combo); setHeatCheckOpen(true); }}
                    style={s.iconBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Heat check ${item.combo}`}
                  >
                    <Flame size={17} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteCombo(item.combo)} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="Remove number">
                    <Trash2 size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      </>
    );
  };

  // ── Detail view (saved slate — read-only record) ──
  const renderSavedSlate = (lst: BookList) => (
    <>
      <View style={s.detailHeader}>
        <TouchableOpacity style={s.backBtn} onPress={() => setActiveId(null)} accessibilityRole="button" accessibilityLabel="Back to my book">
          <ChevronLeft size={18} color={colors.textSecondary} />
          <Text style={s.backText}>My Book</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={s.panelContent}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Star size={18} color={colors.gold} fill={colors.gold} />
          <Text style={[s.panelTitle, { color: colors.gold }]}>{lst.name}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginTop: 6, marginBottom: 12 }}>
          {lst.savedAt && (
            <View style={s.stateTag}>
              <Text style={s.stateTagText}>Saved {new Date(lst.savedAt).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })}</Text>
            </View>
          )}
        </View>
        <View style={s.lockNote}>
          <Lock size={12} color={colors.gold} />
          <Text style={s.lockNoteText}>Saved slate record — signals are static and cannot be changed.</Text>
        </View>
        {lst.combos.map(item => (
          <View key={item.combo} style={[s.comboRow, { borderColor: colors.gold + theme.alpha.tint }]}>
            {item.hitStraight
              ? <Star size={16} color={colors.gold} fill={colors.gold} />
              : item.hitBox
                ? <Target size={16} color={colors.teal} />
                : <View style={{ width: 16 }} />}
            <Text style={s.comboNum}>{item.combo}</Text>
            <Text style={s.comboSet}>{toSet(item.combo)}</Text>
            <Text style={[s.comboNote, { flex: 1 }]} numberOfLines={1}>{item.note || ''}</Text>
          </View>
        ))}
      </ScrollView>
    </>
  );

  return (
    <SafeAreaView style={s.container} edges={['top', 'left', 'right', 'bottom']}>
      {!activeList
        ? renderIndex()
        : activeList.type === 'saved_slate'
          ? renderSavedSlate(activeList)
          : renderDetail(activeList)}

      {showCreate && <CreateListModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
      {showAdd && <AddNumberModal onClose={() => setShowAdd(false)} onAdd={handleAddCombo} />}
      {showEditStates && activeList && (
        <EditStatesModal initial={activeList.states} onClose={() => setShowEditStates(false)} onSave={handleSaveStates} />
      )}
      <HeatCheckModal
        visible={heatCheckOpen}
        onClose={() => setHeatCheckOpen(false)}
        initialCombo={heatCheckCombo}
        scope={activeList?.scope ?? 'allday'}
      />
    </SafeAreaView>
  );
}

const makeS = (colors: ColorTokens, shadows: ShadowTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Index
  indexContent: { padding: theme.layout.screenInset, paddingBottom: 32 },
  headerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.primary + theme.alpha.border, backgroundColor: colors.primaryLight },
  headerBtnText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  listCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8, ...shadows.glow },
  listAccent: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  listCardName: { fontSize: 14, fontWeight: '700', color: colors.text },
  listCardMeta: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  savedCard: { borderColor: colors.gold + theme.alpha.tint },
  matchPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 99, backgroundColor: colors.gold + theme.alpha.soft, borderWidth: 1, borderColor: colors.gold + theme.alpha.tint },
  matchPillText: { fontSize: 10, fontWeight: '800', color: colors.gold, fontFamily: theme.typography.fontFamily.monoBold },
  learnCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.goldLight, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: colors.gold + theme.alpha.tint, padding: 14, marginTop: 14, marginBottom: 8 },
  learnIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold + theme.alpha.soft },
  learnTitle: { fontSize: 13, fontWeight: '700', color: colors.gold },
  nextCard: { backgroundColor: colors.surface, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, marginTop: 8 },
  nextCardTitle: { fontSize: 12, fontWeight: '800', color: colors.text, flex: 1 },
  nextCardLine: { fontSize: 11, lineHeight: 18 },
  plusBadge: { backgroundColor: colors.primaryLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99 },
  plusBadgeText: { fontSize: 8, fontWeight: '800', color: colors.primary },
  proLine: { fontSize: 11, color: colors.textTertiary, textAlign: 'center', marginTop: 14 },

  // Welcome
  welcomeHero: { alignItems: 'center', paddingVertical: 24, marginBottom: 8 },
  welcomeIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight, marginBottom: 14 },
  welcomeTitle: { fontSize: 20, fontWeight: '900', color: colors.text, marginBottom: 8 },
  welcomeDesc: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', maxWidth: 300, lineHeight: 20, marginBottom: 16 },
  createBtn: { backgroundColor: colors.cosmic, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 11 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 }, // white-on-cosmic: intentional in both modes (LIGHT-01)
  sampleBtn: { marginTop: 10, paddingHorizontal: 16, paddingVertical: 8 },
  sampleBtnText: { color: colors.textSecondary, fontWeight: '600', fontSize: 12 },

  // Detail
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.layout.screenInset, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, paddingRight: 10 },
  backText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  panelContent: { padding: theme.layout.screenInset, paddingBottom: 32 },
  panelTitle: { fontSize: 20, fontWeight: '900', color: colors.text },
  scopeTag: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99, borderWidth: 1 },
  scopeTagText: { fontSize: 10, fontWeight: '800' },
  stateTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surfaceLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, borderWidth: 1, borderColor: colors.border },
  stateTagText: { fontSize: 10, color: colors.textTertiary, fontWeight: '600' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.borderRadius.md },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 }, // white-on-primary: intentional in both modes (LIGHT-01)
  slateBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.teal + theme.alpha.soft, borderColor: colors.teal + theme.alpha.border, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.borderRadius.md },

  activityCard: { backgroundColor: colors.goldLight, borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: colors.gold + theme.alpha.tint, padding: 12, marginBottom: 12 },
  activityTitle: { fontSize: 10, fontWeight: '800', color: colors.gold, letterSpacing: 1.5, fontFamily: theme.typography.fontFamily.monoBold },
  activityLine: { fontSize: 12, color: colors.text, fontWeight: '600' },

  comboRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: 10, paddingHorizontal: 8, marginBottom: 8, ...shadows.glow },
  comboRowHit: { borderColor: colors.gold + theme.alpha.border, backgroundColor: colors.gold + theme.alpha.faint },
  comboNum: { fontSize: 22, fontWeight: '900', color: colors.text, letterSpacing: 3, fontFamily: theme.typography.fontFamily.monoBold },
  comboSet: { fontSize: 10, color: colors.textTertiary, fontFamily: theme.typography.fontFamily.mono },
  comboNote: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  matchLine: { fontSize: 10, fontWeight: '800', color: colors.gold, fontFamily: theme.typography.fontFamily.monoBold, marginTop: 3 },
  energyChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 7, borderWidth: 1 },
  energyChipText: { fontSize: 9, fontWeight: '800', fontFamily: theme.typography.fontFamily.monoBold },
  iconBtn: { padding: 9, alignItems: 'center', justifyContent: 'center' },

  addBtnOutline: { borderWidth: 1.5, borderColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: theme.borderRadius.lg },
  addBtnOutlineText: { color: colors.primary, fontWeight: '700', fontSize: 13 },

  lockNote: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.goldLight, borderRadius: theme.borderRadius.md, padding: 10, marginBottom: 14, borderWidth: 1, borderColor: colors.gold + theme.alpha.tint },
  lockNoteText: { fontSize: 11, color: colors.gold, fontWeight: '600', flex: 1 },
});
