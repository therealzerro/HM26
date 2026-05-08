// HitMaster — screen compositions
// Each screen is a content block sized to fit inside a phone frame.

const HM_SLATES = [
  { rank:1, combo:847, confidence:0.92, energy:5, signals:{ box:0.91, pburst:0.78, co:0.83, dgc:0.95 } },
  { rank:2, combo:319, confidence:0.84, energy:4, signals:{ box:0.74, pburst:0.81, co:0.69, dgc:0.77 } },
  { rank:3, combo:602, confidence:0.79, energy:4, signals:{ box:0.68, pburst:0.71, co:0.82, dgc:0.62 } },
  { rank:4, combo:158, confidence:0.71, energy:3, signals:{ box:0.59, pburst:0.62, co:0.74, dgc:0.55 } },
  { rank:5, combo:430, confidence:0.66, energy:3, signals:{ box:0.51, pburst:0.58, co:0.61, dgc:0.49 } },
  { rank:6, combo:725, confidence:0.61, energy:2, signals:{ box:0.42, pburst:0.55, co:0.51, dgc:0.46 } },
];

const HM_RESULTS = [
  { date:'05.06', mid:'4-7-2', eve:'8-1-9', hit:true,  rank:2 },
  { date:'05.05', mid:'0-3-6', eve:'5-5-2', hit:false, rank:null },
  { date:'05.04', mid:'9-1-4', eve:'2-8-7', hit:true,  rank:1 },
  { date:'05.03', mid:'6-2-0', eve:'3-3-8', hit:false, rank:null },
  { date:'05.02', mid:'1-7-7', eve:'4-9-1', hit:true,  rank:3 },
  { date:'05.01', mid:'8-4-5', eve:'7-0-2', hit:false, rank:null },
  { date:'04.30', mid:'2-2-6', eve:'9-3-3', hit:true,  rank:1 },
  { date:'04.29', mid:'5-8-1', eve:'1-4-6', hit:false, rank:null },
];

// 56 days of "hit intensity" 0..1 (mostly empty, some hits)
const HM_HEAT = Array.from({length:56}, (_,i) => {
  const r = Math.sin(i*1.3) * Math.cos(i*0.7);
  return Math.max(0, r > 0.3 ? Math.min(1, (r-0.3)*1.6 + 0.3) : 0);
});

const HM_SPARK_FREQ = [0.42, 0.51, 0.48, 0.55, 0.62, 0.59, 0.66, 0.71, 0.74, 0.78, 0.82, 0.85];
const HM_SPARK_MOM  = [0.61, 0.55, 0.58, 0.62, 0.50, 0.45, 0.49, 0.52, 0.58, 0.65, 0.71, 0.78];
const HM_SPARK_PAT  = [0.30, 0.35, 0.42, 0.38, 0.45, 0.55, 0.51, 0.58, 0.66, 0.72, 0.69, 0.74];

