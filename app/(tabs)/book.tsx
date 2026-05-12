import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { theme } from '@/constants/theme';
import { storage } from '@/lib/storage';
import { HeatCheckModal } from '@/components/HeatCheckModal';
import { EmptyState } from '@/components/EmptyState';
import { BookOpen } from 'lucide-react-native';
import { fetchFromSupabase } from '@/lib/supabase';
import { getTodayET } from '@/lib/dateUtils';

function toSet(combo: string) {
  return '{' + combo.split('').sort().join(',') + '}';
}

const scopeIcon = (s: string) => s === 'midday' ? '☀️' : s === 'evening' ? '🌙' : '◈';
const scopeColor = (s: string) =>
  s === 'midday' ? theme.colors.gold : s === 'evening' ? theme.colors.primary : theme.colors.teal;

const COMING_FEATURES = [
  { icon: '🗺', title: 'Slate by State', desc: 'Filter today\'s K6 Slate to only your selected states.', tier: 'PLUS' },
  { icon: '🎯', title: 'Straight Pick 3 Slate', desc: 'Dedicated straight-only intelligence slate powered by ZK6.', tier: 'PLUS' },
  { icon: '4️⃣', title: 'Pick 4 Box', desc: '4-digit box intelligence — ZK6 expanding to Pick 4.', tier: 'PLUS' },
  { icon: '⭐', title: 'Pick 4 Straight', desc: '4-digit straight slate picks with optimal arrangement.', tier: 'PLUS' },
];

interface ComboItem { combo: string; note: string; starred: boolean; energy?: number; hitBox?: boolean; hitStraight?: boolean; }
interface BookList { id: string; name: string; scope: string; states: string[]; combos: ComboItem[]; type?: 'custom' | 'saved_slate'; savedAt?: string; }

