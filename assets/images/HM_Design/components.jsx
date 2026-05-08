// HitMaster — primitive components.
// All components reference window.HM (theme) so Tweaks can re-skin live.

const { useEffect, useState, useRef, useMemo } = React;

const HM_DEFAULT = {
  bg: '#0A0A0A',
  surface: '#121212',
  card: '#1A1A1A',
  track: '#1E1E1E',
  border: '#2A2A2A',
  text: '#FFFFFF',
  textSec: '#A0A0A0',
  textTer: '#666666',
  // signal channels
  freq: '#007AFF',
  mom:  '#FF3B30',
  pat:  '#5856D6',
  cons: '#FFCC00',
  font: "'JetBrains Mono', ui-monospace, monospace",
};
window.HM = window.HM || HM_DEFAULT;

// ── tiny atoms ─────────────────────────────────────────────────────────
function Mono({ children, size=12, weight=400, color, tracking=0, transform, style, ...rest }) {
  return (
    <span style={{
      fontFamily: window.HM.font, fontSize: size, fontWeight: weight,
      color: color ?? window.HM.text, letterSpacing: tracking,
      textTransform: transform, lineHeight: 1.2, ...style,
    }} {...rest}>{children}</span>
  );
}

// thin uppercase hint label
function Eyebrow({ children, color, size=9, gap=0.18, style }) {
  return (
    <Mono size={size} weight={700} tracking={`${gap}em`} transform="uppercase"
      color={color ?? window.HM.textTer} style={style}>{children}</Mono>
  );
}

function Dot({ color=window.HM.textTer, size=4, style }) {
  return <span style={{ width:size, height:size, borderRadius:size,
    background:color, display:'inline-block', flexShrink:0, ...style }} />;
}

function Hairline({ vertical=false, color, dashed=false, style }) {
  const c = color ?? window.HM.border;
  return <div style={{
    background: dashed ? 'transparent' : c,
    borderTop: dashed && !vertical ? `1px dashed ${c}` : undefined,
    borderLeft: dashed && vertical ? `1px dashed ${c}` : undefined,
    width: vertical ? 1 : '100%',
    height: vertical ? '100%' : 1,
    ...style,
  }} />;
}

// dotted divider used everywhere
function DottedRule({ char='·', color, style }) {
  const c = color ?? window.HM.textTer;
  return (
    <div aria-hidden style={{
      color: c, fontFamily: window.HM.font, fontSize: 10,
      lineHeight: 1, letterSpacing: '0.15em', overflow: 'hidden',
      whiteSpace: 'nowrap', userSelect: 'none', flex: '1 1 0', minWidth: 0,
      ...style,
    }}>{char.repeat(120)}</div>
  );
}

// ── SignalBar ──────────────────────────────────────────────────────────
function SignalBar({ label, value, color, width, dense=false, valueFmt, mini=false }) {
  const v = Math.max(0, Math.min(1, value));
  const c = color ?? window.HM.freq;
  const text = valueFmt ? valueFmt(v) : v.toFixed(2).slice(1); // ".87"
  const labelW = mini ? 28 : (dense ? 44 : 60);
  const valW = mini ? 22 : (dense ? 28 : 30);
  const trackH = mini ? 3 : 4;
  return (
    <div style={{ display:'flex', alignItems:'center', gap: mini?6:8, width }}>
      <Mono size={mini?8:9} weight={700} tracking="0.12em" transform="uppercase"
        color={window.HM.textSec} style={{ width: labelW, flexShrink:0 }}>{label}</Mono>
      <div style={{ flex:1, height:trackH, background: window.HM.track, borderRadius:2, overflow:'hidden' }}>
        <div style={{
          height:'100%', width:`${v*100}%`, background:c,
          boxShadow: v > 0.7 ? `0 0 8px ${c}66` : 'none',
        }}/>
      </div>
      <Mono size={mini?8:9} weight={700} tracking="0.06em"
        color={window.HM.text} style={{ width: valW, textAlign:'right', flexShrink:0 }}>{text}</Mono>
    </div>
  );
}