// ── Phone shell — adds background, rounds inner content to viewport ──
function HMScreen({ children, scroll=true, padTop=0, padBottom=0 }) {
  return (
    <div style={{
      background: window.HM.bg, color: window.HM.text,
      fontFamily: window.HM.font, height:'100%', width:'100%',
      display:'flex', flexDirection:'column',
      paddingTop: padTop, paddingBottom: padBottom,
      overflow: scroll?'auto':'hidden',
    }}>{children}</div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// 01 — DASHBOARD
// ───────────────────────────────────────────────────────────────────────
function DashboardScreen({ density='normal', tabBar='ios' }) {
  return (
    <HMScreen padTop={54} padBottom={tabBar==='ios'?88:84}>
      <StatusRibbon engine="hm.engine v3.2" scope="ALLDAY" state="live" density={density}/>

      {/* hero — today's pick */}
      <div style={{ padding:'18px 16px 8px', display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <Eyebrow color={window.HM.textTer}>today · 05.07</Eyebrow>
          <DottedRule/>
          <Eyebrow color={window.HM.cons}>3 slates ready</Eyebrow>
        </div>

        <div style={{
          background: window.HM.card, border:`1px solid ${window.HM.border}`,
          borderRadius:8, padding:'18px 16px', position:'relative', overflow:'hidden',
        }}>
          {/* corner crops */}
          {['tl','tr','bl','br'].map(p => {
            const pos = {
              tl:{top:6,left:6}, tr:{top:6,right:6}, bl:{bottom:6,left:6}, br:{bottom:6,right:6}
            }[p];
            return <div key={p} style={{
              position:'absolute', ...pos, width:8, height:8,
              borderTop: p[0]==='t' ? `1px solid ${window.HM.textTer}` : 'none',
              borderBottom: p[0]==='b' ? `1px solid ${window.HM.textTer}` : 'none',
              borderLeft: p[1]==='l' ? `1px solid ${window.HM.textTer}` : 'none',
              borderRight: p[1]==='r' ? `1px solid ${window.HM.textTer}` : 'none',
            }}/>;
          })}

          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <Eyebrow color={window.HM.textSec}>top combo · rank 01</Eyebrow>
            <RadialGauge value={0.92} size={44} stroke={3} color={window.HM.freq}/>
          </div>

          <div style={{ display:'flex', alignItems:'baseline', gap:14, marginBottom:16 }}>
            {'847'.split('').map((d,i) => (
              <div key={i} style={{
                fontFamily: window.HM.font, fontSize:72, fontWeight:700,
                letterSpacing:'-0.05em', color: window.HM.text, lineHeight:0.95,
              }}>{d}</div>
            ))}
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
            <SignalBar label="freq" value={0.91} color={window.HM.freq} dense/>
            <SignalBar label="mom"  value={0.78} color={window.HM.mom}  dense/>
            <SignalBar label="pat"  value={0.83} color={window.HM.pat}  dense/>
            <SignalBar label="cons" value={0.95} color={window.HM.cons} dense/>
          </div>
        </div>

        {/* trend strip */}
        <div style={{
          display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8,
        }}>
          {[
            { l:'freq', v:HM_SPARK_FREQ, c:window.HM.freq, n:'+0.43' },
            { l:'mom',  v:HM_SPARK_MOM,  c:window.HM.mom,  n:'+0.17' },
            { l:'pat',  v:HM_SPARK_PAT,  c:window.HM.pat,  n:'+0.44' },
          ].map((s,i) => (
            <div key={i} style={{
              background: window.HM.card, border:`1px solid ${window.HM.border}`,
              borderRadius:6, padding:'8px 10px',
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <Eyebrow color={s.c}>{s.l}</Eyebrow>
                <Mono size={9} weight={700} color={window.HM.textSec}>{s.n}</Mono>
              </div>
              <Sparkline values={s.v} color={s.c} width={92} height={20}/>
            </div>
          ))}
        </div>

        {/* slate list preview */}
        <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:6 }}>
          <ScreenSection title="slates" hint="rank 02–03" action={
            <Mono size={10} weight={700} color={window.HM.freq}>view all →</Mono>
          }/>
          {HM_SLATES.slice(1,3).map(s => <SlateCard key={s.rank} {...s} density={density}/>)}
        </div>
      </div>

      <div style={{ flex:1 }}/>
      {tabBar==='ios' ? <BottomTabIOS active="intel"/> : <BottomTabAndroid active="intel"/>}
    </HMScreen>
  );
}

// ───────────────────────────────────────────────────────────────────────
// 02 — SLATE BUILDER / EXPLORER
// ───────────────────────────────────────────────────────────────────────
function BuilderScreen({ density='normal', tabBar='ios' }) {
  const [scope, setScope] = useState('midday');
  return (
    <HMScreen padTop={54} padBottom={tabBar==='ios'?88:84}>
      <StatusRibbon engine="hm.engine v3.2" scope={scope.toUpperCase()} state="live" density={density}/>

      <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <Mono size={22} weight={700} tracking="-0.02em">explore</Mono>
          <Mono size={10} weight={700} tracking="0.16em" transform="uppercase"
            color={window.HM.textTer}>06 / 24 slates</Mono>
        </div>

        <ScopeSwitcher value={scope} onChange={setScope}/>

        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          <Chip color={window.HM.freq} active>freq ≥ .60</Chip>
          <Chip color={window.HM.mom}>+mom</Chip>
          <Chip color={window.HM.pat} active>+pat</Chip>
          <Chip color={window.HM.cons}>+cons</Chip>
          <Chip>boxed</Chip>
          <Chip>straight</Chip>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:4 }}>
          {HM_SLATES.map(s => <SlateCard key={s.rank} {...s} density={density}/>)}
        </div>
      </div>

      {/* FAB */}
      <div style={{
        position:'absolute', right:18, bottom: tabBar==='ios'?100:96,
        width:56, height:56, borderRadius:28,
        background: window.HM.text, color: window.HM.bg,
        display:'flex', alignItems:'center', justifyContent:'center',
        gap:6, boxShadow:'0 10px 30px rgba(0,0,0,0.55)',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <Mono size={9} weight={700} tracking="0.18em" transform="uppercase" color={window.HM.bg}>regen</Mono>
      </div>

      {tabBar==='ios' ? <BottomTabIOS active="explore"/> : <BottomTabAndroid active="explore"/>}
    </HMScreen>
  );
}

// ───────────────────────────────────────────────────────────────────────
// 03 — RESULTS VIEW (with detail modal overlay variant)
// ───────────────────────────────────────────────────────────────────────
function ResultsScreen({ density='normal', tabBar='ios', modal=false }) {
  return (
    <HMScreen padTop={54} padBottom={tabBar==='ios'?88:84} scroll={!modal}>
      <StatusRibbon engine="hm.engine v3.2" scope="ALLDAY" state="archive" density={density}/>

      <div style={{ padding:'14px 16px 10px' }}>
        <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:10 }}>
          <Mono size={22} weight={700} tracking="-0.02em">results</Mono>
          <Mono size={10} weight={700} tracking="0.16em" transform="uppercase"
            color={window.HM.textTer}>jx · ny · 30d</Mono>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
          <KV k="hits" v="08 / 30" color={window.HM.cons}/>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
          <KV k="hit-rate" v=".267" color={window.HM.freq}/>
        </div>

        {/* heatmap */}
        <div style={{
          background: window.HM.card, border:`1px solid ${window.HM.border}`,
          borderRadius:8, padding:'12px 12px 10px', marginBottom:14,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <Eyebrow color={window.HM.textSec}>56-day hit map</Eyebrow>
            <DottedRule/>
            <Mono size={9} color={window.HM.textTer}>← jan · today →</Mono>
          </div>
          <HeatmapStrip days={HM_HEAT} cols={14} cell={14} gap={3} color={window.HM.cons}/>
        </div>

        {/* table */}
        <ScreenSection title="recent draws"/>
        <div style={{
          background: window.HM.card, border:`1px solid ${window.HM.border}`,
          borderRadius:8, marginTop:8, overflow:'hidden',
        }}>
          {/* header row */}
          <div style={{
            display:'grid', gridTemplateColumns:'52px 1fr 1fr 56px',
            padding:'8px 12px', borderBottom:`1px solid ${window.HM.border}`,
            background: window.HM.surface,
          }}>
            {['date','midday','evening','rank'].map(h => (
              <Mono key={h} size={9} weight={700} tracking="0.16em" transform="uppercase"
                color={window.HM.textTer}>{h}</Mono>
            ))}
          </div>
          {HM_RESULTS.map((r,i) => (
            <div key={i} style={{
              display:'grid', gridTemplateColumns:'52px 1fr 1fr 56px',
              padding:'10px 12px', alignItems:'center',
              borderBottom: i<HM_RESULTS.length-1 ? `1px dashed ${window.HM.border}` : 'none',
              background: r.hit ? `${window.HM.cons}08` : 'transparent',
            }}>
              <Mono size={11} weight={700} color={window.HM.textSec}>{r.date}</Mono>
              <Mono size={13} weight={700} tracking="0.05em" color={window.HM.text}>{r.mid}</Mono>
              <Mono size={13} weight={700} tracking="0.05em" color={window.HM.text}>{r.eve}</Mono>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:5 }}>
                {r.hit ? (
                  <>
                    <Dot color={window.HM.cons} size={5}/>
                    <Mono size={10} weight={700} color={window.HM.cons}>#{String(r.rank).padStart(2,'0')}</Mono>
                  </>
                ) : <Mono size={10} color={window.HM.textTer}>—</Mono>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {tabBar==='ios' ? <BottomTabIOS active="results"/> : <BottomTabAndroid active="results"/>}

      {/* modal */}
      {modal && <PickDetailModal/>}
    </HMScreen>
  );
}

// ── PickDetailModal ──────────────────────────────────────────────────
function PickDetailModal() {
  return (
    <div style={{
      position:'absolute', inset:0, background:'rgba(0,0,0,0.7)',
      display:'flex', alignItems:'flex-end', justifyContent:'center',
      backdropFilter:'blur(4px)',
    }}>
      <div style={{
        background: window.HM.surface, border:`1px solid ${window.HM.border}`,
        borderRadius:'16px 16px 0 0', width:'100%',
        padding:'14px 16px 36px',
      }}>
        {/* drag handle */}
        <div style={{
          width:36, height:4, borderRadius:4, background:window.HM.border,
          margin:'0 auto 14px',
        }}/>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <Mono size={10} weight={700} tracking="0.18em" transform="uppercase"
            color={window.HM.textSec}>05.04 · midday</Mono>
          <div style={{
            padding:'4px 8px', borderRadius:4,
            background:`${window.HM.cons}1a`, border:`1px solid ${window.HM.cons}`,
          }}>
            <Mono size={9} weight={700} tracking="0.16em" transform="uppercase"
              color={window.HM.cons}>hit · rank 01</Mono>
          </div>
        </div>

        <div style={{ display:'flex', alignItems:'baseline', gap:12, margin:'14px 0 18px' }}>
          {'914'.split('').map((d,i) => (
            <Mono key={i} size={64} weight={700} tracking="-0.05em">{d}</Mono>
          ))}
          <div style={{ flex:1 }}/>
          <Mono size={11} color={window.HM.textTer}>drawn</Mono>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
          <RadialGauge value={0.94} size={68} stroke={4} color={window.HM.freq} label="freq" sublabel="9-1-4"/>
          <RadialGauge value={0.81} size={68} stroke={4} color={window.HM.mom}  label="mom"  sublabel="+.21 wk"/>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <SignalBar label="box"    value={0.94} color={window.HM.freq}/>
          <SignalBar label="pburst" value={0.88} color={window.HM.mom}/>
          <SignalBar label="co"     value={0.71} color={window.HM.pat}/>
          <SignalBar label="dgc"    value={0.82} color={window.HM.cons}/>
        </div>

        <div style={{
          marginTop:14, padding:'10px 12px', borderRadius:6,
          background: window.HM.card, border:`1px dashed ${window.HM.border}`,
        }}>
          <Eyebrow color={window.HM.textSec} style={{ marginBottom:4, display:'block' }}>engine note</Eyebrow>
          <Mono size={11} color={window.HM.textSec} style={{ lineHeight:1.45 }}>
            box-pattern locked at .94 freq w/ 21-day momentum carry. dgc bias toward 9-prefix triggered the rank-up.
          </Mono>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// 04 — INTELLIGENCE
// ───────────────────────────────────────────────────────────────────────
function IntelligenceScreen({ density='normal', tabBar='ios' }) {
  return (
    <HMScreen padTop={54} padBottom={tabBar==='ios'?88:84}>
      <StatusRibbon engine="hm.engine v3.2" scope="ALLDAY" state="live" density={density}/>

      <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:14 }}>
        <Mono size={22} weight={700} tracking="-0.02em">intelligence</Mono>

        {/* four signal radials */}
        <div style={{
          background: window.HM.card, border:`1px solid ${window.HM.border}`,
          borderRadius:8, padding:'16px 12px',
          display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:8,
        }}>
          <RadialGauge value={0.85} size={62} stroke={4} color={window.HM.freq} label="freq"/>
          <RadialGauge value={0.78} size={62} stroke={4} color={window.HM.mom}  label="mom"/>
          <RadialGauge value={0.74} size={62} stroke={4} color={window.HM.pat}  label="pat"/>
          <RadialGauge value={0.91} size={62} stroke={4} color={window.HM.cons} label="cons"/>
        </div>

        <ScreenSection title="signal trends" hint="14 draws"/>
        <div style={{
          background: window.HM.card, border:`1px solid ${window.HM.border}`,
          borderRadius:8, padding:'12px 14px',
          display:'flex', flexDirection:'column', gap:12,
        }}>
          {[
            { l:'frequency', v:HM_SPARK_FREQ, c:window.HM.freq, kv:'.85', d:'+0.43' },
            { l:'momentum',  v:HM_SPARK_MOM,  c:window.HM.mom,  kv:'.78', d:'+0.17' },
            { l:'pattern',   v:HM_SPARK_PAT,  c:window.HM.pat,  kv:'.74', d:'+0.44' },
          ].map((row,i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
              <Mono size={10} weight={700} tracking="0.14em" transform="uppercase"
                color={row.c} style={{ width:74 }}>{row.l}</Mono>
              <Sparkline values={row.v} color={row.c} width={120} height={22}/>
              <div style={{ flex:1 }}/>
              <Mono size={13} weight={700} color={window.HM.text}>{row.kv}</Mono>
              <Mono size={9} color={window.HM.textTer} style={{ width:36, textAlign:'right' }}>{row.d}</Mono>
            </div>
          ))}
        </div>

        <ScreenSection title="hit calendar" hint="56 days · ny midday"/>
        <div style={{
          background: window.HM.card, border:`1px solid ${window.HM.border}`,
          borderRadius:8, padding:'12px',
        }}>
          <HeatmapStrip days={HM_HEAT} cols={14} cell={16} gap={3} color={window.HM.cons}/>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:10 }}>
            <Mono size={9} color={window.HM.textTer}>cold</Mono>
            <div style={{ flex:1, height:4, background:`linear-gradient(90deg, ${window.HM.track}, ${window.HM.cons})`, borderRadius:2 }}/>
            <Mono size={9} color={window.HM.textTer}>hot</Mono>
          </div>
        </div>

        <ScreenSection title="engine notes"/>
        <div style={{
          background: window.HM.card, border:`1px dashed ${window.HM.border}`,
          borderRadius:8, padding:'12px 14px', display:'flex', flexDirection:'column', gap:8,
        }}>
          {[
            { tag:'pat', t:'box-pattern bias toward 8-prefix carries 11d.', c:window.HM.pat },
            { tag:'mom', t:'momentum spike on .79+ — bigger than 84% of recent weeks.', c:window.HM.mom },
            { tag:'cons', t:'consistency floor moved up 4pp; tighter spread.', c:window.HM.cons },
          ].map((n,i) => (
            <div key={i} style={{ display:'flex', gap:10, alignItems:'baseline' }}>
              <Mono size={9} weight={700} tracking="0.16em" transform="uppercase" color={n.c} style={{ width:38, flexShrink:0 }}>{n.tag}</Mono>
              <Mono size={11} color={window.HM.textSec} style={{ lineHeight:1.45 }}>{n.t}</Mono>
            </div>
          ))}
        </div>
      </div>

      {tabBar==='ios' ? <BottomTabIOS active="intel"/> : <BottomTabAndroid active="intel"/>}
    </HMScreen>
  );
}

// ───────────────────────────────────────────────────────────────────────
// 05 — ACCOUNT
// ───────────────────────────────────────────────────────────────────────
function AccountScreen({ density='normal', tabBar='ios' }) {
  return (
    <HMScreen padTop={54} padBottom={tabBar==='ios'?88:84}>
      <StatusRibbon engine="hm.engine v3.2" scope="ALLDAY" state="live" density={density}/>

      <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:14 }}>
        <Mono size={22} weight={700} tracking="-0.02em">account</Mono>

        {/* identity card */}
        <div style={{
          background: window.HM.card, border:`1px solid ${window.HM.border}`,
          borderRadius:8, padding:'14px 16px',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
            <div style={{
              width:44, height:44, borderRadius:6,
              background: window.HM.surface, border:`1px solid ${window.HM.border}`,
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <Mono size={18} weight={700}>k</Mono>
            </div>
            <div style={{ flex:1 }}>
              <Mono size={14} weight={700}>kit.harlow</Mono>
              <div style={{ height:2 }}/>
              <Mono size={10} color={window.HM.textTer}>since 03.12.24 · 142 sessions</Mono>
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <KV k="plan"     v="hm · pro"        color={window.HM.cons}/>
            <KV k="renews"   v="07.04.26"/>
            <KV k="device"   v="ios 26 · pixel 9"/>
          </div>
        </div>

        {/* lifetime stats */}
        <ScreenSection title="lifetime"/>
        <div style={{
          background: window.HM.card, border:`1px solid ${window.HM.border}`,
          borderRadius:8, padding:'14px 16px',
          display:'grid', gridTemplateColumns:'1fr 1fr', gap:14,
        }}>
          {[
            { k:'slates run', v:'2,418', c:window.HM.text },
            { k:'hits',       v:'612',   c:window.HM.cons },
            { k:'hit-rate',   v:'.253',  c:window.HM.freq },
            { k:'longest run',v:'9 days',c:window.HM.mom },
          ].map((s,i) => (
            <div key={i}>
              <Eyebrow color={window.HM.textTer}>{s.k}</Eyebrow>
              <div style={{ height:4 }}/>
              <Mono size={22} weight={700} tracking="-0.02em" color={s.c}>{s.v}</Mono>
            </div>
          ))}
        </div>

        <ScreenSection title="settings"/>
        <div style={{
          background: window.HM.card, border:`1px solid ${window.HM.border}`,
          borderRadius:8, overflow:'hidden',
        }}>
          {[
            { k:'jurisdiction', v:'ny'   },
            { k:'scopes',       v:'mid + eve' },
            { k:'engine',       v:'v3.2' },
            { k:'export',       v:'csv'  },
            { k:'notifications',v:'2 / day'},
          ].map((row,i,arr) => (
            <div key={i} style={{
              padding:'12px 14px', display:'flex', alignItems:'center',
              borderBottom: i<arr.length-1 ? `1px dashed ${window.HM.border}` : 'none',
            }}>
              <Mono size={11} weight={600}>{row.k}</Mono>
              <DottedRule style={{ margin:'0 10px' }}/>
              <Mono size={11} weight={700} color={window.HM.textSec}>{row.v}</Mono>
              <svg width="6" height="10" viewBox="0 0 6 10" style={{ marginLeft:10 }}>
                <path d="M1 1l4 4-4 4" stroke={window.HM.textTer} strokeWidth="1.4" fill="none" strokeLinecap="round"/>
              </svg>
            </div>
          ))}
        </div>
      </div>

      {tabBar==='ios' ? <BottomTabIOS active="acct"/> : <BottomTabAndroid active="acct"/>}
    </HMScreen>
  );
}

// ───────────────────────────────────────────────────────────────────────
// 06 — EMPTY STATE
// ───────────────────────────────────────────────────────────────────────
function EmptyScreen({ density='normal', tabBar='ios' }) {
  return (
    <HMScreen padTop={54} padBottom={tabBar==='ios'?88:84}>
      <StatusRibbon engine="hm.engine v3.2" scope="—" state="idle" density={density}/>

      <div style={{ flex:1, padding:'40px 28px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:18, textAlign:'center' }}>
        {/* ascii frame */}
        <div style={{ display:'flex', flexDirection:'column', gap:2, color:window.HM.textTer }}>
          <Mono size={11} color={window.HM.textTer}>┌─────────────────┐</Mono>
          <Mono size={11} color={window.HM.textTer}>│ ░ ░ ░ ░ ░ ░ ░ ░ │</Mono>
          <Mono size={11} color={window.HM.textTer}>│ ░ ░ ░ ░ ░ ░ ░ ░ │</Mono>
          <Mono size={11} color={window.HM.textTer}>│ ░ ░ ░ ░ ░ ░ ░ ░ │</Mono>
          <Mono size={11} color={window.HM.textTer}>└─────────────────┘</Mono>
        </div>
        <Mono size={18} weight={700} tracking="-0.01em">no slates yet</Mono>
        <Mono size={12} color={window.HM.textSec} style={{ lineHeight:1.6, maxWidth:240 }}>
          pick a scope and tap regen. the engine will surface your top 6 combos with confidence + signal bars.
        </Mono>
        <div style={{ height:6 }}/>
        <button style={{
          background: window.HM.text, color: window.HM.bg,
          padding:'12px 22px', border:'none', borderRadius:6,
          fontFamily: window.HM.font, fontSize:11, fontWeight:700,
          letterSpacing:'0.18em', textTransform:'uppercase', cursor:'pointer',
        }}>start a slate</button>
        <Mono size={10} color={window.HM.textTer}>or — import past draws</Mono>
      </div>

      {tabBar==='ios' ? <BottomTabIOS active="explore"/> : <BottomTabAndroid active="explore"/>}
    </HMScreen>
  );
}

// ───────────────────────────────────────────────────────────────────────
// 07 — ONBOARDING / LEARN
// ───────────────────────────────────────────────────────────────────────
function OnboardingScreen({ density='normal', tabBar='ios', step=2 }) {
  const total = 4;
  return (
    <HMScreen padTop={54} padBottom={tabBar==='ios'?88:84}>
      <StatusRibbon engine="hm.engine v3.2" scope="—" state="setup" density={density}/>

      <div style={{ padding:'18px 16px', display:'flex', flexDirection:'column', gap:16 }}>
        {/* progress dots */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <Mono size={9} weight={700} tracking="0.18em" transform="uppercase" color={window.HM.textTer}>
            step {String(step).padStart(2,'0')} / {String(total).padStart(2,'0')}
          </Mono>
          <DottedRule/>
          <Mono size={9} weight={700} tracking="0.18em" transform="uppercase" color={window.HM.freq}>signals</Mono>
        </div>

        <Mono size={26} weight={700} tracking="-0.03em" style={{ lineHeight:1.15 }}>
          four signals.<br/>one combo.
        </Mono>

        <Mono size={12} color={window.HM.textSec} style={{ lineHeight:1.55 }}>
          every slate is scored across four channels. learn what each one says about your pick before you commit.
        </Mono>

        <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:6 }}>
          {[
            { l:'freq',    v:0.91, c:window.HM.freq, t:'how often this combo box appears in recent draws.' },
            { l:'mom',     v:0.78, c:window.HM.mom,  t:'velocity of repeat hits — is the pattern accelerating?' },
            { l:'pat',     v:0.83, c:window.HM.pat,  t:'shape similarity to known winning structures.' },
            { l:'cons',    v:0.95, c:window.HM.cons, t:'how steady the engine\'s signal has been over time.' },
          ].map((row,i) => (
            <div key={i} style={{
              background: window.HM.card, border:`1px solid ${window.HM.border}`,
              borderRadius:6, padding:'10px 12px',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                <Mono size={11} weight={700} tracking="0.14em" transform="uppercase" color={row.c}>{row.l}</Mono>
                <DottedRule/>
                <Mono size={11} weight={700} color={window.HM.text}>{row.v.toFixed(2).slice(1)}</Mono>
              </div>
              <SignalBar label="" value={row.v} color={row.c} dense valueFmt={()=>''}/>
              <Mono size={10} color={window.HM.textSec} style={{ lineHeight:1.5, display:'block', marginTop:6 }}>{row.t}</Mono>
            </div>
          ))}
        </div>

        {/* nav */}
        <div style={{ display:'flex', gap:8, marginTop:8 }}>
          <button style={{
            flex:1, padding:'12px', borderRadius:6,
            background:'transparent', border:`1px solid ${window.HM.border}`,
            fontFamily:window.HM.font, fontSize:11, fontWeight:700,
            letterSpacing:'0.18em', textTransform:'uppercase', color:window.HM.textSec,
          }}>back</button>
          <button style={{
            flex:2, padding:'12px', borderRadius:6,
            background:window.HM.text, border:'none', color:window.HM.bg,
            fontFamily:window.HM.font, fontSize:11, fontWeight:700,
            letterSpacing:'0.18em', textTransform:'uppercase',
          }}>continue →</button>
        </div>
      </div>

      {tabBar==='ios' ? <BottomTabIOS active="learn"/> : <BottomTabAndroid active="learn"/>}
    </HMScreen>
  );
}

Object.assign(window, {
  DashboardScreen, BuilderScreen, ResultsScreen, PickDetailModal,
  IntelligenceScreen, AccountScreen, EmptyScreen, OnboardingScreen,
  HMScreen,
});