// ─── Create List Modal ────────────────────────────────────────────────────────
function CreateListModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, scope: string) => void }) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState('allday');

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={m.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={m.card} onPress={() => {}}>
          <Text style={m.title}>✦ Create New List</Text>
          <TextInput
            style={[m.input, name ? { borderColor: theme.colors.primary } : {}]}
            value={name}
            onChangeText={setName}
            placeholder="List name (e.g. NY Evening Picks)"
            placeholderTextColor={theme.colors.textTertiary}
          />
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 18 }}>
            {[['midday', '☀️ Midday'], ['evening', '🌙 Evening'], ['allday', '◈ All Day']].map(([id, lbl]) => (
              <TouchableOpacity
                key={id} style={[m.scopeBtn, scope === id && m.scopeBtnOn]}
                onPress={() => setScope(id)}
              >
                <Text style={[m.scopeBtnText, scope === id && m.scopeBtnTextOn]}>{lbl}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[m.btn, { backgroundColor: theme.colors.primary, opacity: name.trim() ? 1 : 0.5 }]}
              onPress={() => { if (name.trim()) onCreate(name.trim(), scope); }}
              disabled={!name.trim()}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Create List</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[m.btn, { backgroundColor: theme.colors.surfaceLight, borderWidth: 1, borderColor: theme.colors.border }]} onPress={onClose}>
              <Text style={{ color: theme.colors.textSecondary, fontWeight: '600', fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Add Number Modal ─────────────────────────────────────────────────────────
function AddNumberModal({ onClose, onAdd }: { onClose: () => void; onAdd: (combo: string, note: string) => void }) {
  const [combo, setCombo] = useState('');
  const [note, setNote] = useState('');
  const valid = /^\d{3}$/.test(combo);

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={m.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={m.card} onPress={() => {}}>
          <Text style={m.title}>＋ Add Number</Text>
          <TextInput
            style={[m.comboInput, valid ? { borderColor: theme.colors.primary } : {}]}
            value={combo}
            onChangeText={t => setCombo(t.replace(/\D/g, '').slice(0, 3))}
            placeholder="3 digits"
            placeholderTextColor={theme.colors.textTertiary}
            keyboardType="numeric"
            maxLength={3}
          />
          <TextInput
            style={[m.input, { marginBottom: 14 }]}
            value={note}
            onChangeText={setNote}
            placeholder="Note (optional)"
            placeholderTextColor={theme.colors.textTertiary}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[m.btn, { backgroundColor: theme.colors.primary, opacity: valid ? 1 : 0.5 }]}
              onPress={() => { if (valid) onAdd(combo, note); }}
              disabled={!valid}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Add Number</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[m.btn, { backgroundColor: theme.colors.surfaceLight, borderWidth: 1, borderColor: theme.colors.border }]} onPress={onClose}>
              <Text style={{ color: theme.colors.textSecondary, fontWeight: '600', fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const m = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#1E1B4B77', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 380, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.xl, borderWidth: 1, borderColor: theme.colors.border, padding: 22, ...theme.shadows.medium },
  title: { fontSize: 16, fontWeight: '800', color: theme.colors.text, marginBottom: 14 },
  input: { width: '100%', padding: 10, borderRadius: 9, borderWidth: 1.5, borderColor: theme.colors.border, fontSize: 13, color: theme.colors.text, backgroundColor: theme.colors.surface, marginBottom: 10 },
  comboInput: { width: '100%', padding: 12, borderRadius: 9, borderWidth: 1.5, borderColor: theme.colors.border, fontSize: 28, fontWeight: '900', color: theme.colors.text, backgroundColor: theme.colors.surface, marginBottom: 10, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 6, textAlign: 'center' },
  scopeBtn: { flex: 1, paddingVertical: 7, paddingHorizontal: 6, borderRadius: 9, borderWidth: 1.5, borderColor: theme.colors.border, alignItems: 'center' },
  scopeBtnOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryLight },
  scopeBtnText: { fontSize: 11, fontWeight: '500', color: theme.colors.textSecondary },
  scopeBtnTextOn: { color: theme.colors.primary, fontWeight: '700' },
  btn: { flex: 1, paddingVertical: 10, borderRadius: theme.borderRadius.lg, alignItems: 'center' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function NumberBookScreen() {
  const [lists, setLists] = useState<BookList[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [listsLoaded, setListsLoaded] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [heatCheckOpen, setHeatCheckOpen] = useState(false);
  const [heatCheckCombo, setHeatCheckCombo] = useState('');

  // Load custom lists + saved slates from storage on mount
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
      const merged = [...custom, ...saved.filter((s: BookList) => !existingIds.has(s.id))];
      if (merged.length > 0) {
        setLists(merged);
        setActiveId(merged[0].id);
      }
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

  const handleCreate = useCallback((name: string, scope: string) => {
    const newList: BookList = { id: Date.now() + '', name, scope, states: [], combos: [] };
    setLists(l => [...l, newList]);
    setActiveId(newList.id);
    setShowCreate(false);
  }, []);

  const handleDelete = useCallback((id: string) => {
    Alert.alert('Delete list?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        setLists(l => l.filter(x => x.id !== id));
        setActiveId(a => a === id ? null : a);
      }},
    ]);
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

  const handleAddFromSlate = useCallback(async () => {
    if (!activeList) return;
    const scope = activeList.scope === 'midday' || activeList.scope === 'evening' ? activeList.scope : 'allday';
    try {
      const today = getTodayET();
      const rows = await fetchFromSupabase<any[]>({
        path: `/rest/v1/slate_snapshots?scope=eq.${scope}&slate_date=eq.${today}&deleted_at=is.null&mode=neq.zk30&order=updated_at_et.desc.nullslast&limit=1&select=top_k_straights_json`,
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
        Alert.alert('Already Added', "All of today's picks are already in this list.");
        return;
      }
      setLists(l => l.map(x => x.id === activeList!.id ? { ...x, combos: [...x.combos, ...toAdd] } : x));
    } catch {
      Alert.alert('Error', 'Failed to load today\'s slate. Please try again.');
    }
  }, [activeList]);

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <View style={s.layout}>
        {/* ── Left Sidebar ── */}
        <View style={s.sidebar}>
          <LinearGradient
            colors={['#1a0d35', theme.colors.surface] as [string, string]}
            start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
            style={s.sidebarHeader}
          >
            <Text style={s.sidebarTitle}>📖 Number <Text style={{ color: theme.colors.primary }}>Book</Text></Text>
            <Text style={s.sidebarSub}>Your personal number collection</Text>
          </LinearGradient>

          <ScrollView style={s.sidebarList}>
            <Text style={s.listSectionLabel}>MY LISTS</Text>
            {lists.filter(l => l.type !== 'saved_slate').map(lst => {
              const on = activeId === lst.id;
              return (
                <TouchableOpacity
                  key={lst.id}
                  style={[s.listRow, on && s.listRowOn]}
                  onPress={() => setActiveId(lst.id)}
                >
                  <Text style={{ fontSize: 14 }}>{scopeIcon(lst.scope)}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.listName, on && { color: theme.colors.primary }]} numberOfLines={1}>{lst.name}</Text>
                    <Text style={s.listMeta}>{lst.combos.length} numbers{lst.states.length ? ' · ' + lst.states.slice(0, 2).join(', ') : ''}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(lst.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={{ color: theme.colors.textTertiary, fontSize: 16 }}>×</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}

            {lists.some(l => l.type === 'saved_slate') && (
              <>
                <Text style={[s.listSectionLabel, { marginTop: 12 }]}>SAVED SLATES</Text>
                {lists.filter(l => l.type === 'saved_slate').map(lst => {
                  const on = activeId === lst.id;
                  return (
                    <TouchableOpacity
                      key={lst.id}
                      style={[s.listRow, on && s.listRowOn, { borderColor: on ? theme.colors.gold + '55' : theme.colors.gold + '22', borderWidth: 1, backgroundColor: on ? theme.colors.goldLight : 'transparent' }]}
                      onPress={() => setActiveId(lst.id)}
                    >
                      <Text style={{ fontSize: 14 }}>⭐</Text>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[s.listName, { color: on ? theme.colors.gold : theme.colors.text }]} numberOfLines={1}>{lst.name}</Text>
                        <Text style={s.listMeta}>{lst.combos.length} picks · Saved slate</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            <TouchableOpacity style={s.newListBtn} onPress={() => setShowCreate(true)}>
              <Text style={{ fontSize: 16, color: theme.colors.primary }}>＋</Text>
              <Text style={s.newListBtnText}>New List</Text>
            </TouchableOpacity>

            {/* Coming Soon */}
            <Text style={[s.listSectionLabel, { marginTop: 16 }]}>✦ COMING SOON</Text>
            {COMING_FEATURES.map(f => (
              <View key={f.title} style={s.comingRow}>
                <Text style={{ fontSize: 12 }}>{f.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.comingTitle}>{f.title}</Text>
                  <View style={s.plusBadge}><Text style={s.plusBadgeText}>PLUS</Text></View>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* ── Right Panel ── */}
        <View style={s.panel}>
          {!activeList ? (
            /* Welcome */
            <ScrollView contentContainerStyle={s.welcomeContent}>
              <View style={s.welcomeHero}>
                <Text style={{ fontSize: 48, marginBottom: 10 }}>📖</Text>
                <Text style={s.welcomeTitle}>Your Number Book</Text>
                <Text style={s.welcomeDesc}>Save your favorite numbers, organize by scope and state, and be first for powerful new features.</Text>
                <TouchableOpacity style={s.createBtn} onPress={() => setShowCreate(true)}>
                  <Text style={s.createBtnText}>✦ Create Your First List</Text>
                </TouchableOpacity>
              </View>

              {/* Coming features grid */}
              <Text style={[s.listSectionLabel, { marginHorizontal: 0, marginBottom: 10 }]}>✦ COMING SOON — PLUS</Text>
              <View style={s.comingGrid}>
                {COMING_FEATURES.map(f => (
                  <View key={f.title} style={s.comingCard}>
                    <Text style={{ fontSize: 24, marginBottom: 6 }}>{f.icon}</Text>
                    <Text style={s.comingCardTitle}>{f.title}</Text>
                    <Text style={s.comingCardDesc}>{f.desc}</Text>
                  </View>
                ))}
              </View>

              {/* Pro upsell */}
              <LinearGradient colors={[theme.colors.cosmicLight, theme.colors.goldLight]} style={s.upsellCard}>
                <Text style={{ fontSize: 26, marginBottom: 6 }}>🏆</Text>
                <Text style={s.upsellTitle}>Number Book is Pro exclusive</Text>
                <Text style={s.upsellDesc}>Save unlimited lists, organize by state, get first access to Slate by State & Pick 4.</Text>
                <TouchableOpacity style={s.upsellBtn} onPress={() => router.push('/paywall')}>
                  <Text style={s.upsellBtnText}>Unlock Oracle+ ♛</Text>
                </TouchableOpacity>
              </LinearGradient>
            </ScrollView>
          ) : activeList.type === 'saved_slate' ? (
            /* Saved Slate Detail — locked, gold bordered */
            <ScrollView contentContainerStyle={s.panelContent}>
              <View style={[s.panelHeader, { borderWidth: 1.5, borderColor: theme.colors.gold + '55', backgroundColor: theme.colors.goldLight, borderRadius: theme.borderRadius.lg, padding: 14, marginBottom: 14 }]}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Text style={{ fontSize: 18 }}>⭐</Text>
                    <Text style={[s.panelTitle, { color: theme.colors.gold }]}>{activeList.name}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap' }}>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: theme.colors.gold + '25', borderWidth: 1, borderColor: theme.colors.gold + '40' }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.gold }}>SAVED SLATE</Text>
                    </View>
                    {activeList.savedAt && (
                      <View style={s.stateTag}>
                        <Text style={s.stateTagText}>Saved {new Date(activeList.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
              <View style={{ backgroundColor: theme.colors.goldLight, borderRadius: theme.borderRadius.md, padding: 10, marginBottom: 14, borderWidth: 1, borderColor: theme.colors.gold + '33' }}>
                <Text style={{ fontSize: 11, color: theme.colors.gold, fontWeight: '600' }}>🔒 This is a saved slate record — picks are static and cannot be changed.</Text>
              </View>
              {activeList.combos.map((item, i) => (
                <View key={item.combo} style={[s.comboRow, { borderColor: theme.colors.gold + '44', borderWidth: 1.5 }]}>
                  <Text style={{ fontSize: 16 }}>{item.hitStraight ? '⭐' : item.hitBox ? '✅' : '◈'}</Text>
                  <Text style={s.comboNum}>{item.combo}</Text>
                  <Text style={s.comboSet}>{toSet(item.combo)}</Text>
                  <Text style={s.comboNote} numberOfLines={1}>{item.note || ''}</Text>
                </View>
              ))}
            </ScrollView>
          ) : (
            /* List Detail */
            <ScrollView contentContainerStyle={s.panelContent}>
              <View style={s.panelHeader}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Text style={{ fontSize: 20 }}>{scopeIcon(activeList.scope)}</Text>
                    <Text style={s.panelTitle}>{activeList.name}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap' }}>
                    <View style={[s.scopeTag, { borderColor: scopeColor(activeList.scope) + '40', backgroundColor: scopeColor(activeList.scope) + '15' }]}>
                      <Text style={[s.scopeTagText, { color: scopeColor(activeList.scope) }]}>{activeList.scope}</Text>
                    </View>
                    {activeList.states.map(st => (
                      <View key={st} style={s.stateTag}>
                        <Text style={s.stateTagText}>{st}</Text>
                      </View>
                    ))}
                    {activeList.states.length === 0 && (
                      <View style={s.stateTag}><Text style={s.stateTagText}>All States</Text></View>
                    )}
                  </View>
                </View>
                <View style={{ gap: 6 }}>
                  <TouchableOpacity style={s.addBtn} onPress={() => setShowAdd(true)}>
                    <Text style={s.addBtnText}>＋ Add Number</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.addBtn, { backgroundColor: theme.colors.teal + '18', borderColor: theme.colors.teal + '55', borderWidth: 1 }]}
                    onPress={handleAddFromSlate}
                  >
                    <Text style={[s.addBtnText, { color: theme.colors.teal }]}>⚡ Add from Slate</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {activeList.combos.length === 0 ? (
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
                activeList.combos.map(item => (
                  <View key={item.combo} style={s.comboRow}>
                    <TouchableOpacity onPress={() => handleStar(item.combo)}>
                      <Text style={{ fontSize: 16 }}>{item.starred ? '⭐' : '☆'}</Text>
                    </TouchableOpacity>
                    <Text style={s.comboNum}>{item.combo}</Text>
                    <Text style={s.comboSet}>{toSet(item.combo)}</Text>
                    <Text style={s.comboNote} numberOfLines={1}>{item.note || 'No note'}</Text>
                    <TouchableOpacity
                      onPress={() => { setHeatCheckCombo(item.combo); setHeatCheckOpen(true); }}
                      style={{ paddingHorizontal: 7, paddingVertical: 3, backgroundColor: theme.colors.primaryLight, borderRadius: 7, borderWidth: 1, borderColor: theme.colors.primary + '33' }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.primary }}>🔍</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteCombo(item.combo)}>
                      <Text style={{ color: theme.colors.textTertiary, fontSize: 16 }}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}

              {/* Coming features for list */}
              <View style={s.divider} />
              <Text style={[s.listSectionLabel, { marginHorizontal: 0, marginBottom: 10 }]}>✦ COMING FEATURES FOR THIS LIST</Text>
              <View style={s.comingGrid}>
                {COMING_FEATURES.map(f => (
                  <View key={f.title} style={s.comingCard}>
                    <Text style={{ fontSize: 20, marginBottom: 4 }}>{f.icon}</Text>
                    <Text style={s.comingCardTitle}>{f.title}</Text>
                    <View style={s.comingSoonBadge}><Text style={s.comingSoonBadgeText}>Coming Soon</Text></View>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      </View>

      {showCreate && <CreateListModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
      {showAdd && <AddNumberModal onClose={() => setShowAdd(false)} onAdd={handleAddCombo} />}
      <HeatCheckModal
        visible={heatCheckOpen}
        onClose={() => setHeatCheckOpen(false)}
        initialCombo={heatCheckCombo}
        scope={activeList?.scope ?? 'allday'}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  layout: { flex: 1, flexDirection: 'row' },

  // Sidebar
  sidebar: { width: 220, backgroundColor: theme.colors.surface, borderRightWidth: 1, borderRightColor: theme.colors.border },
  sidebarHeader: { padding: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  sidebarTitle: { fontSize: 15, fontWeight: '900', color: theme.colors.text, marginBottom: 2 },
  sidebarSub: { fontSize: 11, color: theme.colors.textTertiary },
  sidebarList: { flex: 1, padding: 8 },
  listSectionLabel: { fontSize: 9, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 1.5, paddingHorizontal: 8, paddingVertical: 8, textTransform: 'uppercase' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, marginBottom: 3, borderWidth: 1, borderColor: 'transparent' },
  listRowOn: { backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primary + '33' },
  listName: { fontSize: 12, fontWeight: '700', color: theme.colors.text },
  listMeta: { fontSize: 10, color: theme.colors.textTertiary },
  newListBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 9, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.border, marginTop: 6 },
  newListBtnText: { fontSize: 12, color: theme.colors.textSecondary },
  comingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, marginBottom: 3, backgroundColor: theme.colors.surfaceLight, borderWidth: 1, borderColor: theme.colors.border },
  comingTitle: { fontSize: 10, fontWeight: '700', color: theme.colors.text },
  plusBadge: { backgroundColor: theme.colors.primaryLight, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 99, marginTop: 2 },
  plusBadgeText: { fontSize: 8, fontWeight: '800', color: theme.colors.primary },

  // Right panel
  panel: { flex: 1, backgroundColor: theme.colors.background },
  panelContent: { padding: 18, paddingBottom: 32 },
  panelHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, gap: 10 },
  panelTitle: { fontSize: 18, fontWeight: '900', color: theme.colors.text },
  scopeTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, borderWidth: 1 },
  scopeTagText: { fontSize: 10, fontWeight: '700' },
  stateTag: { backgroundColor: theme.colors.surfaceLight, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 99 },
  stateTagText: { fontSize: 9, color: theme.colors.textTertiary, fontWeight: '600' },
  addBtn: { backgroundColor: theme.colors.primary, paddingHorizontal: 12, paddingVertical: 7, borderRadius: theme.borderRadius.md },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  comboRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: 12, marginBottom: 8, ...theme.shadows.glow },
  comboNum: { fontSize: 20, fontWeight: '900', color: theme.colors.text, letterSpacing: 3, fontFamily: theme.typography.fontFamily.monoBold, minWidth: 56 },
  comboSet: { fontSize: 10, color: theme.colors.textTertiary, fontFamily: theme.typography.fontFamily.mono },
  comboNote: { flex: 1, fontSize: 11, color: theme.colors.textSecondary },
  emptyState: { alignItems: 'center', paddingVertical: 32 },
  emptyTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text, marginBottom: 12 },
  addBtnOutline: { borderWidth: 1.5, borderColor: theme.colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: theme.borderRadius.lg },
  addBtnOutlineText: { color: theme.colors.primary, fontWeight: '700', fontSize: 13 },
  divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 16 },
  comingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  comingCard: { flex: 1, minWidth: 130, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: 12, ...theme.shadows.glow },
  comingCardTitle: { fontSize: 11, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  comingCardDesc: { fontSize: 10, color: theme.colors.textSecondary, lineHeight: 15 },
  comingSoonBadge: { backgroundColor: theme.colors.primaryLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99, marginTop: 4 },
  comingSoonBadgeText: { fontSize: 8, fontWeight: '800', color: theme.colors.primary },

  // Welcome
  welcomeContent: { padding: 20, paddingBottom: 32 },
  welcomeHero: { alignItems: 'center', paddingVertical: 24, marginBottom: 16 },
  welcomeTitle: { fontSize: 20, fontWeight: '900', color: theme.colors.text, marginBottom: 8 },
  welcomeDesc: { fontSize: 13, color: theme.colors.textSecondary, textAlign: 'center', maxWidth: 300, lineHeight: 20, marginBottom: 16 },
  createBtn: { backgroundColor: theme.colors.cosmic, paddingHorizontal: 22, paddingVertical: 11, borderRadius: 11 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  upsellCard: { borderRadius: theme.borderRadius.xl, padding: 18, alignItems: 'center', borderWidth: 1.5, borderColor: theme.colors.primary + '33', marginTop: 8 },
  upsellTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.text, marginBottom: 4 },
  upsellDesc: { fontSize: 11, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 12, lineHeight: 18 },
  upsellBtn: { backgroundColor: theme.colors.gold, paddingHorizontal: 18, paddingVertical: 9, borderRadius: theme.borderRadius.lg },
  upsellBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