// ── RadialGauge (confidence dial) ──────────────────────────────────────
function RadialGauge({ value, size=72, stroke=4, color, label, sublabel, showValue=true }) {
  const v = Math.max(0, Math.min(1, value));
  const c = color ?? window.HM.freq;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  return (
    <div style={{ width:size, position:'relative', display:'inline-flex', flexDirection:'column', alignItems:'center', gap:6 }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} stroke={window.HM.track} strokeWidth={stroke} fill="none"/>
        <circle cx={size/2} cy={size/2} r={r} stroke={c} strokeWidth={stroke}
          fill="none" strokeLinecap="butt"
          strokeDasharray={`${C*v} ${C}`} transform={`rotate(-90 ${size/2} ${size/2})`}/>
        {/* tick marks */}
        {Array.from({length:24}).map((_,i)=>{
          const a = (i/24)*Math.PI*2 - Math.PI/2;
          const r1 = r - stroke - 1, r2 = r1 - 3;
          return <line key={i}
            x1={size/2 + Math.cos(a)*r1} y1={size/2 + Math.sin(a)*r1}
            x2={size/2 + Math.cos(a)*r2} y2={size/2 + Math.sin(a)*r2}
            stroke={window.HM.textTer} strokeWidth={0.7} opacity={0.5}/>;
        })}
        {showValue && (
          <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle"
            fill={window.HM.text} fontFamily={window.HM.font}
            fontWeight={700} fontSize={Math.round(size*0.26)} letterSpacing="-0.02em">
            {Math.round(v*100)}
          </text>
        )}
      </svg>
      {label && <Eyebrow size={8}>{label}</Eyebrow>}
      {sublabel && <Mono size={9} color={window.HM.textTer}>{sublabel}</Mono>}
    </div>
  );
}

// ── Sparkline ──────────────────────────────────────────────────────────
function Sparkline({ values, width=100, height=22, color, fill=true, dot=true }) {
  const c = color ?? window.HM.freq;
  if (!values?.length) return <div style={{ width, height }}/>;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v,i) => [
    (i/(values.length-1))*width,
    height - 2 - ((v-min)/span)*(height-4),
  ]);
  const d = pts.map(([x,y],i) => (i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)).join(' ');
  const area = d + ` L ${width} ${height} L 0 ${height} Z`;
  return (
    <svg width={width} height={height} style={{ display:'block', overflow:'visible' }}>
      {fill && <path d={area} fill={c} opacity={0.12}/>}
      <path d={d} fill="none" stroke={c} strokeWidth={1.25} strokeLinecap="round"/>
      {dot && <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r={1.8} fill={c}/>}
    </svg>
  );
}

// ── HeatmapStrip (calendar of hits) ────────────────────────────────────
function HeatmapStrip({ days, cols=14, cell=10, gap=2, color }) {
  const c = color ?? window.HM.cons;
  return (
    <div style={{ display:'grid', gridTemplateColumns:`repeat(${cols}, ${cell}px)`,
      gap, gridAutoRows: cell }}>
      {days.map((v,i) => {
        const intensity = Math.max(0, Math.min(1, v));
        const isHit = intensity > 0;
        return <div key={i} style={{
          width:cell, height:cell, borderRadius:1.5,
          background: isHit
            ? `${c}${Math.round(40 + intensity*215).toString(16).padStart(2,'0')}`
            : window.HM.track,
          border: isHit ? 'none' : `1px solid ${window.HM.track}`,
          boxSizing:'border-box',
        }}/>;
      })}
    </div>
  );
}

// ── StatusRibbon (header) ──────────────────────────────────────────────
function StatusRibbon({ engine='hm.engine v3.2', scope='ALLDAY', state='live', density='normal' }) {
  return (
    <div style={{
      padding: density==='compact' ? '8px 16px' : '10px 16px',
      borderBottom: `1px solid ${window.HM.border}`,
      background: window.HM.bg,
      display:'flex', alignItems:'center', gap:10,
    }}>
      <div style={{
        width:6, height:6, borderRadius:6, background: window.HM.cons,
        boxShadow: `0 0 8px ${window.HM.cons}aa`,
        animation: 'hmpulse 1.6s ease-in-out infinite',
      }}/>
      <Mono size={10} weight={700} tracking="0.08em" color={window.HM.text}>{engine}</Mono>
      <DottedRule />
      <Mono size={10} weight={700} tracking="0.14em" transform="uppercase"
        color={window.HM.textSec}>scope · {scope}</Mono>
      <div style={{ width:1, height:10, background:window.HM.border }}/>
      <Mono size={10} weight={700} tracking="0.14em" transform="uppercase"
        color={window.HM.cons}>{state}</Mono>
    </div>
  );
}

// ── SlateCard ─────────────────────────────────────────────────────────
function SlateCard({ rank, combo, confidence, energy, signals, hit, density='normal', style }) {
  // signals = { box, pburst, co, dgc }  each 0..1
  const compact = density === 'compact';
  return (
    <div style={{
      background: window.HM.card,
      border: `1px solid ${window.HM.border}`,
      borderRadius: 8,
      padding: compact ? '12px 14px' : '14px 16px',
      display:'flex', flexDirection:'column', gap: compact?10:12,
      position:'relative', overflow:'hidden',
      ...style,
    }}>
      {/* header */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <Mono size={9} weight={700} tracking="0.18em" transform="uppercase"
          color={window.HM.textTer}>rank</Mono>
        <Mono size={11} weight={700} color={window.HM.text}>#{String(rank).padStart(2,'0')}</Mono>
        <DottedRule />
        <Mono size={9} weight={700} tracking="0.18em" transform="uppercase"
          color={window.HM.textTer}>conf</Mono>
        <Mono size={11} weight={700} color={window.HM.freq}>{(confidence*100).toFixed(0)}</Mono>
        <div style={{ width:1, height:10, background:window.HM.border }}/>
        <Mono size={9} weight={700} tracking="0.18em" transform="uppercase"
          color={window.HM.textTer}>nrg</Mono>
        <div style={{ display:'flex', gap:2 }}>
          {Array.from({length:5}).map((_,i) => (
            <div key={i} style={{ width:4, height:9, borderRadius:1,
              background: i < energy ? window.HM.mom : window.HM.track }}/>
          ))}
        </div>
      </div>

      {/* combo */}
      <div style={{ display:'flex', alignItems:'baseline', gap: compact?8:10, paddingTop:4 }}>
        {String(combo).padStart(3,'0').split('').map((d,i) => (
          <div key={i} style={{ position:'relative' }}>
            <Mono size={compact?40:48} weight={700} tracking="-0.04em" color={window.HM.text}>{d}</Mono>
            {/* faint scanline */}
            <div style={{ position:'absolute', left:0, right:0, top:'48%', height:1,
              background:`linear-gradient(90deg, transparent, ${window.HM.border}, transparent)` }}/>
          </div>
        ))}
        <div style={{ flex:1 }}/>
        {hit !== undefined && (
          <div style={{
            display:'flex', alignItems:'center', gap:6,
            padding:'4px 8px', borderRadius:4,
            background: hit ? `${window.HM.cons}1a` : window.HM.track,
            border: `1px solid ${hit ? window.HM.cons : window.HM.border}`,
          }}>
            <Dot color={hit?window.HM.cons:window.HM.textTer} size={5}/>
            <Mono size={9} weight={700} tracking="0.14em" transform="uppercase"
              color={hit?window.HM.cons:window.HM.textTer}>{hit?'hit':'miss'}</Mono>
          </div>
        )}
      </div>

      {/* signals */}
      <div style={{ display:'flex', flexDirection:'column', gap:5, paddingTop:2 }}>
        <SignalBar label="box"    value={signals.box}    color={window.HM.freq} />
        <SignalBar label="pburst" value={signals.pburst} color={window.HM.mom}  />
        <SignalBar label="co"     value={signals.co}     color={window.HM.pat}  />
        <SignalBar label="dgc"    value={signals.dgc}    color={window.HM.cons} />
      </div>
    </div>
  );
}

// ── ScopeSwitcher (segmented) ──────────────────────────────────────────
function ScopeSwitcher({ value, onChange, items=['midday','evening','allday'] }) {
  return (
    <div style={{
      display:'flex', padding:3, gap:2, background: window.HM.card,
      border: `1px solid ${window.HM.border}`, borderRadius: 8,
    }}>
      {items.map((it) => (
        <button key={it} onClick={() => onChange?.(it)} style={{
          flex:1, padding:'8px 10px', borderRadius:5,
          background: value===it ? window.HM.surface : 'transparent',
          border: value===it ? `1px solid ${window.HM.border}` : '1px solid transparent',
          fontFamily: window.HM.font, fontSize:10, fontWeight:700,
          letterSpacing:'0.16em', textTransform:'uppercase',
          color: value===it ? window.HM.text : window.HM.textTer,
          cursor:'pointer',
        }}>{it}</button>
      ))}
    </div>
  );
}

// ── BottomTab — iOS style ─────────────────────────────────────────────
function BottomTabIOS({ active='intel' }) {
  const tabs = [
    { k:'acct',    label:'acct',    icon:<TabAcctIcon/> },
    { k:'results', label:'results', icon:<TabResultsIcon/> },
    { k:'explore', label:'explore', icon:<TabExploreIcon/> },
    { k:'intel',   label:'intel',   icon:<TabIntelIcon/> },
    { k:'learn',   label:'learn',   icon:<TabLearnIcon/> },
  ];
  return (
    <div style={{
      borderTop: `1px solid ${window.HM.border}`,
      background: window.HM.bg, padding:'8px 0 22px',
      display:'flex', justifyContent:'space-around',
    }}>
      {tabs.map(t => {
        const on = t.k === active;
        return (
          <div key={t.k} style={{
            display:'flex', flexDirection:'column', alignItems:'center', gap:5,
            color: on ? window.HM.text : window.HM.textTer,
          }}>
            {t.icon}
            <Mono size={8} weight={700} tracking="0.16em" transform="uppercase"
              color={on ? window.HM.text : window.HM.textTer}>{t.label}</Mono>
          </div>
        );
      })}
    </div>
  );
}

// ── BottomTab — Android style (M3 nav bar) ────────────────────────────
function BottomTabAndroid({ active='intel' }) {
  const tabs = [
    { k:'acct',    label:'acct',    icon:<TabAcctIcon/> },
    { k:'results', label:'results', icon:<TabResultsIcon/> },
    { k:'explore', label:'explore', icon:<TabExploreIcon/> },
    { k:'intel',   label:'intel',   icon:<TabIntelIcon/> },
    { k:'learn',   label:'learn',   icon:<TabLearnIcon/> },
  ];
  return (
    <div style={{
      borderTop: `1px solid ${window.HM.border}`,
      background: window.HM.bg, padding:'10px 0',
      display:'flex', justifyContent:'space-around',
    }}>
      {tabs.map(t => {
        const on = t.k === active;
        return (
          <div key={t.k} style={{
            display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'4px 0',
          }}>
            <div style={{
              padding:'4px 16px', borderRadius:14,
              background: on ? `${window.HM.freq}26` : 'transparent',
            }}>{t.icon}</div>
            <Mono size={9} weight={on?700:600} tracking="0.1em"
              color={on ? window.HM.text : window.HM.textSec}>{t.label}</Mono>
          </div>
        );
      })}
    </div>
  );
}

// ── tab icons — flat monochrome lines ─────────────────────────────────
const stroke = () => window.HM.text;
function TabIcon({ children }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none">{children}</svg>;
}
function TabAcctIcon(){ return <TabIcon><circle cx="12" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.6"/><path d="M5 20c1-3.5 4-5.5 7-5.5s6 2 7 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></TabIcon>; }
function TabResultsIcon(){ return <TabIcon><rect x="4" y="5" width="16" height="14" rx="1" stroke="currentColor" strokeWidth="1.6"/><path d="M7 9h10M7 12h6M7 15h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></TabIcon>; }
function TabExploreIcon(){ return <TabIcon><path d="M5 19l4-9 5 4 5-9" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"/><circle cx="9" cy="10" r="1.6" fill="currentColor"/><circle cx="14" cy="14" r="1.6" fill="currentColor"/><circle cx="19" cy="5" r="1.6" fill="currentColor"/></TabIcon>; }
function TabIntelIcon(){ return <TabIcon><circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.6"/><circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.6"/><circle cx="12" cy="12" r="1" fill="currentColor"/></TabIcon>; }
function TabLearnIcon(){ return <TabIcon><path d="M4 6l8-3 8 3-8 3-8-3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M7 9v5c2 1 3.5 2 5 2s3-1 5-2V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></TabIcon>; }

// ── App nav rows / kvs ────────────────────────────────────────────────
function KV({ k, v, color }) {
  return (
    <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
      <Mono size={9} weight={700} tracking="0.18em" transform="uppercase"
        color={window.HM.textTer}>{k}</Mono>
      <DottedRule/>
      <Mono size={11} weight={700} color={color ?? window.HM.text}>{v}</Mono>
    </div>
  );
}

// ── Section header used inside screens ────────────────────────────────
function ScreenSection({ title, hint, action, children, style }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10, ...style }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <Mono size={10} weight={700} tracking="0.18em" transform="uppercase"
          color={window.HM.textSec}>{title}</Mono>
        <DottedRule/>
        {hint && <Mono size={10} color={window.HM.textTer}>{hint}</Mono>}
        {action && action}
      </div>
      {children}
    </div>
  );
}

// ── chip ─────────────────────────────────────────────────────────────
function Chip({ children, color, active=false, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding:'5px 9px', borderRadius:4, border:`1px solid ${active?(color??window.HM.freq):window.HM.border}`,
      background: active ? `${color??window.HM.freq}1a` : 'transparent',
      color: active ? (color ?? window.HM.text) : window.HM.textSec,
      fontFamily: window.HM.font, fontSize:9, fontWeight:700,
      letterSpacing:'0.14em', textTransform:'uppercase', cursor:'pointer',
    }}>{children}</button>
  );
}

// expose
Object.assign(window, {
  Mono, Eyebrow, Dot, Hairline, DottedRule,
  SignalBar, RadialGauge, Sparkline, HeatmapStrip,
  StatusRibbon, SlateCard, ScopeSwitcher,
  BottomTabIOS, BottomTabAndroid, KV, ScreenSection, Chip,
});
