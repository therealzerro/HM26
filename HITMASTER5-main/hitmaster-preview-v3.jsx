import { useState, useEffect, useMemo, useCallback } from "react";

// ─── DRAW SCHEDULE (76 draws, ET) ─────────────────────────────────────────────
const DRAWS = {
  midday: [
    {state:"TN",label:"TN Morning",time:"9:53 AM",m:593},
    {state:"TX",label:"TX Morning",time:"10:44 AM",m:644,noSun:true},
    {state:"OH",label:"OH Midday",time:"12:14 PM",m:734},
    {state:"GA",label:"GA Midday",time:"12:14 PM",m:734},
    {state:"MI",label:"MI Midday",time:"12:24 PM",m:744},
    {state:"SC",label:"SC Midday",time:"12:30 PM",m:750},
    {state:"NJ",label:"NJ Midday",time:"12:40 PM",m:760},
    {state:"ME",label:"ME/NH/VT Mid",time:"12:49 PM",m:769},
    {state:"PA",label:"PA Midday",time:"12:50 PM",m:770},
    {state:"TN",label:"TN Midday",time:"12:53 PM",m:773},
    {state:"IA",label:"IA Midday",time:"12:58 PM",m:778},
    {state:"IN",label:"IN Midday",time:"12:59 PM",m:779},
    {state:"FL",label:"FL Midday",time:"1:00 PM",m:780},
    {state:"KY",label:"KY Midday",time:"1:05 PM",m:785},
    {state:"TX",label:"TX Day",time:"1:10 PM",m:790,noSun:true},
    {state:"IL",label:"IL Midday",time:"1:25 PM",m:805},
    {state:"DE",label:"DE Midday",time:"1:25 PM",m:805},
    {state:"MO",label:"MO Midday",time:"1:30 PM",m:810},
    {state:"VA",label:"VA Midday",time:"1:38 PM",m:818},
    {state:"AR",label:"AR Midday",time:"1:44 PM",m:824},
    {state:"ON",label:"ON Midday",time:"1:45 PM",m:825},
    {state:"DC",label:"DC Midday",time:"1:45 PM",m:825},
    {state:"CT",label:"CT Midday",time:"1:45 PM",m:825},
    {state:"KS",label:"KS Midday",time:"1:55 PM",m:835},
    {state:"WI",label:"WI Midday",time:"2:00 PM",m:840},
    {state:"NY",label:"NY Midday",time:"2:00 PM",m:840},
    {state:"NM",label:"NM Midday",time:"2:45 PM",m:885},
    {state:"NC",label:"NC Midday",time:"2:45 PM",m:885},
    {state:"CO",label:"CO Midday",time:"3:10 PM",m:910},
    {state:"MS",label:"MS Midday",time:"3:15 PM",m:915},
    {state:"ID",label:"ID Midday",time:"3:44 PM",m:944},
    {state:"CA",label:"CA Midday",time:"3:45 PM",m:945},
  ],
  evening: [
    {state:"PA",label:"PA Evening",time:"6:25 PM",m:1105},
    {state:"SC",label:"SC Evening",time:"6:30 PM",m:1110},
    {state:"WV",label:"WV Evening",time:"6:34 PM",m:1114,noWknd:true},
    {state:"ME",label:"ME/NH/VT Eve",time:"6:39 PM",m:1119},
    {state:"TX",label:"TX Evening",time:"6:43 PM",m:1123,noSun:true},
    {state:"GA",label:"GA Evening",time:"6:44 PM",m:1124},
    {state:"TN",label:"TN Evening",time:"6:53 PM",m:1133},
    {state:"MI",label:"MI Evening",time:"6:53 PM",m:1133},
    {state:"MN",label:"MN Evening",time:"7:00 PM",m:1140},
    {state:"DE",label:"DE Evening",time:"7:00 PM",m:1140},
    {state:"OH",label:"OH Evening",time:"7:14 PM",m:1154},
    {state:"AR",label:"AR Evening",time:"7:44 PM",m:1184},
    {state:"DC",label:"DC Evening",time:"7:45 PM",m:1185},
    {state:"AZ",label:"AZ Evening",time:"8:45 PM",m:1245},
    {state:"WC",label:"W.Canada",time:"8:50 PM",m:1250},
    {state:"QC",label:"QC Evening",time:"8:50 PM",m:1250},
    {state:"IA",label:"IA Evening",time:"8:58 PM",m:1258},
    {state:"IN",label:"IN Evening",time:"8:59 PM",m:1259},
    {state:"NE",label:"NE Evening",time:"9:15 PM",m:1275},
    {state:"FL",label:"FL Evening",time:"9:15 PM",m:1275},
    {state:"CO",label:"CO Evening",time:"9:15 PM",m:1275},
    {state:"CA",label:"CA Evening",time:"9:15 PM",m:1275},
    {state:"WI",label:"WI Evening",time:"9:30 PM",m:1290},
    {state:"MO",label:"MO Evening",time:"9:40 PM",m:1300},
    {state:"OK",label:"OK Evening",time:"9:45 PM",m:1305},
    {state:"ID",label:"ID Evening",time:"9:45 PM",m:1305},
    {state:"KS",label:"KS Evening",time:"9:55 PM",m:1315},
    {state:"NY",label:"NY Evening",time:"10:00 PM",m:1320},
    {state:"MS",label:"MS Evening",time:"10:00 PM",m:1320},
    {state:"IL",label:"IL Evening",time:"10:05 PM",m:1325},
    {state:"CT",label:"CT Evening",time:"10:14 PM",m:1334},
    {state:"ON",label:"ON Evening",time:"10:15 PM",m:1335},
    {state:"LA",label:"LA Evening",time:"10:25 PM",m:1345},
    {state:"WA",label:"WA Evening",time:"10:30 PM",m:1350},
    {state:"VA",label:"VA Evening",time:"10:30 PM",m:1350},
    {state:"GA",label:"GA Night",time:"10:35 PM",m:1355},
    {state:"NJ",label:"NJ Evening",time:"10:40 PM",m:1360},
    {state:"KY",label:"KY Evening",time:"10:45 PM",m:1365},
    {state:"NC",label:"NC Evening",time:"10:50 PM",m:1370},
    {state:"TX",label:"TX Night",time:"10:55 PM",m:1375,noSun:true},
    {state:"DC",label:"DC Night",time:"10:59 PM",m:1379},
    {state:"NM",label:"NM Evening",time:"11:15 PM",m:1395},
  ]
};

function getETMin(){const et=new Date(new Date().toLocaleString("en-US",{timeZone:"America/New_York"}));return et.getHours()*60+et.getMinutes();}
function getETDow(){return new Date(new Date().toLocaleString("en-US",{timeZone:"America/New_York"})).getDay();}
function getActiveSession(){const m=getETMin();if(m>=540&&m<950)return"midday";if(m>=1100&&m<1400)return"evening";return"midday";}
function getDrawsForSession(s){
  const dow=getETDow();
  const list=s==="allday"?[...DRAWS.midday,...DRAWS.evening]:DRAWS[s]||DRAWS.midday;
  return list.filter(d=>!(d.noSun&&dow===0)&&!(d.noWknd&&(dow===0||dow===6)));
}
function getNextDraw(s){
  const min=getETMin(),dow=getETDow();
  const list=DRAWS[s==="allday"?"midday":s]||DRAWS.midday;
  const ok=list.filter(d=>!(d.noSun&&dow===0)&&!(d.noWknd&&(dow===0||dow===6))&&d.m>min);
  return ok[0]||list[0];
}
function getCountdown(tm){const cur=getETMin();let d=tm-cur;if(d<0)d+=1440;const h=Math.floor(d/60),m=d%60;return h>0?h+"h "+m+"m":m+"m";}

// ─── DRAWING REPORT CARD — True vs Computerized per state ────────────────────
// Source: Lottery Post Drawing Report Card
// Physical ball machines = reproducible statistical patterns → FULL signal confidence
// Computerized RNG = designed to eliminate patterns → dampened confidence
// This directly affects ZK6's signal reliability per state's draw method.
const DRAW_CONFIDENCE = {
  // Grade A+ (100% true drawings — full confidence)
  PR:1.00, SC:1.00, TX:1.00,
  // Grade A (89-92% true drawings)
  OH:0.97, NY:0.95, CT:0.94, NJ:0.94, NH:0.93, VT:0.93, MA:0.92,
  // Grade B (62-78% true drawings)
  FL:0.88, WV:0.85, GA:0.82, VA:0.80,
  // Grade C (43-58% true drawings)
  MI:0.78, NC:0.77, ME:0.76, SD:0.75, PA:0.74, MT:0.72, OK:0.72,
  // Grade D (30-40% true drawings)
  CA:0.70, CO:0.70, AZ:0.68, IA:0.68, KS:0.68, KY:0.68, MN:0.68, NM:0.68, WA:0.68,
  ID:0.66, NE:0.66, LA:0.65, ND:0.62, WY:0.62, IN:0.61,
  // Grade D-/F (18-29% true drawings)
  MS:0.56, AR:0.55, IL:0.55, MO:0.54, TN:0.53, DC:0.53,
  DE:0.52, MD:0.52, WI:0.50,
  // Canada — 0% true drawings (fully computerized RNG)
  ON:0.45, QC:0.45, WC:0.42,
};

// Get average confidence for a scope's draws — used to modulate signal display
function getScopeConfidence(scope) {
  const draws = scope==="allday"
    ? [...DRAWS.midday,...DRAWS.evening]
    : DRAWS[scope]||DRAWS.midday;
  const scores = draws.map(d=>DRAW_CONFIDENCE[d.state]||0.65);
  return scores.reduce((a,b)=>a+b,0)/scores.length;
}

// ─── ZK6 ENGINE v2.1 — with Drawing Confidence + Recency Burst ───────────────
const HORIZONS=["H01Y","H02Y","H03Y","H04Y","H05Y","H06Y","H07Y","H08Y","H09Y","H10Y"];
// Proprietary decay profile — not exposed to users
const _HD={H01Y:.350,H02Y:.220,H03Y:.140,H04Y:.090,H05Y:.060,H06Y:.045,H07Y:.030,H08Y:.025,H09Y:.020,H10Y:.020};
// Proprietary weight sets — not exposed to users
const _WTS={balanced:{BOX:.40,PBURST:.40,CO:.20},conservative:{BOX:.70,PBURST:.20,CO:.10},aggressive:{BOX:.25,PBURST:.45,CO:.30}};
const _MP={singles:.000,doubles:-.020,triples:-.045};

const toSet=c=>"{"+c.split("").sort().join(",")+"}"
const _sp=(a,b)=>[a,b].sort().join("");
const _mult=c=>c[0]===c[1]&&c[1]===c[2]?"triples":c[0]===c[1]||c[1]===c[2]||c[0]===c[2]?"doubles":"singles";
const _aP=c=>{const[a,b,d]=c.split("");return[_sp(a,b),_sp(b,d),_sp(a,d)];};
const _tP=c=>_aP(c).sort()[0];
const _pR=(v,s)=>{if(!s.length)return.5;let lo=0,hi=s.length;while(lo<hi){const m=(lo+hi)>>1;if(s[m]<=v)lo=m+1;else hi=m;}return lo/s.length;};
const _w=(arr,p=.99)=>{const s=[...arr].sort((a,b)=>a-b);const cap=s[Math.floor(s.length*p)];return arr.map(v=>Math.min(v,cap));};
const _bH=byH=>{let tw=0,bv=0;for(const[h,v]of Object.entries(byH)){const w=_HD[h]||0;bv+=w*v;tw+=w;}return tw>0?bv/tw:0;};

function _buildDS(){
  let s=42;const r=()=>{s=((s*1664525+1013904223)|0);return(s>>>0)/4294967296;};
  const bDS={};
  for(let i=0;i<1000;i++){const set=toSet(i.toString().padStart(3,"0"));bDS[set]={};HORIZONS.forEach((h,hi)=>{bDS[set][h]=Math.max(0,Math.floor(Math.pow(r(),.4)*300)+Math.floor(r()*40)-hi*3);});}
  const pDS={};
  for(let a=0;a<=9;a++)for(let b=a;b<=9;b++){const pair=`${a}${b}`;pDS[pair]={};[2,3,4,5,6,7,8,9,10,11].forEach(cls=>{pDS[pair][cls]={};HORIZONS.forEach(h=>{pDS[pair][cls][h]=Math.max(0,Math.floor(r()*100));});});}
  return{bDS,pDS};
}
const _DS=_buildDS();

function _bestOrder(combo,pDS){
  const digits=combo.split("");const perms=new Set();
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)for(let k=0;k<3;k++)if(i!==j&&j!==k&&i!==k)perms.add(digits[i]+digits[j]+digits[k]);
  let best=combo,bs=-1;
  for(const p of perms){const[a,b,d]=p.split("");const sc=((pDS[_sp(a,b)]&&pDS[_sp(a,b)][2]?_bH(pDS[_sp(a,b)][2]):0)+(pDS[_sp(b,d)]&&pDS[_sp(b,d)][3]?_bH(pDS[_sp(b,d)][3]):0)+(pDS[_sp(a,d)]&&pDS[_sp(a,d)][4]?_bH(pDS[_sp(a,d)][4]):0))/3;if(sc>bs){bs=sc;best=p;}}
  return best;
}

// Public API — scores only, no formula exposed
function computeSlate(scope,mode){
  const w=_WTS[mode||"balanced"];const{bDS,pDS}=_DS;
  const uni=Array.from({length:1000},(_,i)=>i.toString().padStart(3,"0"));
  const excl=scope==="evening"?new Set(["742","319"]):new Set();
  const rawB=[],rawP=[],rawC=[],rawBurst=[];
  const bBox={},bPB={},bCO={},bBurst={};

  // Drawing confidence for this scope — physical ball machine states weight higher
  const scopeConf = getScopeConfidence(scope);

  uni.forEach(combo=>{
    const set=toSet(combo);
    // Standard blended signals
    bBox[combo]=bDS[set]?_bH(bDS[set]):0;rawB.push(bBox[combo]);
    const pairs=_aP(combo);
    bPB[combo]=pairs.map((p,i)=>{const cls=i+2;return pDS[p]&&pDS[p][cls]?_bH(pDS[p][cls]):0;}).reduce((a,b)=>a+b,0)/3;rawP.push(bPB[combo]);
    bCO[combo]=pairs.map(p=>{let sm=0,n=0;[5,6,7,8,9,10,11].forEach(cls=>{if(pDS[p]&&pDS[p][cls]){sm+=_bH(pDS[p][cls]);n++;}});return n?sm/n:0;}).reduce((a,b)=>a+b,0)/3;rawC.push(bCO[combo]);

    // IMPROVEMENT: Recency Burst Detection
    // If H01Y DrawsSince >> overall average → combo building extra pressure
    const h1Val = (bDS[set] && bDS[set]["H01Y"]) ? bDS[set]["H01Y"] : 0;
    const avgVal = bBox[combo];
    const burstRatio = avgVal>0?(h1Val/Math.max(avgVal,1)):0;
    bBurst[combo] = Math.min(burstRatio, 3)/3; // normalize 0-1, cap at 3x
    rawBurst.push(bBurst[combo]);
  });

  const wB=_w(rawB),wP=_w(rawP),wC=_w(rawC),wBurst=_w(rawBurst);
  const sB=[...wB].sort((a,b)=>a-b),sP=[...wP].sort((a,b)=>a-b),sC=[...wC].sort((a,b)=>a-b),sBurst=[...wBurst].sort((a,b)=>a-b);

  const scored=uni.filter(c=>!excl.has(c)).map(combo=>{
    const i=uni.indexOf(combo);const m=_mult(combo);
    const BOX=_pR(wB[i],sB),PBURST=_pR(wP[i],sP),CO=_pR(wC[i],sC);
    const BURST=_pR(wBurst[i],sBurst);

    // IMPROVEMENT: Drawing confidence modulates signal strength
    // High-confidence states (physical ball machines) get full weight
    // Low-confidence states (computerized RNG) get dampened BOX/PBURST signals
    const confMod = 0.7 + (scopeConf * 0.3); // range 0.7–1.0
    const adjBOX = BOX * confMod;
    const adjPBURST = PBURST * confMod;

    // IMPROVEMENT: Recency burst bonus (5% weight on burst signal)
    const ind = w.BOX*adjBOX + w.PBURST*adjPBURST + w.CO*CO + (BURST*0.05) + _MP[m];

    return{
      combo,comboSet:toSet(combo),ind,
      signals:{BOX,PBURST,CO,BURST},
      mult:m,topPair:_tP(combo),energy:0,
      bestOrder:_bestOrder(combo,pDS),
      confidence:Math.round(scopeConf*100)
    };
  });

  scored.sort((a,b)=>b.ind!==a.ind?b.ind-a.ind:b.signals.BOX!==a.signals.BOX?b.signals.BOX-a.signals.BOX:b.signals.PBURST!==a.signals.PBURST?b.signals.PBURST-a.signals.PBURST:a.combo.localeCompare(b.combo));
  const allInd=[...scored.map(s=>s.ind)].sort((a,b)=>a-b);
  scored.forEach(s=>{s.energy=Math.round(_pR(s.ind,allInd)*100);});
  const k6=[];let si=0,di=0;const pc={};
  for(const s of scored){
    if(s.mult==="singles"&&si>=4)continue;if(s.mult==="doubles"&&di>=2)continue;if(s.mult==="triples")continue;
    const c=pc[s.topPair]||0;if(c>=2)continue;
    k6.push({...s,rank:k6.length+1});
    if(s.mult==="singles")si++;else if(s.mult==="doubles")di++;pc[s.topPair]=c+1;if(k6.length>=6)break;
  }
  const hs=k6.map(x=>x.combo).join("")+(mode||"balanced");
  const hash=hs.split("").reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a;},0).toString(16).toUpperCase().replace("-","");
  return{k6,hash,scope,horizonsPresent:Object.fromEntries(HORIZONS.map((h,i)=>[h,i<4])),
    confidence:Math.round(scopeConf*100),
    engineVersion:"v2.1"};
}

// Mock ledger
function _buildLedger(){
  let s=99;const r=()=>{s=((s*1664525+1013904223)|0);return(s>>>0)/4294967296;};
  const rD=()=>Math.floor(r()*10).toString();
  const dates=["2026-04-13","2026-04-12","2026-04-11","2026-04-10","2026-04-09"];
  const rows=[];
  dates.forEach(date=>{
    [...DRAWS.midday,...DRAWS.evening].forEach(draw=>{
      const digits=rD()+rD()+rD();
      rows.push({date,state:draw.state,label:draw.label,session:DRAWS.midday.includes(draw)?"midday":"evening",time:draw.time,result:digits,comboSet:toSet(digits),front:digits.slice(0,2),back:digits.slice(1,3),split:digits[0]+digits[2]});
    });
  });
  return rows;
}
const LEDGER=_buildLedger();

// ─── COSMIC DESIGN SYSTEM ─────────────────────────────────────────────────────
const C={
  // Cosmic backgrounds
  bg:"#FAF7FF",bgCard:"#FFFFFF",bgMuted:"#F0EBFF",bgMutedD:"#E4DAFB",
  border:"#DDD6FE",borderMed:"#C4B5FD",
  // Cosmic ink
  ink:"#1E1B4B",inkSec:"#4C3D8F",inkTer:"#8B7EC8",
  // Primary — deep indigo/violet
  primary:"#7C3AED",primaryL:"#EDE9FE",primaryG:"#7C3AED22",
  // Gold — oracle/divine
  gold:"#D97706",goldL:"#FEF3C7",starGold:"#FCD34D",
  orange:"#EA580C",orangeL:"#FFF7ED",
  // Signal colors
  green:"#059669",greenL:"#ECFDF5",
  red:"#DC2626",redL:"#FEF2F2",
  rose:"#BE185D",roseL:"#FDF2F8",
  teal:"#0D9488",tealL:"#F0FDFA",
  // Cosmic special
  cosmic:"#4C1D95",cosmicL:"#F5F3FF",
  magenta:"#9D174D",
  // Tier colors
  free:"#6B7280",pro:"#D97706",plus:"#7C3AED",
};
const F="'Sora',system-ui,sans-serif";
const M="'JetBrains Mono','Courier New',monospace";
const fET=()=>new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true})+" ET";

// Energy = user-facing name for Temperature (hides calculation)
const eC=e=>e>=80?C.red:e>=65?C.orange:e>=45?C.gold:C.inkTer;
const eBg=e=>e>=80?C.redL:e>=65?C.orangeL:e>=45?C.goldL:C.bgMuted;
const eE=e=>e>=80?"🔥":e>=65?"⚡":e>=45?"✦":"❄";
const eL=e=>e>=80?"BLAZING":e>=65?"HOT":e>=45?"WARM":"COOL";
const mCol=m=>m==="singles"?C.primary:m==="doubles"?C.teal:C.rose;

// ─── BASE COMPONENTS ─────────────────────────────────────────────────────────
function Pill({label,color,bg,xs}){
  const col=color||C.primary;
  return React.createElement("span",{
    style:{fontSize:xs?9:10,fontWeight:800,letterSpacing:1,padding:xs?"2px 6px":"3px 9px",
      borderRadius:99,background:bg||col+"18",color:col,border:"1px solid "+col+"30",whiteSpace:"nowrap"}
  },label);
}
function Tag({label,color}){
  const col=color||C.inkSec;
  return React.createElement("span",{
    style:{fontSize:10,padding:"2px 8px",borderRadius:99,background:col+"14",color:col,
      fontWeight:600,border:"1px solid "+col+"22",whiteSpace:"nowrap"}
  },label);
}
function Card({children,style,glow,onClick}){
  const[hov,setHov]=useState(false);
  const cl=!!onClick;
  return React.createElement("div",{
    onClick,
    onMouseEnter:cl?()=>setHov(true):undefined,
    onMouseLeave:cl?()=>setHov(false):undefined,
    style:{
      background:C.bgCard,borderRadius:18,border:"1px solid "+(hov?C.borderMed:C.border),
      boxShadow:glow?"0 0 0 3px "+glow+"22,0 6px 28px "+glow+"18":hov&&cl?"0 4px 24px "+C.primary+"18":"0 2px 12px #1E1B4B06",
      transition:"all .18s",cursor:cl?"pointer":"default",...(style||{})
    }
  },children);
}
function Btn({children,onClick,v,sm,lg,full,disabled,style}){
  const[hov,setHov]=useState(false);
  const vt=v||"primary";
  const vs={
    primary:{bg:disabled?"#C4B5FD":C.primary,col:"#fff",sh:hov&&!disabled?"0 4px 16px "+C.primary+"55":"none"},
    gold:{bg:"linear-gradient(135deg,"+C.gold+","+C.orange+")",col:"#fff",sh:hov?"0 4px 16px "+C.gold+"55":"none"},
    cosmic:{bg:"linear-gradient(135deg,"+C.cosmic+","+C.primary+")",col:"#fff",sh:hov?"0 4px 16px "+C.primary+"55":"none"},
    ghost:{bg:hov?C.bgMuted:"transparent",col:C.inkSec,bdr:"1px solid "+C.border},
    outline:{bg:"transparent",col:C.primary,bdr:"1.5px solid "+C.primary},
    danger:{bg:C.red,col:"#fff"},
  }[vt]||{bg:C.primary,col:"#fff"};
  return React.createElement("button",{
    onClick:disabled?undefined:onClick,
    onMouseEnter:()=>setHov(true),onMouseLeave:()=>setHov(false),
    style:{border:vs.bdr||"none",borderRadius:11,fontWeight:700,cursor:disabled?"not-allowed":"pointer",fontFamily:F,
      fontSize:sm?12:lg?15:13,padding:sm?"6px 14px":lg?"13px 28px":"9px 18px",
      width:full?"100%":undefined,background:vs.bg,color:vs.col,boxShadow:vs.sh||"none",
      opacity:disabled?.6:1,transform:hov&&!disabled?"scale(1.02)":"scale(1)",transition:"all .15s",...(style||{})}
  },children);
}
function SecTitle({children,action,sub}){
  return React.createElement("div",{style:{marginBottom:12,marginTop:26}},
    React.createElement("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between"}},
      [React.createElement("span",{key:"t",style:{fontSize:10,fontWeight:800,color:C.inkTer,letterSpacing:2,textTransform:"uppercase"}},children),
       action&&React.createElement("span",{key:"a"},action)]),
    sub&&React.createElement("div",{style:{fontSize:11,color:C.inkTer,marginTop:2}},sub));
}
// Cosmic divider with stars
function StarDivider(){
  return React.createElement("div",{style:{display:"flex",alignItems:"center",gap:8,margin:"20px 0",opacity:.4}},
    [React.createElement("div",{key:"l",style:{flex:1,height:1,background:"linear-gradient(90deg,transparent,"+C.borderMed+")"}}),
     React.createElement("span",{key:"s",style:{fontSize:10,color:C.primary}},"✦ ✧ ✦"),
     React.createElement("div",{key:"r",style:{flex:1,height:1,background:"linear-gradient(90deg,"+C.borderMed+",transparent)"}})]
  );
}
// Signal bar (named "Signal" not "Component" — no formula exposed)
function SignalBar({label,value,color,delay}){
  const[a,setA]=useState(0);
  useEffect(()=>{const t=setTimeout(()=>setA(value),(delay||0)+300);return()=>clearTimeout(t);},[value,delay]);
  return React.createElement("div",{style:{display:"flex",alignItems:"center",gap:7,marginBottom:4}},
    [React.createElement("span",{key:"l",style:{fontSize:9,color:C.inkTer,width:48,textAlign:"right",fontFamily:M,fontWeight:600}},label),
     React.createElement("div",{key:"track",style:{flex:1,height:5,background:C.bgMuted,borderRadius:3,overflow:"hidden"}},
       React.createElement("div",{style:{width:a*100+"%",height:"100%",borderRadius:3,
         background:"linear-gradient(90deg,"+color+"60,"+color+")",
         transition:"width .9s cubic-bezier(.34,1.2,.64,1)"}})),
     React.createElement("span",{key:"v",style:{fontSize:9,color,width:22,fontFamily:M,fontWeight:800}},
       Math.round(value*100))]);
}

// ─── LIVE RESULTS TICKER ──────────────────────────────────────────────────────
function LiveResultsTicker(){
  const[pos,setPos]=useState(0);
  // Build ticker items from recent ledger data
  const items = useMemo(()=>{
    const today = LEDGER.filter(r=>r.date==="2026-04-13").slice(0,30);
    return today.map(r=>({
      state:r.state, session:r.session, time:r.time,
      result:r.result, label:r.label
    }));
  },[]);

  useEffect(()=>{
    const interval = setInterval(()=>{
      setPos(p=>(p+1)%Math.max(1,items.length));
    },2200);
    return()=>clearInterval(interval);
  },[items.length]);

  const visible = [...items,...items].slice(pos, pos+8);

  return React.createElement("div",{
    style:{background:"linear-gradient(135deg,"+C.ink+","+C.cosmic+")",borderRadius:14,
      padding:"10px 0",overflow:"hidden",marginBottom:16,position:"relative"}
  },[
    // Label
    React.createElement("div",{key:"label",style:{position:"absolute",left:0,top:0,bottom:0,zIndex:3,
      display:"flex",alignItems:"center",padding:"0 14px",
      background:"linear-gradient(90deg,"+C.cosmic+",transparent)",
      fontSize:9,fontWeight:800,color:C.starGold,letterSpacing:1.5,whiteSpace:"nowrap"}},
      "⚡ LIVE"),
    // Scrolling track
    React.createElement("div",{key:"track",style:{display:"flex",gap:0,paddingLeft:70,
      transition:"transform 0.6s cubic-bezier(0.25,0.1,0.25,1)",overflow:"hidden"}},
      visible.map((item,i)=>React.createElement("div",{key:i,
        style:{display:"flex",alignItems:"center",gap:8,padding:"0 16px",
          borderRight:"1px solid rgba(255,255,255,.12)",flexShrink:0}},
        [React.createElement("div",{key:"state",style:{
            width:26,height:26,borderRadius:6,
            background:item.session==="midday"?"rgba(217,119,6,.3)":"rgba(37,99,235,.3)",
            border:"1px solid "+(item.session==="midday"?"rgba(217,119,6,.5)":"rgba(37,99,235,.5)"),
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:9,fontWeight:800,color:item.session==="midday"?C.starGold:"#93C5FD",flexShrink:0
          }},item.state),
         React.createElement("div",{key:"info"},
           [React.createElement("div",{key:"r",style:{fontSize:15,fontWeight:900,color:"#fff",letterSpacing:3,fontFamily:M,lineHeight:1}},item.result),
            React.createElement("div",{key:"t",style:{fontSize:9,color:"rgba(255,255,255,.5)",marginTop:1}},item.time)]),
        ]
      ))),
    // Fade right
    React.createElement("div",{key:"fade",style:{position:"absolute",right:0,top:0,bottom:0,width:40,
      background:"linear-gradient(90deg,transparent,"+C.cosmic+")"}})
  ]);
}

// ─── DRAW TICKER ─────────────────────────────────────────────────────────────
function DrawTicker({session}){
  const[,tick]=useState(0);
  useEffect(()=>{const i=setInterval(()=>tick(x=>x+1),30000);return()=>clearInterval(i);},[]);
  const s=session==="allday"?"midday":(session||getActiveSession());
  const next=getNextDraw(s);const all=getDrawsForSession(s);const cur=getETMin();
  const done=all.filter(d=>d.m<=cur).length;
  return React.createElement("div",{
    style:{background:"linear-gradient(135deg,"+C.primaryG+","+C.bgMuted+")",borderRadius:14,
      padding:"12px 16px",border:"1.5px solid "+C.border,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}
  },
    [React.createElement("div",{key:"next"},
       [React.createElement("div",{key:"l",style:{fontSize:9,color:C.inkTer,fontWeight:800,letterSpacing:1.5,marginBottom:3}},"✦ NEXT DRAW"),
        React.createElement("div",{key:"v",style:{fontSize:18,fontWeight:900,color:C.primary,fontFamily:M}},next?getCountdown(next.m):"—"),
        next&&React.createElement("div",{key:"n",style:{fontSize:11,color:C.inkSec}},next.label+" · "+next.time)]),
     React.createElement("div",{key:"sep",style:{width:1,height:36,background:C.border}}),
     React.createElement("div",{key:"stats",style:{display:"flex",gap:14}},
       [{v:done,l:"DONE",c:C.green},{v:all.length-done,l:"LEFT",c:C.gold},{v:all.length,l:"TODAY",c:C.ink}]
         .map(x=>React.createElement("div",{key:x.l,style:{textAlign:"center"}},
           [React.createElement("div",{key:"v",style:{fontSize:17,fontWeight:900,color:x.c,fontFamily:M}},x.v),
            React.createElement("div",{key:"l",style:{fontSize:8,color:C.inkTer,fontWeight:700,letterSpacing:1}},x.l)])))]);
}

// ─── ENERGY METER (replaces "Heat Meter" — formula hidden) ───────────────────
function EnergyMeter({energy}){
  const[a,setA]=useState(0);
  useEffect(()=>{const t=setTimeout(()=>setA(energy),200);return()=>clearTimeout(t);},[energy]);
  const col=eC(energy);
  return React.createElement("div",{style:{textAlign:"center"}},
    [React.createElement("div",{key:"gauge",style:{position:"relative",width:148,height:148,margin:"0 auto"}},
       [React.createElement("svg",{key:"s",width:148,height:148,style:{transform:"rotate(-135deg)"}},
          [React.createElement("circle",{key:"bg",cx:74,cy:74,r:57,fill:"none",stroke:C.bgMuted,strokeWidth:10,strokeDasharray:"179 239",strokeLinecap:"round"}),
           React.createElement("circle",{key:"fg",cx:74,cy:74,r:57,fill:"none",stroke:col,strokeWidth:10,
             strokeDasharray:(a/100*179)+" 239",strokeLinecap:"round",
             style:{transition:"stroke-dasharray 1.1s cubic-bezier(.34,1.4,.64,1)",filter:"drop-shadow(0 0 8px "+col+"99)"}})]),
        React.createElement("div",{key:"inner",style:{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}},
          [React.createElement("span",{key:"n",style:{fontSize:34,fontWeight:900,color:col,fontFamily:M,lineHeight:1,fontVariantNumeric:"tabular-nums"}},energy),
           React.createElement("span",{key:"l",style:{fontSize:9,color:C.inkTer,marginTop:2,letterSpacing:1.5}},"ENERGY"),
           React.createElement("span",{key:"e",style:{fontSize:18,marginTop:2}},eE(energy))])]),
     React.createElement("span",{key:"badge",style:{
       fontSize:11,fontWeight:800,color:col,letterSpacing:2,
       background:eBg(energy),padding:"4px 16px",borderRadius:99,
       border:"1px solid "+col+"33",marginTop:8,display:"inline-block"
     }},eL(energy))]);
}

// ─── PICK CARD ────────────────────────────────────────────────────────────────
function PickCard({pick,locked,delay,onOpen,isPro}){
  const[vis,setVis]=useState(false);const[hov,setHov]=useState(false);
  useEffect(()=>{const t=setTimeout(()=>setVis(true),delay||0);return()=>clearTimeout(t);},[delay]);
  const col=eC(pick.energy);
  if(locked) return React.createElement(Card,{
    style:{padding:"16px 20px",overflow:"hidden",position:"relative",
      transform:vis?"translateY(0)":"translateY(20px)",opacity:vis?1:0,
      transition:"transform .4s ease "+(delay||0)+"ms,opacity .4s ease "+(delay||0)+"ms"}
  },[
    React.createElement("div",{key:"blur",style:{display:"flex",gap:14,filter:"blur(3px)",opacity:.35,pointerEvents:"none",alignItems:"flex-start"}},
      [React.createElement("div",{key:"r",style:{width:38,height:38,borderRadius:11,background:C.bgMuted,flexShrink:0}}),
       React.createElement("div",{key:"b",style:{flex:1}},[React.createElement("div",{key:"a",style:{width:80,height:22,background:C.bgMuted,borderRadius:6,marginBottom:8}}),React.createElement("div",{key:"c",style:{width:140,height:8,background:C.bgMuted,borderRadius:3}})]),
       React.createElement("div",{key:"t",style:{width:52,height:52,borderRadius:13,background:C.bgMuted}})]),
    React.createElement("div",{key:"ov",style:{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
      background:"linear-gradient(135deg,"+C.bgCard+"EE,"+C.goldL+"CC)"}},
      React.createElement("div",{style:{textAlign:"center"}},
        [React.createElement("div",{key:"c",style:{fontSize:22,marginBottom:4}},"🏠"),
         React.createElement("div",{key:"l",style:{fontSize:12,fontWeight:800,color:C.ink,marginBottom:6}},"Slate #"+pick.rank+" — Oracle Only"),
         React.createElement(Pill,{key:"p",label:"UNLOCK ♛",color:C.pro})]))]);
  return React.createElement(Card,{glow:hov?col:undefined,onClick:()=>onOpen&&onOpen(pick),
    style:{padding:"16px 20px",transform:vis?"translateY(0)":"translateY(20px)",opacity:vis?1:0,
      transition:"transform .4s ease "+(delay||0)+"ms,opacity .4s ease "+(delay||0)+"ms"}},
    React.createElement("div",{onMouseEnter:()=>setHov(true),onMouseLeave:()=>setHov(false),style:{display:"flex",alignItems:"flex-start",gap:14}},
      [React.createElement("div",{key:"rank",style:{minWidth:38,height:38,borderRadius:11,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
         background:pick.rank===1?"linear-gradient(135deg,"+C.starGold+","+C.gold+")":C.bgMuted,
         border:"1.5px solid "+(pick.rank===1?C.gold+"55":C.border),
         boxShadow:pick.rank===1?"0 2px 10px "+C.gold+"44":"none"}},
         React.createElement("span",{style:{fontSize:12,fontWeight:900,color:pick.rank===1?"#fff":C.inkTer,fontFamily:M}},"#"+pick.rank)),
       React.createElement("div",{key:"body",style:{flex:1,minWidth:0}},
         [React.createElement("div",{key:"cr",style:{display:"flex",alignItems:"baseline",gap:8,marginBottom:4}},
            [React.createElement("span",{key:"c",style:{fontSize:26,fontWeight:900,color:C.ink,letterSpacing:4,fontFamily:M,lineHeight:1}},pick.combo),
             React.createElement("span",{key:"s",style:{fontSize:10,color:C.inkTer,fontFamily:M}},pick.comboSet)]),
          pick.bestOrder!==pick.combo
            ?React.createElement("div",{key:"best",style:{fontSize:10,color:C.primary,fontFamily:M,fontWeight:700,marginBottom:6,background:C.primaryL,borderRadius:6,padding:"2px 8px",display:"inline-block"}},
               "✦ Optimal straight: "+pick.bestOrder)
            :React.createElement("div",{key:"best2",style:{fontSize:10,color:C.inkTer,fontFamily:M,marginBottom:6}},
               "Optimal: "+pick.bestOrder),
          React.createElement("div",{key:"chips",style:{display:"flex",gap:5,marginBottom:8,flexWrap:"wrap"}},
            [React.createElement(Tag,{key:"m",label:pick.mult,color:mCol(pick.mult)}),
             React.createElement(Tag,{key:"p",label:"Pair "+pick.topPair,color:C.primary}),
             pick.rank===1&&React.createElement(Tag,{key:"top",label:"🌟 Top Slate",color:C.gold})]),
          React.createElement(SignalBar,{key:"box",label:"Frequency",value:pick.signals.BOX,color:C.primary,delay}),
          React.createElement(SignalBar,{key:"pb",label:"Momentum",value:pick.signals.PBURST,color:C.rose,delay:(delay||0)+80}),
          React.createElement(SignalBar,{key:"co",label:"Pattern",value:pick.signals.CO,color:C.teal,delay:(delay||0)+160})]),
       React.createElement("div",{key:"energy",style:{display:"flex",flexDirection:"column",alignItems:"center",gap:5,flexShrink:0}},
         [React.createElement("div",{key:"b",style:{width:52,height:52,borderRadius:14,background:eBg(pick.energy),
            border:"1.5px solid "+col+"33",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
            boxShadow:pick.energy>=65?"0 0 12px "+col+"33":"none"}},
            [React.createElement("span",{key:"n",style:{fontSize:14,fontWeight:900,color:col,fontFamily:M,lineHeight:1,fontVariantNumeric:"tabular-nums"}},pick.energy),
             React.createElement("span",{key:"e",style:{fontSize:14,lineHeight:1}},eE(pick.energy))]),
          React.createElement("span",{key:"l",style:{fontSize:8,color:C.inkTer,fontWeight:700,letterSpacing:.5}},eL(pick.energy)),
          React.createElement("span",{key:"hint",style:{fontSize:8,color:C.inkTer,opacity:.6}},"tap ↗")])]));
}

// ─── PICK DETAIL DRAWER (Oracle Reading) ─────────────────────────────────────
function SlateDrawer({pick,onClose,isPro}){
  const col=eC(pick.energy);
  return React.createElement("div",{style:{position:"fixed",inset:0,zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"},onClick:onClose},
    [React.createElement("div",{key:"bg",style:{position:"absolute",inset:0,background:"#1E1B4B66",backdropFilter:"blur(4px)"}}),
     React.createElement("div",{key:"sheet",onClick:e=>e.stopPropagation(),style:{position:"relative",width:"100%",maxWidth:640,maxHeight:"80vh",overflowY:"auto",background:C.bgCard,borderRadius:"22px 22px 0 0",border:"1px solid "+C.border,boxShadow:"0 -8px 40px "+C.primary+"22",animation:"slideUp .3s cubic-bezier(.34,1.2,.64,1)"}},
       [React.createElement("div",{key:"handle",style:{display:"flex",justifyContent:"center",padding:"12px 0 0"}},
          React.createElement("div",{style:{width:36,height:4,borderRadius:2,background:C.bgMutedD}})),
        React.createElement("div",{key:"body",style:{padding:"16px 28px 32px"}},
          [React.createElement("div",{key:"hdr",style:{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:18}},
             [React.createElement("div",{key:"info"},
                [React.createElement("div",{key:"row",style:{display:"flex",alignItems:"center",gap:10,marginBottom:6}},
                   [React.createElement("span",{key:"c",style:{fontSize:30,fontWeight:900,color:C.ink,letterSpacing:5,fontFamily:M,lineHeight:1}},pick.combo),
                    React.createElement("span",{key:"s",style:{fontSize:11,color:C.inkTer,fontFamily:M}},pick.comboSet)]),
                 React.createElement("div",{key:"tags",style:{display:"flex",gap:5,flexWrap:"wrap"}},
                   [React.createElement(Tag,{key:"r",label:"Slate #"+pick.rank,color:pick.rank===1?C.gold:C.inkSec}),
                    React.createElement(Tag,{key:"m",label:pick.mult,color:mCol(pick.mult)}),
                    React.createElement(Tag,{key:"p",label:"Pair "+pick.topPair,color:C.primary}),
                    React.createElement(Tag,{key:"e",label:"Energy "+pick.energy+" "+eE(pick.energy),color:eC(pick.energy)})])]),
              React.createElement("button",{key:"x",onClick:onClose,style:{background:C.bgMuted,border:"1px solid "+C.border,borderRadius:10,width:32,height:32,cursor:"pointer",fontSize:16,color:C.inkSec,flexShrink:0}},"✕")]),

           // Optimal straight
           React.createElement(Card,{key:"opt",style:{padding:"14px 18px",marginBottom:14,background:"linear-gradient(135deg,"+C.primaryL+","+C.bgCard+")",border:"1.5px solid "+C.primary+"28"}},
             [React.createElement("div",{key:"t",style:{fontSize:9,fontWeight:800,color:C.primary,letterSpacing:1.5,marginBottom:6}},"OPTIMAL STRAIGHT ORDER"),
              React.createElement("div",{key:"r",style:{display:"flex",alignItems:"center",gap:14}},
                [React.createElement("span",{key:"o",style:{fontSize:28,fontWeight:900,color:C.primary,letterSpacing:4,fontFamily:M}},pick.bestOrder),
                 React.createElement("div",{key:"d",style:{fontSize:12,color:C.inkSec,flex:1}},
                   "Our intelligence analysis identified "+pick.bestOrder+" as the strongest directional arrangement for this number set."+(pick.bestOrder!==pick.combo?" Also consider: "+pick.combo:""))])]),

           // Signal intelligence — labeled as "signals" not formula
           React.createElement(Card,{key:"sigs",style:{padding:"14px 18px",marginBottom:14}},
             [React.createElement("div",{key:"t",style:{fontSize:9,fontWeight:800,color:C.inkTer,letterSpacing:1.5,marginBottom:8}},"SIGNAL INTELLIGENCE"),
              React.createElement(SignalBar,{key:"f",label:"Frequency",value:pick.signals.BOX,color:C.primary}),
              React.createElement(SignalBar,{key:"m",label:"Momentum",value:pick.signals.PBURST,color:C.rose}),
              React.createElement(SignalBar,{key:"p",label:"Pattern",value:pick.signals.CO,color:C.teal}),
              React.createElement("div",{key:"note",style:{fontSize:10,color:C.inkTer,marginTop:10,borderTop:"1px solid "+C.border,paddingTop:8}},
                "✦ Intelligence composite score reflects multi-dimensional pattern analysis across our proprietary historical database.")]),

           // Oracle score
           React.createElement(Card,{key:"score",style:{padding:"14px 18px",marginBottom:14,background:eBg(pick.energy),border:"1px solid "+col+"33"}},
             [React.createElement("div",{key:"t",style:{fontSize:9,fontWeight:800,color:C.inkTer,letterSpacing:1.5,marginBottom:8}},"ENERGY SCORE"),
              React.createElement("div",{key:"r",style:{display:"flex",alignItems:"center",gap:16}},
                [React.createElement("div",{key:"n",style:{fontSize:40,fontWeight:900,color:col,fontFamily:M,fontVariantNumeric:"tabular-nums"}},pick.energy),
                 React.createElement("div",{key:"info"},
                   [React.createElement("div",{key:"l",style:{fontSize:14,fontWeight:800,color:col}},eL(pick.energy)+" "+eE(pick.energy)),
                    React.createElement("div",{key:"d",style:{fontSize:11,color:C.inkSec,marginTop:3}},"Energy score reflects the pick's standing across our full intelligence universe. Scores above 65 indicate strong pattern convergence.")])])]),

           // PRO horizon gate — shows depth without formula
           !isPro&&React.createElement(Card,{key:"lock",style:{padding:"18px",textAlign:"center",marginBottom:14,background:"linear-gradient(135deg,"+C.cosmicL+","+C.goldL+")",border:"1.5px dashed "+C.primary+"44"}},
             [React.createElement("div",{key:"c",style:{fontSize:24,marginBottom:6}},"🏠"),
              React.createElement("div",{key:"t",style:{fontSize:13,fontWeight:800,color:C.ink,marginBottom:3}},"Deep Pattern Analysis — Oracle+"),
              React.createElement("div",{key:"d",style:{fontSize:11,color:C.inkSec,marginBottom:10}},"Unlock multi-year pattern depth, trend history, and full signal breakdown for every pick."),
              React.createElement(Pill,{key:"p",label:"Unlock with Oracle+ ♛",color:C.pro})]),

           isPro&&React.createElement(Card,{key:"depth",style:{padding:"14px 18px",marginBottom:14}},
             [React.createElement("div",{key:"t",style:{fontSize:9,fontWeight:800,color:C.inkTer,letterSpacing:1.5,marginBottom:8}},"📡 PATTERN DEPTH (Years Active)"),
              React.createElement("div",{key:"g",style:{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}},
                Object.entries(pick.signals&&{H1:pick.signals.BOX,H2:pick.signals.PBURST*0.8,H3:pick.signals.CO*0.9,H4:pick.signals.BOX*0.7,H5:pick.signals.PBURST*0.6}||{}).map(([h,v])=>
                  React.createElement("div",{key:h,style:{textAlign:"center"}},
                    [React.createElement("div",{key:"h",style:{fontSize:9,color:C.inkTer,fontWeight:700,marginBottom:2}},h==="H1"?"Y1":h==="H2"?"Y2":h==="H3"?"Y3":h==="H4"?"Y4":"Y5"),
                     React.createElement("div",{key:"v",style:{fontSize:14,fontWeight:800,color:C.primary,fontFamily:M}},Math.round(v*100)),
                     React.createElement("div",{key:"b",style:{width:"100%",height:3,borderRadius:2,background:C.bgMuted,marginTop:3,overflow:"hidden"}},
                       React.createElement("div",{style:{width:v*100+"%",height:"100%",background:C.primary,borderRadius:2}}))]))
              ),
              React.createElement("div",{key:"note",style:{fontSize:10,color:C.inkTer,marginTop:8,borderTop:"1px solid "+C.border,paddingTop:6}},
                "Pattern depth shown across historical windows. Full proprietary analysis spans our complete multi-year database.")]),

           React.createElement("div",{key:"actions",style:{display:"flex",gap:10}},
             [React.createElement(Btn,{key:"share",v:"cosmic",full:true,onClick:()=>alert("📤 Slate #"+pick.rank+": "+pick.bestOrder+" · Energy "+pick.energy+" "+eE(pick.energy)+"\nPowered by HitMaster ZK6")},"📤 Share Slate #"+pick.rank),
              React.createElement(Btn,{key:"close",v:"ghost",onClick:onClose,style:{minWidth:76}},"Close")])])])]);
}

// ─── PAYWALL (Oracle plan) ────────────────────────────────────────────────────
function Paywall({onClose,onSuccess,startPlan}){
  const[plan,setPlan]=useState(startPlan||"monthly");
  const plans=[
    {id:"trial5",label:"5-Day Access",price:"$4.99",note:"No auto-renew · Perfect for beginners"},
    {id:"monthly",label:"Monthly",price:"$9.99/mo",note:"🌟 Most popular"},
    {id:"annual",label:"Annual",price:"$89.99/yr",note:"✦ Save 25% · Best value"},
  ];
  const perks=[
    "🔮 All 6 K6 Slate picks per draw",
    "✦ Optimal straight order per pick",
    "⚡ Unlimited Heat Checks",
    "📖 Full Number Book — all scopes & states",
    "🌙 76 draws tracked daily",
    "🌟 Live slate updates",
    "📊 Pattern analytics & hit history",
    "💰 Pick by Budget tool",
  ];
  const plusPerks=[
    "Everything in Pro",
    "🔜 Slate by State — filter by your states",
    "🔜 Straight Pick 3 Slate",
    "🔜 HitMaster Pick 4 (Box & Straight)",
    "First access to every new feature",
    "Dedicated priority support",
  ];
  const[tab,setTab]=useState("pro");
  return React.createElement("div",{style:{position:"fixed",inset:0,background:"#1E1B4B88",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20},onClick:onClose},
    React.createElement(Card,{style:{maxWidth:440,width:"100%",maxHeight:"92vh",overflowY:"auto",padding:"28px 26px",borderRadius:24,border:"1px solid "+C.border},onClick:e=>e.stopPropagation()},
      [React.createElement("button",{key:"x",onClick:onClose,style:{float:"right",background:"none",border:"none",color:C.inkTer,cursor:"pointer",fontSize:20}},"✕"),
       React.createElement("div",{key:"hdr",style:{textAlign:"center",marginBottom:20}},
         [React.createElement("div",{key:"c",style:{fontSize:44,marginBottom:6}},"🏠"),
          React.createElement("h2",{key:"t",style:{fontSize:20,fontWeight:900,color:C.ink,margin:"0 0 5px"}},"Unlock HitMaster Pro"),
          React.createElement("p",{key:"s",style:{fontSize:13,color:C.inkSec,margin:0}},"The full K6 Slate. Every draw. Every state.")]),
       React.createElement("div",{key:"proof",style:{background:C.greenL,borderRadius:10,padding:"9px 14px",marginBottom:16,textAlign:"center",border:"1px solid "+C.green+"33"}},
         React.createElement("span",{style:{fontSize:12,color:C.green,fontWeight:700}},"✦ 2,400+ players using HitMaster daily")),

       // Tab switcher for PRO vs PLUS
       React.createElement("div",{key:"tabs",style:{display:"flex",gap:4,background:C.bgMuted,borderRadius:11,padding:3,marginBottom:16}},
         [{id:"pro",l:"Pro"},{id:"plus",l:"PLUS"}].map(t=>{
           const on=tab===t.id;
           return React.createElement("button",{key:t.id,onClick:()=>setTab(t.id),style:{flex:1,padding:"7px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:F,fontSize:12,fontWeight:on?700:500,background:on?C.bgCard:"transparent",color:on?C.primary:C.inkSec,boxShadow:on?"0 2px 8px #1E1B4B10":"none",transition:"all .15s"}},t.l);
         })),

       // Perks
       React.createElement("div",{key:"perks",style:{marginBottom:16}},
         (tab==="pro"?perks:plusPerks).map((p,i)=>
           React.createElement("div",{key:i,style:{display:"flex",gap:10,padding:"7px 0",borderBottom:"1px solid "+C.border,alignItems:"center"}},
             [React.createElement("span",{key:"c",style:{color:C.primary,fontWeight:700,flexShrink:0}},"✓"),
              React.createElement("span",{key:"t",style:{fontSize:12,color:C.ink}},p)]))),

       // Plans
       tab==="pro"&&React.createElement("div",{key:"plans",style:{display:"flex",flexDirection:"column",gap:8,marginBottom:16}},
         plans.map(p=>React.createElement("button",{key:p.id,onClick:()=>setPlan(p.id),style:{
           background:plan===p.id?C.primaryL:C.bgMuted,border:"2px solid "+(plan===p.id?C.primary:C.border),
           borderRadius:12,padding:"11px 16px",cursor:"pointer",fontFamily:F,
           display:"flex",alignItems:"center",justifyContent:"space-between",transition:"all .15s"}},
           [React.createElement("div",{key:"i",style:{textAlign:"left"}},
              [React.createElement("div",{key:"n",style:{fontSize:13,fontWeight:700,color:C.ink}},p.label),
               React.createElement("div",{key:"d",style:{fontSize:11,color:C.inkSec}},p.note)]),
            React.createElement("span",{key:"price",style:{fontSize:14,fontWeight:900,color:plan===p.id?C.primary:C.inkSec,fontFamily:M}},p.price)]))),

       tab==="plus"&&React.createElement("div",{key:"plus-cta",style:{background:"linear-gradient(135deg,"+C.cosmicL+","+C.primaryL+")",borderRadius:12,padding:"16px",marginBottom:16,textAlign:"center",border:"1px solid "+C.primary+"33"}},
         [React.createElement("div",{key:"t",style:{fontSize:14,fontWeight:800,color:C.ink,marginBottom:4}},"Mystic Plan — Coming Soon"),
          React.createElement("div",{key:"d",style:{fontSize:12,color:C.inkSec,marginBottom:10}},"Be first to access Slate by State, Pick 4, and all future Oracle features."),
          React.createElement(Btn,{key:"notify",v:"outline",onClick:()=>alert("You'll be notified when Mystic launches! ✦")},"Notify Me at Launch ♛")]),

       tab==="pro"&&React.createElement(Btn,{key:"sub",v:"cosmic",onClick:onSuccess,full:true,lg:true,style:{marginTop:4,borderRadius:13}},"Begin Oracle+ · "+(plans.find(p=>p.id===plan)||{}).price+" ♛"),
       React.createElement(Btn,{key:"restore",v:"ghost",onClick:onClose,full:true,style:{marginTop:8,borderRadius:11}},"Restore Purchase"),
       React.createElement("p",{key:"legal",style:{textAlign:"center",fontSize:10,color:C.inkTer,marginTop:10,lineHeight:1.6}},"Cancel anytime · Terms & Privacy apply")]));
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── NUMBER BOOK SCREEN ── Clean rewrite, modular helpers ────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ALL_STATES = ["AZ","AR","CA","CO","CT","DC","DE","FL","GA","IA","ID","IL","IN","KS","KY","LA","ME","MI","MN","MO","MS","NC","NE","NH","NJ","NM","NY","OH","OK","ON","PA","QC","SC","TN","TX","VA","VT","WA","WC","WI","WV"];

const COMING_FEATURES = [
  {icon:"🗺",title:"Slate by State",desc:"Filter today's K6 Slate to only your selected states.",tier:"PLUS"},
  {icon:"🎯",title:"Straight Pick 3 Slate",desc:"Dedicated straight-only intelligence slate powered by ZK6.",tier:"PLUS"},
  {icon:"4️⃣",title:"Pick 4 Box",desc:"4-digit box intelligence — ZK6 expanding to Pick 4.",tier:"PLUS"},
  {icon:"⭐",title:"Pick 4 Straight",desc:"4-digit straight slate picks with optimal arrangement.",tier:"PLUS"},
];

const scopeIcon = s => s==="midday"?"☀️":s==="evening"?"🌙":"◈";
const scopeColor = s => s==="midday"?C.gold:s==="evening"?C.primary:C.teal;

// ── Sub-components (defined outside to avoid re-creation) ────────────────────

function NBListRow({lst,active,onSelect,onDelete}){
  const on = active===lst.id;
  return React.createElement("div",{
    onClick:()=>onSelect(lst.id),
    style:{padding:"10px 12px",borderRadius:10,cursor:"pointer",marginBottom:4,transition:"all .15s",
      background:on?C.primaryL:"transparent",
      border:on?"1px solid "+C.primary+"33":"1px solid transparent"}
  },
    React.createElement("div",{style:{display:"flex",alignItems:"center",gap:8}},
      [React.createElement("span",{key:"ic",style:{fontSize:14}},scopeIcon(lst.scope)),
       React.createElement("div",{key:"info",style:{flex:1,minWidth:0}},
         [React.createElement("div",{key:"n",style:{fontSize:12,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:on?C.primary:C.ink}},lst.name),
          React.createElement("div",{key:"m",style:{fontSize:10,color:C.inkTer}},lst.combos.length+" numbers"+(lst.states.length?" · "+lst.states.slice(0,2).join(", ")+(lst.states.length>2?" +"+(lst.states.length-2):""):""))]),
       React.createElement("button",{key:"del",onClick:e=>{e.stopPropagation();onDelete(lst.id);},
         style:{background:"none",border:"none",cursor:"pointer",color:C.inkTer,fontSize:14,opacity:.5,padding:"0 2px"}},"×")]));
}

function NBComboRow({item,onStar,onDelete}){
  return React.createElement(Card,{style:{padding:"12px 16px",marginBottom:8}},
    React.createElement("div",{style:{display:"flex",alignItems:"center",gap:12}},
      [React.createElement("button",{key:"star",onClick:()=>onStar(item.combo),
         style:{background:"none",border:"none",cursor:"pointer",fontSize:16,lineHeight:1,flexShrink:0}},
         item.starred?"⭐":"☆"),
       React.createElement("span",{key:"num",style:{fontSize:20,fontWeight:900,color:C.ink,letterSpacing:3,fontFamily:M,minWidth:60}},item.combo),
       React.createElement("span",{key:"set",style:{fontSize:10,color:C.inkTer,fontFamily:M}},toSet(item.combo)),
       React.createElement("span",{key:"note",style:{fontSize:11,color:C.inkSec,flex:1,fontStyle:item.note?"normal":"italic"}},item.note||"No note"),
       React.createElement("button",{key:"del",onClick:()=>onDelete(item.combo),
         style:{background:"none",border:"none",cursor:"pointer",color:C.inkTer,fontSize:16,opacity:.5,flexShrink:0}},"×")]));
}

function NBComingSoon(){
  return React.createElement("div",{style:{marginTop:24}},
    [React.createElement("div",{key:"title",style:{fontSize:9,fontWeight:800,color:C.inkTer,letterSpacing:2,textTransform:"uppercase",marginBottom:10}},"✦ Coming Soon — PLUS"),
     React.createElement("div",{key:"grid",style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}},
       COMING_FEATURES.map(f=>
         React.createElement(Card,{key:f.title,style:{padding:"14px"}},
           [React.createElement("div",{key:"row",style:{display:"flex",gap:8,alignItems:"flex-start",marginBottom:6}},
              [React.createElement("span",{key:"i",style:{fontSize:20}},f.icon),
               React.createElement("div",{key:"info"},
                 [React.createElement("div",{key:"t",style:{fontSize:11,fontWeight:700,color:C.ink,marginBottom:3}},f.title),
                  React.createElement(Pill,{key:"p",label:"PLUS ♛",color:C.plus,xs:true})])]),
            React.createElement("div",{key:"d",style:{fontSize:10,color:C.inkSec,lineHeight:1.5}},f.desc)])))]);
}

function NBStateSelector({selected,onChange}){
  return React.createElement("div",null,
    React.createElement("details",{style:{marginBottom:12}},
      [React.createElement("summary",{key:"s",style:{fontSize:11,color:C.inkSec,cursor:"pointer",fontWeight:600,userSelect:"none"}},
         "Filter by State ("+selected.length+" selected)"),
       React.createElement("div",{key:"grid",style:{display:"flex",gap:5,flexWrap:"wrap",marginTop:8,padding:"4px 0"}},
         ALL_STATES.map(s=>{
           const sel = selected.includes(s);
           return React.createElement("button",{key:s,onClick:()=>onChange(sel?selected.filter(x=>x!==s):[...selected,s]),
             style:{fontSize:10,padding:"3px 9px",borderRadius:99,cursor:"pointer",fontFamily:F,fontWeight:sel?700:400,transition:"all .13s",
               border:"1.5px solid "+(sel?C.primary:C.border),background:sel?C.primaryL:"transparent",color:sel?C.primary:C.inkSec}},s);
         }))]),
    null);
}

// ── Create List Modal ─────────────────────────────────────────────────────────
function NBCreateModal({onClose,onCreate}){
  const[name,setName]=useState("");
  const[scope,setScope]=useState("allday");
  return React.createElement("div",{
    style:{position:"fixed",inset:0,background:"#1E1B4B77",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20},
    onClick:onClose
  },
    React.createElement(Card,{style:{maxWidth:380,width:"100%",padding:"24px"},onClick:e=>e.stopPropagation()},
      [React.createElement("h3",{key:"t",style:{fontSize:16,fontWeight:800,color:C.ink,margin:"0 0 16px"}},"✦ Create New List"),
       React.createElement("input",{key:"name",value:name,onChange:e=>setName(e.target.value),
         placeholder:"List name (e.g. NY Evening Picks)",
         style:{width:"100%",padding:"9px 12px",borderRadius:9,fontFamily:F,fontSize:13,color:C.ink,
           background:C.bgCard,outline:"none",marginBottom:12,boxSizing:"border-box",
           border:"1.5px solid "+(name?C.primary:C.border)}}),
       React.createElement("div",{key:"scope",style:{display:"flex",gap:6,marginBottom:18}},
         [{id:"midday",l:"☀️ Midday"},{id:"evening",l:"🌙 Evening"},{id:"allday",l:"◈ All Day"}].map(o=>{
           const on=scope===o.id;
           return React.createElement("button",{key:o.id,onClick:()=>setScope(o.id),
             style:{flex:1,padding:"7px",borderRadius:9,cursor:"pointer",fontFamily:F,fontSize:11,fontWeight:on?700:500,transition:"all .15s",
               border:"1.5px solid "+(on?C.primary:C.border),background:on?C.primaryL:"transparent",color:on?C.primary:C.inkSec}},o.l);
         })),
       React.createElement("div",{key:"btns",style:{display:"flex",gap:8}},
         [React.createElement(Btn,{key:"c",v:"primary",full:true,disabled:!name.trim(),onClick:()=>{if(name.trim())onCreate(name.trim(),scope);}},
            "Create List"),
          React.createElement(Btn,{key:"x",v:"ghost",onClick:onClose},"Cancel")])]));
}

// ── Add Combo Modal ───────────────────────────────────────────────────────────
function NBAddModal({onClose,onAdd}){
  const[combo,setCombo]=useState("");
  const[note,setNote]=useState("");
  const valid = /^\d{3}$/.test(combo);
  return React.createElement("div",{
    style:{position:"fixed",inset:0,background:"#1E1B4B77",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20},
    onClick:onClose
  },
    React.createElement(Card,{style:{maxWidth:320,width:"100%",padding:"24px"},onClick:e=>e.stopPropagation()},
      [React.createElement("h3",{key:"t",style:{fontSize:16,fontWeight:800,color:C.ink,margin:"0 0 14px"}},"＋ Add Number"),
       React.createElement("input",{key:"combo",value:combo,onChange:e=>setCombo(e.target.value.replace(/\D/g,"").slice(0,3)),
         placeholder:"3 digits",maxLength:3,
         style:{width:"100%",padding:"12px",borderRadius:9,fontFamily:M,fontSize:28,fontWeight:900,color:C.ink,
           background:C.bgCard,outline:"none",marginBottom:10,letterSpacing:6,textAlign:"center",boxSizing:"border-box",
           border:"1.5px solid "+(valid?C.primary:C.border)}}),
       React.createElement("input",{key:"note",value:note,onChange:e=>setNote(e.target.value),
         placeholder:"Note (optional)",
         style:{width:"100%",padding:"9px 12px",borderRadius:9,fontFamily:F,fontSize:12,color:C.ink,
           background:C.bgCard,outline:"none",marginBottom:14,boxSizing:"border-box",border:"1px solid "+C.border}}),
       React.createElement("div",{key:"btns",style:{display:"flex",gap:8}},
         [React.createElement(Btn,{key:"a",v:"primary",full:true,disabled:!valid,onClick:()=>{if(valid)onAdd(combo,note);}},
            "Add Number"),
          React.createElement(Btn,{key:"x",v:"ghost",onClick:onClose},"Cancel")])]));
}

// ── Left Sidebar Panel ────────────────────────────────────────────────────────
function NBLeftPanel({lists,active,onSelect,onDelete,onCreate,isPro,onUpgrade}){
  const[showCreate,setShowCreate]=useState(false);
  return React.createElement(React.Fragment,null,
    [React.createElement("div",{key:"panel",
       style:{width:260,borderRight:"1px solid "+C.border,display:"flex",flexDirection:"column",
         background:C.bgCard,height:"100%",overflow:"hidden"}},
       [React.createElement("div",{key:"hdr",style:{padding:"18px 16px 12px",borderBottom:"1px solid "+C.border,flexShrink:0}},
          [React.createElement("div",{key:"t",style:{fontSize:15,fontWeight:900,color:C.ink,marginBottom:2}},
             ["📖 Number ",React.createElement("span",{key:"s",style:{color:C.primary}},"Book")]),
           React.createElement("div",{key:"s",style:{fontSize:11,color:C.inkTer}},"Your personal number collection")]),

        React.createElement("div",{key:"lists",style:{flex:1,overflowY:"auto",padding:"8px"}},
          [React.createElement("div",{key:"lbl",style:{fontSize:9,fontWeight:800,color:C.inkTer,letterSpacing:1.5,padding:"8px 8px 4px",textTransform:"uppercase"}},"My Lists"),
           ...lists.map(lst=>React.createElement(NBListRow,{key:lst.id,lst,active,onSelect,onDelete})),
           React.createElement("button",{key:"new",onClick:()=>setShowCreate(true),
             style:{width:"100%",marginTop:8,padding:"9px 12px",borderRadius:10,cursor:"pointer",fontFamily:F,
               fontSize:12,color:C.inkSec,display:"flex",alignItems:"center",gap:6,
               background:"transparent",border:"1.5px dashed "+C.border}},
             [React.createElement("span",{key:"p",style:{fontSize:16,color:C.primary}},"＋"),
              "New List"])]),

        React.createElement("div",{key:"cs",style:{padding:"8px 8px 14px",borderTop:"1px solid "+C.border,flexShrink:0}},
          [React.createElement("div",{key:"lbl",style:{fontSize:9,fontWeight:800,color:C.inkTer,letterSpacing:1.5,padding:"8px 8px 6px",textTransform:"uppercase"}},"✦ Coming Soon"),
           ...COMING_FEATURES.map(f=>
             React.createElement("div",{key:f.title,
               style:{padding:"8px 10px",borderRadius:8,marginBottom:3,background:C.bgMuted,border:"1px solid "+C.border}},
               React.createElement("div",{style:{display:"flex",gap:8,alignItems:"center"}},
                 [React.createElement("span",{key:"i",style:{fontSize:12}},f.icon),
                  React.createElement("div",{key:"info"},
                    [React.createElement("div",{key:"t",style:{fontSize:10,fontWeight:700,color:C.ink}},f.title),
                     React.createElement(Pill,{key:"p",label:"PLUS",color:C.plus,xs:true})])])))]) ]),

     showCreate&&React.createElement(NBCreateModal,{key:"modal",
       onClose:()=>setShowCreate(false),
       onCreate:(name,scope)=>{onCreate(name,scope);setShowCreate(false);}})]);
}

// ── Right Detail Panel ────────────────────────────────────────────────────────
function NBRightPanel({list,onUpdateList,isPro,onUpgrade}){
  const[showAdd,setShowAdd]=useState(false);

  const handleStar = useCallback(combo=>{
    onUpdateList({...list,combos:list.combos.map(c=>c.combo===combo?{...c,starred:!c.starred}:c)});
  },[list,onUpdateList]);

  const handleDelete = useCallback(combo=>{
    onUpdateList({...list,combos:list.combos.filter(c=>c.combo!==combo)});
  },[list,onUpdateList]);

  const handleAdd = useCallback((combo,note)=>{
    if(list.combos.some(c=>c.combo===combo))return;
    onUpdateList({...list,combos:[...list.combos,{combo,note,starred:false}]});
    setShowAdd(false);
  },[list,onUpdateList]);

  const handleStatesChange = useCallback(states=>{
    onUpdateList({...list,states});
  },[list,onUpdateList]);

  return React.createElement(React.Fragment,null,
    [React.createElement("div",{key:"panel",style:{flex:1,overflowY:"auto",padding:"22px",background:C.bg}},
       [// Header
        React.createElement("div",{key:"hdr",style:{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16,gap:12,flexWrap:"wrap"}},
          [React.createElement("div",{key:"info"},
             [React.createElement("div",{key:"row",style:{display:"flex",alignItems:"center",gap:10,marginBottom:6}},
                [React.createElement("span",{key:"sc",style:{fontSize:20}},scopeIcon(list.scope)),
                 React.createElement("h2",{key:"name",style:{fontSize:18,fontWeight:900,color:C.ink,margin:0}},list.name)]),
              React.createElement("div",{key:"pills",style:{display:"flex",gap:5,flexWrap:"wrap"}},
                [React.createElement(Pill,{key:"scope",label:list.scope,color:scopeColor(list.scope)}),
                 ...list.states.map(s=>React.createElement(Pill,{key:s,label:s,color:C.inkTer,xs:true})),
                 list.states.length===0&&React.createElement(Pill,{key:"all",label:"All States",color:C.inkTer,xs:true})])]),
           React.createElement("div",{key:"btns",style:{display:"flex",gap:8}},
             [React.createElement(Btn,{key:"add",v:"primary",sm:true,onClick:()=>setShowAdd(true)},"＋ Add Number"),
              isPro&&React.createElement(Btn,{key:"share",v:"ghost",sm:true,onClick:()=>alert("📤 Sharing: "+list.name)},"📤 Share")])]),

        // State selector
        React.createElement(NBStateSelector,{key:"states",selected:list.states,onChange:handleStatesChange}),

        // Combos
        list.combos.length===0
          ? React.createElement("div",{key:"empty",style:{textAlign:"center",padding:"32px",color:C.inkTer}},
              [React.createElement("div",{key:"i",style:{fontSize:36,marginBottom:8}},"🔢"),
               React.createElement("div",{key:"t",style:{fontSize:13,fontWeight:700,color:C.ink,marginBottom:12}},"No numbers saved yet"),
               React.createElement(Btn,{key:"add",v:"outline",onClick:()=>setShowAdd(true)},"Add your first number")])
          : React.createElement("div",{key:"combos"},
              list.combos.map(item=>
                React.createElement(NBComboRow,{key:item.combo,item,onStar:handleStar,onDelete:handleDelete}))),

        // Coming soon actions
        React.createElement("div",{key:"div",style:{margin:"20px 0",height:1,background:"linear-gradient(90deg,transparent,"+C.borderMed+",transparent)"}}),
        React.createElement("div",{key:"cs-label",style:{fontSize:10,fontWeight:800,color:C.inkTer,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}},"✦ Coming features for this list"),
        React.createElement("div",{key:"cs-grid",style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}},
          COMING_FEATURES.map(f=>
            React.createElement(Card,{key:f.title,style:{padding:"11px",textAlign:"center",opacity:.8}},
              [React.createElement("div",{key:"i",style:{fontSize:18,marginBottom:4}},f.icon),
               React.createElement("div",{key:"t",style:{fontSize:10,fontWeight:700,color:C.ink,marginBottom:4}},f.title),
               React.createElement(Pill,{key:"p",label:"Coming Soon",color:C.primary,xs:true})])))]),

     showAdd&&React.createElement(NBAddModal,{key:"modal",onClose:()=>setShowAdd(false),onAdd:handleAdd})]);
}

// ── Empty / Welcome Panel ─────────────────────────────────────────────────────
function NBWelcome({onCreate,isPro,onUpgrade}){
  const[showCreate,setShowCreate]=useState(false);
  return React.createElement(React.Fragment,null,
    [React.createElement("div",{key:"welcome",style:{flex:1,overflowY:"auto",padding:"28px",background:C.bg}},
       [React.createElement("div",{key:"hero",style:{textAlign:"center",padding:"28px 24px",marginBottom:20}},
          [React.createElement("div",{key:"i",style:{fontSize:48,marginBottom:10}},"📖"),
           React.createElement("h2",{key:"t",style:{fontSize:20,fontWeight:900,color:C.ink,margin:"0 0 8px"}},"Your Number Book"),
           React.createElement("p",{key:"d",style:{fontSize:13,color:C.inkSec,maxWidth:300,margin:"0 auto 16px",lineHeight:1.6}},
             "Save your favorite numbers, organize by scope and state, and be first for powerful new features."),
           React.createElement(Btn,{key:"new",v:"cosmic",onClick:()=>setShowCreate(true)},"✦ Create Your First List")]),
        React.createElement(NBComingSoon,{key:"cs"}),
        !isPro&&React.createElement("div",{key:"upsell",style:{marginTop:20,padding:"18px 20px",borderRadius:16,textAlign:"center",background:"linear-gradient(135deg,"+C.cosmicL+","+C.goldL+")",border:"1.5px solid "+C.primary+"33"}},
          [React.createElement("div",{key:"i",style:{fontSize:26,marginBottom:6}},"🏠"),
           React.createElement("div",{key:"t",style:{fontSize:13,fontWeight:800,color:C.ink,marginBottom:4}},"Number Book is Pro exclusive"),
           React.createElement("div",{key:"d",style:{fontSize:11,color:C.inkSec,marginBottom:12}},"Save unlimited lists, organize by state, get first access to Slate by State & Pick 4."),
           React.createElement(Btn,{key:"btn",v:"gold",onClick:onUpgrade},"Unlock Oracle+ ♛")])]),
     showCreate&&React.createElement(NBCreateModal,{key:"modal",
       onClose:()=>setShowCreate(false),
       onCreate:(name,scope)=>{onCreate(name,scope);setShowCreate(false);}})]);
}

// ── Main NumberBookScreen ─────────────────────────────────────────────────────
function NumberBookScreen({user,onUpgrade}){
  const isPro = user.tier!=="FREE";
  const[lists,setLists]=useState([
    {id:"1",name:"My Lucky Numbers",scope:"allday",states:[],combos:[{combo:"742",note:"Always warm ✦",starred:true},{combo:"319",note:"Hit twice last month",starred:false}]},
    {id:"2",name:"NY Evening Picks",scope:"evening",states:["NY"],combos:[{combo:"881",note:"Doubles pressure",starred:false}]},
    {id:"3",name:"Ohio Midday",scope:"midday",states:["OH"],combos:[]},
  ]);
  const[active,setActive]=useState(null);

  const activeList = lists.find(l=>l.id===active)||null;

  const handleCreate = useCallback((name,scope)=>{
    const newList={id:Date.now()+"",name,scope,states:[],combos:[]};
    setLists(l=>[...l,newList]);
    setActive(newList.id);
  },[]);

  const handleDelete = useCallback(id=>{
    setLists(l=>l.filter(x=>x.id!==id));
    setActive(a=>a===id?null:a);
  },[]);

  const handleUpdate = useCallback(updated=>{
    setLists(l=>l.map(x=>x.id===updated.id?updated:x));
  },[]);

  return React.createElement("div",{style:{flex:1,display:"flex",overflow:"hidden"}},
    [React.createElement(NBLeftPanel,{key:"left",lists,active,onSelect:setActive,onDelete:handleDelete,onCreate:handleCreate,isPro,onUpgrade}),
     activeList
       ? React.createElement(NBRightPanel,{key:"right",list:activeList,onUpdateList:handleUpdate,isPro,onUpgrade})
       : React.createElement(NBWelcome,{key:"welcome",onCreate:handleCreate,isPro,onUpgrade})]);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── PROFILE SCREEN ───────────────────────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ProfileScreen({user,onUpgrade}){
  const isFree=user.tier==="FREE";const isPro=user.tier==="PRO";
  const tierColor=isFree?C.free:isPro?C.pro:C.plus;
  const tierLabel=isFree?"FREE":isPro?"Pro":"Plus";
  const[gloss,setGloss]=useState(null);
  const[notifPrefs,setNotifPrefs]=useState({nextDraw:true,slateReady:true,hits:true,promo:false});
  const stats={drawsTracked:2847,picksFollowed:412,memberDays:47,statesTracked:18};

  // Glossary — marketing-protective: describes WHAT, not HOW
  const GLOSSARY=[
    {term:"ZK6™ Engine",def:"HitMaster's proprietary intelligence engine. ZK6 is a multi-dimensional pattern recognition system trained on years of lottery draw history. The exact methodology, weighting structure, and scoring architecture are proprietary to HitMaster. What you see are its Oracle Readings — the output of our intelligence system, not its inner workings."},
    {term:"Slate Pick",def:"A ZK6-powered pick. Each slate entry is the result of our full intelligence analysis — combining frequency, momentum, and pattern signals across our historical database. Readings are ranked by Oracle Score (highest = strongest signal convergence)."},
    {term:"Frequency Signal",def:"One of three intelligence signals inside every Oracle Reading. Frequency captures historical pattern pressure — how strongly a number set is signaling based on draw history. Higher = stronger frequency signal."},
    {term:"Momentum Signal",def:"One of three intelligence signals. Momentum captures directional pair energy and burst patterns — which digit pairs are building pressure. Higher = stronger momentum signal."},
    {term:"Pattern Signal",def:"One of three intelligence signals. Pattern analyzes digit relationship activity and co-occurrence trends across our historical database. Higher = stronger pattern signal."},
    {term:"Energy Score",def:"A 0–100 composite score reflecting a pick's overall intelligence signal strength. Calculated from our proprietary multi-signal analysis. BLAZING (80+) signals the strongest convergence. NOT a simple calculation — it reflects our full engine output."},
    {term:"Optimal Straight",def:"The recommended straight arrangement for a box number. ZK6 analyzes all possible orderings and identifies the arrangement with the strongest directional signal alignment. This is your best straight play for the pick."},
    {term:"K6 Slate",def:"Your daily set of 6 slate picks — the top picks emerging from ZK6's full intelligence pass across all numbers. Oracle+ members see all 6. Free members see the top 2 preview."},
    {term:"Number Set (Box)",def:"The unordered combination of three digits, e.g. {1,2,3}. A box number covers all arrangements of those digits. Your Oracle Reading always includes the Number Set alongside the optimal straight."},
    {term:"Scope",def:"The draw session being analyzed: Midday (☀️), Evening (🌙), or All Day (◈). ZK6 maintains separate intelligence analyses for each scope, reflecting their distinct draw histories."},
    {term:"Historical Depth",def:"How far back ZK6's pattern analysis extends — from 1 year (recent trends) to 10 years (long-range patterns). Our engine intelligently weights recent history more heavily while honoring long-range signals. Exact blending is proprietary."},
    {term:"Pattern Diversity Rails",def:"HitMaster's quality control system ensuring your daily slate is diverse and balanced — not dominated by similar number types. Rails govern the final composition of each reading set. Specific rules are proprietary."},
    {term:"Pair",def:"Any two-digit combination within a pick. ZK6 tracks pair activity across multiple classes and draw positions as part of its intelligence analysis."},
    {term:"Doubles / Singles",def:"Number type: Singles have 3 distinct digits (e.g. 123). Doubles have one repeated digit (e.g. 112). ZK6 applies proprietary adjustments based on number type as part of its composite scoring."},
    {term:"Drawing",def:"An official Pick 3 lottery draw. HitMaster tracks 76 drawings per day across participating states and Canada — Midday and Evening sessions. ZK6 generates fresh Oracle Readings for each scope."},
  ];

  const PLAN_FEATURES={
    FREE:["2 Slate picks preview","1 Heat Check per day","Basic Results Ledger","76 draws tracked","Number Book (1 list)"],
    PRO:["All 6 K6 Slate picks","Optimal straight per pick","Unlimited Heat Checks","Live slate updates","Full pattern depth analytics","Pick by Budget tool","Number Book (unlimited lists & states)","Hit history & stats"],
    PLUS:["Everything in Pro","🔜 Slate by State","🔜 Straight Pick 3 Slate","🔜 HitMaster Pick 4 Box & Straight","First access to every new feature","Priority support"],
  };

  const Toggle=({on,onChange,label,sub})=>
    React.createElement("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 0",borderBottom:"1px solid "+C.border}},
      [React.createElement("div",{key:"txt"},
         [React.createElement("div",{key:"l",style:{fontSize:13,fontWeight:600,color:C.ink}},label),
          sub&&React.createElement("div",{key:"s",style:{fontSize:10,color:C.inkTer,marginTop:1}},sub)]),
       React.createElement("button",{key:"tog",onClick:()=>onChange(!on),style:{width:44,height:24,borderRadius:12,background:on?C.primary:C.bgMutedD,border:"none",cursor:"pointer",transition:"background .2s",position:"relative",flexShrink:0}},
         React.createElement("div",{style:{width:18,height:18,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:on?23:3,transition:"left .2s",boxShadow:"0 1px 4px #1E1B4B22"}}))]);

  return React.createElement("div",{style:{flex:1,overflowY:"auto"}},
    React.createElement("div",{style:{maxWidth:680,width:"100%",padding:"24px 28px"}},
      React.createElement(React.Fragment,null,

        // Hero
        React.createElement(Card,{key:"hero",style:{padding:"28px 24px",marginBottom:20,textAlign:"center",background:"linear-gradient(135deg,"+C.cosmicL+" 0%,"+C.bgCard+" 60%)",overflow:"hidden",position:"relative"}},
          [React.createElement("div",{key:"glow",style:{position:"absolute",top:-40,right:-40,width:120,height:120,borderRadius:"50%",background:tierColor+"14"}}),
           React.createElement("div",{key:"stars",style:{position:"absolute",top:16,left:20,fontSize:12,color:C.primary,opacity:.3}},"✦ ✧ ✦ ✧"),
           React.createElement("div",{key:"avatar",style:{width:72,height:72,borderRadius:"50%",background:"linear-gradient(135deg,"+tierColor+","+C.primary+"88)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",fontSize:28,boxShadow:"0 4px 20px "+tierColor+"44"}},"🏠"),
           React.createElement("div",{key:"name",style:{fontSize:18,fontWeight:900,color:C.ink,marginBottom:4}},"Your Profile"),
           React.createElement("div",{key:"email",style:{fontSize:13,color:C.inkSec,marginBottom:10}},"you@example.com"),
           React.createElement("div",{key:"badges",style:{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}},
             [React.createElement(Pill,{key:"tier",label:"✦ "+tierLabel,color:tierColor}),
              React.createElement(Pill,{key:"days",label:"Member "+stats.memberDays+"d",color:C.inkTer}),
              React.createElement(Pill,{key:"states",label:stats.statesTracked+" states",color:C.teal})])]),

        // Stats
        React.createElement(SecTitle,{key:"stats-t"},"Your Activity"),
        React.createElement("div",{key:"stats",style:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:8}},
          [{i:"📊",v:stats.drawsTracked.toLocaleString(),l:"Draws Tracked",c:C.primary},
           {i:"🎯",v:stats.picksFollowed,l:"Picks Followed",c:C.rose},
           {i:"🌙",v:stats.statesTracked,l:"States Active",c:C.teal},
           {i:"📅",v:stats.memberDays,l:"Days Active",c:C.gold}
          ].map((s,i)=>React.createElement(Card,{key:i,style:{padding:"12px",textAlign:"center"}},
            [React.createElement("div",{key:"i",style:{fontSize:18,marginBottom:2}},s.i),
             React.createElement("div",{key:"v",style:{fontSize:18,fontWeight:900,color:s.c,fontFamily:M,lineHeight:1,margin:"2px 0"}},s.v),
             React.createElement("div",{key:"l",style:{fontSize:9,color:C.inkTer,fontWeight:700,letterSpacing:.5}},s.l)]))),

        // Subscription
        React.createElement(SecTitle,{key:"sub-t"},"Your Plan"),
        isFree
          ? React.createElement(Card,{key:"sub-free",style:{padding:"20px",background:"linear-gradient(135deg,"+C.cosmicL+","+C.goldL+")",border:"1.5px solid "+C.primary+"33"}},
              [React.createElement("div",{key:"row",style:{display:"flex",alignItems:"center",gap:12,marginBottom:14}},
                 [React.createElement("div",{key:"i",style:{fontSize:28}},"🏠"),
                  React.createElement("div",{key:"txt"},
                    [React.createElement("div",{key:"t",style:{fontSize:14,fontWeight:800,color:C.ink}},"You're on the Seeker (Free) plan"),
                     React.createElement("div",{key:"s",style:{fontSize:12,color:C.inkSec}},"2 slate picks preview per draw")])]),
               React.createElement("div",{key:"proof",style:{fontSize:12,color:C.green,fontWeight:700,marginBottom:14}},"✦ 2,400+ players trust HitMaster daily"),
               React.createElement(Btn,{key:"btn",v:"cosmic",full:true,onClick:onUpgrade,lg:true},"Upgrade to Pro · $9.99/mo ♛"),
               React.createElement("div",{key:"trial",style:{textAlign:"center",marginTop:8}},React.createElement(Btn,{v:"ghost",onClick:onUpgrade,sm:true},"Try 5 days for $4.99 →"))])
          : React.createElement(Card,{key:"sub-active",style:{padding:"18px 20px"}},
              [React.createElement("div",{key:"row",style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}},
                 [React.createElement("div",{key:"info"},
                    [React.createElement("div",{key:"t",style:{fontSize:14,fontWeight:800,color:C.ink}},tierLabel+" Plan"),
                     React.createElement("div",{key:"s",style:{fontSize:12,color:C.green,fontWeight:600}},"● Active")]),
                  React.createElement(Pill,{key:"badge",label:"ACTIVE",color:C.green})]),
               React.createElement("div",{key:"bar",style:{height:5,background:C.bgMuted,borderRadius:3,overflow:"hidden",marginBottom:10}},
                 React.createElement("div",{style:{width:"75%",height:"100%",background:"linear-gradient(90deg,"+C.green+","+C.primary+")",borderRadius:3}})),
               React.createElement("div",{key:"actions",style:{display:"flex",gap:8,flexWrap:"wrap"}},
                 [React.createElement(Btn,{key:"mg",v:"outline",sm:true},"Manage Subscription"),
                  React.createElement(Btn,{key:"rs",v:"ghost",sm:true},"Restore Purchase")])]),

        // Plan comparison
        React.createElement(SecTitle,{key:"plans-t"},"Plan Comparison"),
        React.createElement("div",{key:"plans",style:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}},
          [{tier:"FREE",label:"Seeker",col:C.free},{tier:"PRO",label:"Oracle+",col:C.pro},{tier:"PLUS",label:"Mystic",col:C.plus}].map(p=>{
            const isActive=user.tier===p.tier;
            return React.createElement(Card,{key:p.tier,style:{padding:"14px",border:"2px solid "+(isActive?p.col:C.border),background:isActive?p.col+"08":C.bgCard}},
              [React.createElement("div",{key:"hdr",style:{display:"flex",alignItems:"center",gap:6,marginBottom:10}},
                 [React.createElement("span",{key:"i",style:{fontSize:13}},"🏠"),
                  React.createElement("div",{key:"n",style:{fontSize:11,fontWeight:800,color:p.col}},p.label),
                  isActive&&React.createElement(Pill,{key:"badge",label:"CURRENT",color:p.col,xs:true})]),
               ...PLAN_FEATURES[p.tier].map((f,i)=>React.createElement("div",{key:i,style:{fontSize:10,color:C.inkSec,padding:"3px 0",borderBottom:i<PLAN_FEATURES[p.tier].length-1?"1px solid "+C.border+"66":"none"}},"· "+f)),
               !isActive&&p.tier!=="FREE"&&React.createElement(Btn,{key:"up",v:p.tier==="PRO"?"gold":"outline",sm:true,full:true,onClick:onUpgrade,style:{marginTop:10}},"Upgrade ♛")]);
          })),

        // Notifications
        React.createElement(SecTitle,{key:"notif-t"},"Notifications"),
        React.createElement(Card,{key:"notifs",style:{padding:"4px 18px"}},
          [React.createElement(Toggle,{key:"nd",on:notifPrefs.nextDraw,onChange:v=>setNotifPrefs(p=>({...p,nextDraw:v})),label:"✦ Next Draw Alert",sub:"15 min before each draw"}),
           React.createElement(Toggle,{key:"sr",on:notifPrefs.slateReady,onChange:v=>setNotifPrefs(p=>({...p,slateReady:v})),label:"🔮 Slate Ready",sub:"When ZK6 generates your daily slate"}),
           React.createElement(Toggle,{key:"hi",on:notifPrefs.hits,onChange:v=>setNotifPrefs(p=>({...p,hits:v})),label:"⭐ Slate Hit Alert",sub:"When your picks match draw results"}),
           React.createElement(Toggle,{key:"pr",on:notifPrefs.promo,onChange:v=>setNotifPrefs(p=>({...p,promo:v})),label:"🎁 Promotions & New Features",sub:"Special offers and announcements"})]),

        // Glossary — proprietary-protective language
        React.createElement(SecTitle,{key:"gloss-t",sub:"Understanding your slates — what we show and what stays proprietary"},"Slate & ZK6 Glossary"),
        React.createElement("div",{key:"glossary",style:{display:"flex",flexDirection:"column",gap:5}},
          GLOSSARY.map((g,i)=>React.createElement("div",{key:i,style:{overflow:"hidden",borderRadius:11,border:"1px solid "+C.border}},
            [React.createElement("button",{key:"hdr",onClick:()=>setGloss(gloss===i?null:i),style:{width:"100%",background:gloss===i?"linear-gradient(135deg,"+C.primaryL+","+C.cosmicL+")":C.bgCard,border:"none",padding:"11px 16px",cursor:"pointer",fontFamily:F,display:"flex",alignItems:"center",justifyContent:"space-between",transition:"all .15s"}},
               [React.createElement("span",{key:"t",style:{fontSize:12,fontWeight:700,color:gloss===i?C.primary:C.ink}},(gloss===i?"✦ ":"")+g.term),
                React.createElement("span",{key:"a",style:{fontSize:11,color:C.inkTer}},gloss===i?"▲":"▼")]),
             gloss===i&&React.createElement("div",{key:"def",style:{padding:"12px 16px",background:C.bgCard,borderTop:"1px solid "+C.border}},
               React.createElement("p",{style:{fontSize:12,color:C.inkSec,margin:0,lineHeight:1.75}},g.def))]))),

        // Share
        React.createElement(SecTitle,{key:"share-t"},"Invite Friends"),
        React.createElement(Card,{key:"share",style:{padding:"18px 20px",background:"linear-gradient(135deg,"+C.bgMuted+","+C.cosmicL+")",border:"1px solid "+C.border}},
          [React.createElement("div",{key:"row",style:{display:"flex",gap:12,alignItems:"flex-start",marginBottom:12}},
             [React.createElement("span",{key:"i",style:{fontSize:26}},"🎁"),
              React.createElement("div",{key:"txt"},
                [React.createElement("div",{key:"t",style:{fontSize:13,fontWeight:800,color:C.ink}},"Get 1 week free"),
                 React.createElement("div",{key:"s",style:{fontSize:12,color:C.inkSec}},"Invite a friend. When they subscribe, you both get 7 free days of Oracle+")])]),
           React.createElement("div",{key:"link",style:{display:"flex",gap:8,alignItems:"center"}},
             [React.createElement("div",{key:"code",style:{flex:1,background:C.bgCard,border:"1px solid "+C.border,borderRadius:9,padding:"8px 12px",fontFamily:M,fontSize:12,color:C.primary}},"hitmaster.app/oracle/YOU123"),
              React.createElement(Btn,{key:"copy",v:"primary",sm:true,onClick:()=>alert("✦ Link copied!")},"📋 Copy")])]),

        // Account links
        React.createElement(SecTitle,{key:"acct-t"},"Account"),
        React.createElement(Card,{key:"links",style:{padding:"4px 0"}},
          [["🔒","Change Password",""],["📧","Email Preferences",""],["🌐","Language","English (US)"],
           ["📱","App Version","v2.0 (ZK6 Engine)"],["📄","Terms of Service",""],["🛡","Privacy Policy",""],["💬","Contact Support",""],
           ["🚪","Sign Out","",true]
          ].map(([icon,label,meta,danger],i,arr)=>
            React.createElement("div",{key:i,style:{display:"flex",alignItems:"center",gap:12,padding:"13px 18px",borderBottom:i<arr.length-1?"1px solid "+C.border:"none",cursor:"pointer"}},
              [React.createElement("span",{key:"i",style:{fontSize:16}},icon),
               React.createElement("span",{key:"l",style:{flex:1,fontSize:13,fontWeight:600,color:danger?C.red:C.ink}},label),
               meta&&React.createElement("span",{key:"m",style:{fontSize:11,color:C.inkTer}},meta),
               !meta&&React.createElement("span",{key:"a",style:{color:C.inkTer,fontSize:14}},"›")]))),

        React.createElement("div",{key:"footer",style:{textAlign:"center",padding:"24px 0 8px"}},
          [React.createElement("div",{key:"logo",style:{fontSize:15,fontWeight:900,color:C.ink,marginBottom:4}},["HIT",React.createElement("span",{key:"s",style:{color:C.primary}},"MASTER")," ✦"]),
           React.createElement("div",{key:"v",style:{fontSize:10,color:C.inkTer}},"Powered by ZK6™ Intelligence Engine"),
           React.createElement("div",{key:"d",style:{fontSize:10,color:C.inkTer,marginTop:2}},"© 2026 HitMaster · For entertainment only · Not financial advice")]),
        React.createElement("div",{key:"spacer",style:{height:40}}))));
}

// ─── HOME SCREEN ──────────────────────────────────────────────────────────────
function HomeScreen({user,onUpgrade,slate,loading,scope,setScope,wKey,setWKey}){
  const[detail,setDetail]=useState(null);
  const isFree=user.tier==="FREE";
  const avgEnergy=slate?Math.round(slate.k6.reduce((a,x)=>a+x.energy,0)/slate.k6.length):0;
  const ScopeBtn=({id,l})=>{const on=scope===id;return React.createElement("button",{onClick:()=>setScope(id),style:{padding:"6px 12px",borderRadius:9,border:"none",cursor:"pointer",fontFamily:F,background:on?C.bgCard:"transparent",color:on?C.primary:C.inkSec,fontWeight:on?700:500,fontSize:12,boxShadow:on?"0 2px 8px #1E1B4B10":"none",transition:"all .15s"}},l);};
  return React.createElement("div",{style:{flex:1,overflowY:"auto"}},
    [React.createElement("div",{key:"inner",style:{padding:"24px 28px",maxWidth:680,width:"100%"}},
      [React.createElement("div",{key:"hdr",style:{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:14,marginBottom:16}},
         [React.createElement("div",{key:"t"},
            [React.createElement("h1",{key:"h",style:{fontSize:26,fontWeight:900,color:C.ink,margin:"0 0 4px",lineHeight:1.1}},["Today's ",React.createElement("span",{key:"s",style:{color:C.primary}},"Slates")," ⚡"]),
             React.createElement("p",{key:"p",style:{fontSize:12,color:C.inkSec,margin:0}},"Your daily slates, powered by ZK6 Engine")]),
          React.createElement("div",{key:"scope",style:{display:"flex",gap:3,background:C.bgMuted,borderRadius:12,padding:3}},
            [React.createElement(ScopeBtn,{key:"m",id:"midday",l:"☀️ Midday"}),
             React.createElement(ScopeBtn,{key:"e",id:"evening",l:"🌙 Evening"}),
             React.createElement(ScopeBtn,{key:"a",id:"allday",l:"◈ All Day"})])]),
       React.createElement(DrawTicker,{key:"ticker",session:scope}),
       React.createElement(LiveResultsTicker,{key:"ticker2"}),
       React.createElement("div",{key:"modes",style:{display:"flex",gap:5,margin:"12px 0",alignItems:"center"}},
         [React.createElement("span",{key:"l",style:{fontSize:9,color:C.inkTer,fontWeight:800,letterSpacing:1.5}},"MODE"),
          ...["balanced","conservative","aggressive"].map(k=>{const on=wKey===k;return React.createElement("button",{key:k,onClick:()=>setWKey(k),style:{fontSize:10,padding:"4px 11px",borderRadius:99,fontFamily:F,fontWeight:700,cursor:"pointer",border:"1.5px solid "+(on?C.primary:C.border),background:on?C.primaryL:"transparent",color:on?C.primary:C.inkTer,transition:"all .15s"}},k.charAt(0).toUpperCase()+k.slice(1));})]),
       React.createElement(Card,{key:"hero",style:{padding:"20px 22px",marginBottom:16,display:"flex",alignItems:"center",gap:22,flexWrap:"wrap"}},
         loading
           ?React.createElement("div",{style:{width:"100%",textAlign:"center",padding:"20px",color:C.inkTer,fontSize:13}},"⚡ Computing your K6 Slate…")
           :[React.createElement(EnergyMeter,{key:"m",energy:avgEnergy}),
             React.createElement("div",{key:"info",style:{flex:1,minWidth:160}},
               [React.createElement("div",{key:"h",style:{fontSize:9,color:C.inkTer,fontWeight:800,letterSpacing:2,marginBottom:8}},"✦ ORACLE SUMMARY"),
                React.createElement("div",{key:"v",style:{fontSize:13,color:C.inkSec,marginBottom:3}},React.createElement("b",{key:"b",style:{color:C.ink}},isFree?2:6)," slate picks visible"),
                React.createElement("div",{key:"s",style:{fontSize:13,color:C.inkSec,marginBottom:14}},["Scope: ",React.createElement("b",{key:"b",style:{color:C.primary,textTransform:"capitalize"}},scope)]),
                React.createElement("div",{key:"btns",style:{display:"flex",gap:8,flexWrap:"wrap"}},
                  [React.createElement(Btn,{key:"hc",v:"outline",sm:true,onClick:isFree?onUpgrade:undefined},"⚡ Heat Check"),
                   React.createElement(Btn,{key:"pb",v:"ghost",sm:true,onClick:isFree?onUpgrade:undefined},"💰 Budget Pick")])])]),
       !loading&&slate&&React.createElement("div",{key:"k6"},
         [React.createElement("div",{key:"t",style:{fontSize:10,fontWeight:800,color:C.inkTer,letterSpacing:2,marginBottom:10,display:"flex",justifyContent:"space-between",textTransform:"uppercase"}},
            ["K6 Slate",React.createElement("span",{key:"sub",style:{fontWeight:400,letterSpacing:0,fontSize:10,color:C.inkTer,textTransform:"none"}},"Tap to expand ↗")]),
          ...slate.k6.map((pick,i)=>React.createElement(PickCard,{key:pick.combo,pick,locked:isFree&&i>=2,delay:i*60,onOpen:setDetail,isPro:!isFree})),
          isFree&&React.createElement("div",{key:"gate",style:{marginTop:10,borderRadius:18,background:"linear-gradient(135deg,"+C.cosmicL+","+C.goldL+")",border:"1.5px solid "+C.primary+"33",padding:"22px",textAlign:"center"}},
            [React.createElement("div",{key:"c",style:{fontSize:30,marginBottom:6}},"🏠"),
             React.createElement("div",{key:"t",style:{fontSize:14,fontWeight:800,color:C.ink,marginBottom:4}},"Unlock your full K6 Slate"),
             React.createElement("p",{key:"d",style:{fontSize:12,color:C.inkSec,marginBottom:14,maxWidth:260,margin:"0 auto 14px"}},"All 6 K6 picks · Optimal straights · Energy analysis · 76 draws"),
             React.createElement(Btn,{key:"btn",v:"cosmic",onClick:onUpgrade,style:{padding:"11px 28px",fontSize:14}},"Upgrade to Pro · $9.99/mo ♛")])]),
       React.createElement("div",{key:"rp",style:{marginTop:20,padding:"12px 16px",borderRadius:12,border:"1px solid "+C.border,background:C.bgMuted}},
         React.createElement("p",{style:{fontSize:11,color:C.inkSec,margin:0,lineHeight:1.7}},
           ["⚠️ ",React.createElement("b",{key:"b"},"Responsible Play:")," HitMaster slate picks are for entertainment and analysis only — not guarantees. Play responsibly. ",React.createElement("b",{key:"b2"},"1-800-GAMBLER")])),
       React.createElement("div",{key:"spacer",style:{height:40}})]),
     detail&&React.createElement(SlateDrawer,{key:"drawer",pick:detail,onClose:()=>setDetail(null),isPro:user.tier!=="FREE"})]);
}

// ─── SLATES SCREEN ────────────────────────────────────────────────────────────
function SlatesScreen({user,onUpgrade,slate,loading,scope,setScope,wKey,setWKey}){
  const[detail,setDetail]=useState(null);const[search,setSearch]=useState("");const[fMult,setFMult]=useState("all");const[sort,setSort]=useState("rank");
  const isFree=user.tier==="FREE";
  const filtered=useMemo(()=>{
    if(!slate)return[];let p=[...slate.k6];
    if(search)p=p.filter(x=>x.combo.includes(search)||x.comboSet.includes(search));
    if(fMult!=="all")p=p.filter(x=>x.mult===fMult);
    if(sort==="energy")p.sort((a,b)=>b.energy-a.energy);else if(sort==="freq")p.sort((a,b)=>b.signals.BOX-a.signals.BOX);else p.sort((a,b)=>a.rank-b.rank);
    return p;
  },[slate,search,fMult,sort]);
  const FB=({id,label,grp})=>{const cur=grp==="mult"?fMult:sort;const set=grp==="mult"?setFMult:setSort;const on=cur===id;return React.createElement("button",{onClick:()=>set(id),style:{padding:"5px 10px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:F,fontSize:11,fontWeight:on?700:500,background:on?(grp==="sort"?C.primary:C.bgCard):"transparent",color:on?(grp==="sort"?"#fff":C.ink):C.inkSec,transition:"all .13s",whiteSpace:"nowrap"}},label);};
  const ScopeBtn=({id,l})=>{const on=scope===id;return React.createElement("button",{onClick:()=>setScope(id),style:{padding:"6px 12px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:F,background:on?C.bgCard:"transparent",color:on?C.primary:C.inkSec,fontWeight:on?700:500,fontSize:12,boxShadow:on?"0 2px 8px #1E1B4B10":"none",transition:"all .15s"}},l);};
  return React.createElement("div",{style:{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}},
    [React.createElement("div",{key:"snap",style:{background:C.bgCard,borderBottom:"1px solid "+C.border,padding:"8px 20px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",fontSize:11}},
       [React.createElement("span",{key:"live",style:{display:"flex",alignItems:"center",gap:5,color:C.green}},[React.createElement("span",{key:"d",style:{width:6,height:6,borderRadius:"50%",background:C.green,display:"inline-block",boxShadow:"0 0 6px "+C.green}}),"✦ Oracle Live"]),
        React.createElement("span",{key:"t",style:{color:C.inkSec}},React.createElement("b",{style:{color:C.ink,fontFamily:M}},fET())),
        slate&&React.createElement("code",{key:"h",style:{fontFamily:M,color:C.inkTer,fontSize:10}},"…"+(slate.hash||"").slice(-6)),
        React.createElement("div",{key:"hz",style:{display:"flex",gap:3}},
          slate&&Object.entries(slate.horizonsPresent).slice(0,4).map(([h,ok])=>
            React.createElement("span",{key:h,style:{fontSize:9,padding:"2px 5px",borderRadius:4,fontWeight:700,background:ok?C.greenL:C.bgMuted,color:ok?C.green:C.inkTer,border:"1px solid "+(ok?C.green+"33":C.border)}},h+(ok?" ✓":" ⌛"))))]),
     React.createElement("div",{key:"body",style:{flex:1,overflowY:"auto",padding:"16px 20px"}},
       [React.createElement("div",{key:"hdr",style:{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}},
          [React.createElement("div",{key:"t"},[React.createElement("h1",{key:"h",style:{fontSize:22,fontWeight:900,color:C.ink,margin:"0 0 2px"}},["⚡ K6 ",React.createElement("span",{key:"s",style:{color:C.primary}},"Slates")]),React.createElement("p",{key:"p",style:{fontSize:11,color:C.inkSec,margin:0}},"ZK6 Intelligence · Tap any pick for full breakdown")]),
           React.createElement(Btn,{key:"pro",v:"cosmic",sm:true,onClick:onUpgrade},"♛ Upgrade")]),
        React.createElement("div",{key:"scope",style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10,alignItems:"center"}},
          [React.createElement("div",{key:"scopes",style:{display:"flex",gap:3,background:C.bgMuted,borderRadius:11,padding:3}},
             [React.createElement(ScopeBtn,{key:"m",id:"midday",l:"☀️ Midday"}),
              React.createElement(ScopeBtn,{key:"e",id:"evening",l:"🌙 Evening"}),
              React.createElement(ScopeBtn,{key:"a",id:"allday",l:"◈ All Day"})]),
           ...["balanced","conservative","aggressive"].map(k=>{const on=wKey===k;return React.createElement("button",{key:k,onClick:()=>setWKey(k),style:{fontSize:10,padding:"4px 10px",borderRadius:99,fontFamily:F,fontWeight:700,cursor:"pointer",border:"1.5px solid "+(on?C.primary:C.border),background:on?C.primaryL:"transparent",color:on?C.primary:C.inkTer,transition:"all .15s"}},k.charAt(0).toUpperCase()+k.slice(1));})]),
        isFree&&!loading&&React.createElement("div",{key:"banner",style:{background:"linear-gradient(135deg,"+C.cosmicL+","+C.goldL+")",border:"1.5px solid "+C.primary+"33",borderRadius:14,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,marginBottom:12}},
          [React.createElement("span",{key:"c",style:{fontSize:20}},"🏠"),
           React.createElement("div",{key:"txt",style:{flex:1}},[React.createElement("div",{key:"t",style:{fontSize:12,fontWeight:800,color:C.ink,marginBottom:2}},"See all 6 K6 Slate picks"),React.createElement("div",{key:"d",style:{fontSize:11,color:C.inkSec}},["Join ",React.createElement("b",{key:"b",style:{color:C.gold}},"2,400+ players")," on Pro slates."])]),
           React.createElement(Btn,{key:"btn",v:"gold",sm:true,onClick:onUpgrade},"Unlock ♛")]),
        React.createElement("div",{key:"search",style:{display:"flex",alignItems:"center",gap:8,background:C.bgMuted,borderRadius:10,padding:"7px 12px",border:"1.5px solid "+(search?C.primary:C.border),marginBottom:6,transition:"border .15s"}},
          [React.createElement("span",{key:"ic",style:{color:C.inkTer,fontSize:12}},"🔍"),
           React.createElement("input",{key:"inp",value:search,onChange:e=>setSearch(e.target.value),placeholder:"Search number…",style:{background:"none",border:"none",outline:"none",fontFamily:F,fontSize:12,color:C.ink,flex:1}})]),
        React.createElement("div",{key:"filters",style:{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",padding:"8px 0",marginBottom:8}},
          [React.createElement("div",{key:"mult",style:{display:"flex",gap:2,background:C.bgMuted,borderRadius:9,padding:3}},
             ["all","singles","doubles"].map(o=>React.createElement(FB,{key:o,id:o,label:o.charAt(0).toUpperCase()+o.slice(1),grp:"mult"}))),
           React.createElement("div",{key:"sort",style:{marginLeft:"auto",display:"flex",gap:3,alignItems:"center"}},
             [React.createElement("span",{key:"l",style:{fontSize:9,color:C.inkTer,fontWeight:800,letterSpacing:1}},"SORT"),
              React.createElement("div",{key:"btns",style:{display:"flex",gap:2,background:C.bgMuted,borderRadius:9,padding:3}},
                [{id:"rank",l:"Rank"},{id:"energy",l:"Energy"},{id:"freq",l:"Frequency"}].map(o=>React.createElement(FB,{key:o.id,id:o.id,label:o.l,grp:"sort"})))])]),
        React.createElement("div",{key:"cards",style:{display:"flex",flexDirection:"column",gap:10}},
          loading
            ?Array.from({length:6},(_,i)=>React.createElement("div",{key:i,style:{background:C.bgCard,borderRadius:18,border:"1px solid "+C.border,padding:"16px 20px",display:"flex",gap:14,opacity:1-i*.12}},
                [React.createElement("div",{key:"r",style:{width:38,height:38,borderRadius:11,background:C.bgMuted}}),
                 React.createElement("div",{key:"b",style:{flex:1}},[React.createElement("div",{key:"a",style:{width:80,height:22,background:C.bgMuted,borderRadius:6,marginBottom:8}}),React.createElement("div",{key:"c",style:{width:140,height:8,background:C.bgMuted,borderRadius:3}})]),
                 React.createElement("div",{key:"t",style:{width:52,height:52,borderRadius:13,background:C.bgMuted}})]))
            :filtered.map((pick,i)=>React.createElement(PickCard,{key:pick.combo,pick,locked:isFree&&pick.rank>2,delay:i*60,onOpen:setDetail,isPro:!isFree}))),
        !loading&&isFree&&React.createElement("div",{key:"upsell",style:{marginTop:16,padding:"18px 20px",borderRadius:16,background:"linear-gradient(135deg,"+C.primaryL+","+C.cosmicL+")",border:"1.5px solid "+C.primary+"33",textAlign:"center"}},
          [React.createElement("div",{key:"t",style:{fontSize:13,fontWeight:800,color:C.ink,marginBottom:4}},"♛ Unlock your full K6 Slate"),
           React.createElement("div",{key:"d",style:{fontSize:12,color:C.inkSec,marginBottom:12}},"Pro unlocks all 6 picks, optimal straights, pattern analysis — across 76 daily draws."),
           React.createElement(Btn,{key:"btn",v:"cosmic",onClick:onUpgrade},"♛ Begin Pro Trial · $4.99")]),
        React.createElement("div",{key:"spacer",style:{height:40}})]),
     detail&&React.createElement(SlateDrawer,{key:"drawer",pick:detail,onClose:()=>setDetail(null),isPro:user.tier!=="FREE"})]);
}

// ─── LEDGER SCREEN ────────────────────────────────────────────────────────────
function LedgerScreen({liveledger}){
  const ledgerData = (liveledger && liveledger.length>0) ? liveledger : LEDGER;
  const isLive = !!(liveledger && liveledger.length>0);
  const[dateF,setDateF]=useState(()=>{
    // Use most recent date available
    if(liveledger&&liveledger.length>0){
      const dates=[...new Set(liveledger.map(r=>r.date))].sort().reverse();
      return dates[0]||"2026-04-13";
    }
    return "2026-04-13";
  });
  const[sessF,setSessF]=useState("all");const[stateF,setStateF]=useState("all");const[search,setSearch]=useState("");const[expanded,setExpanded]=useState(null);
  const dates=useMemo(()=>{
    const d=[...new Set(ledgerData.map(r=>r.date))].sort().reverse().slice(0,7);
    return d.length>0?d:["2026-04-13","2026-04-12","2026-04-11","2026-04-10","2026-04-09"];
  },[ledgerData]);
  const allStates=useMemo(()=>[...new Set(ledgerData.map(r=>r.state))].sort(),[ledgerData]);
  const filtered=useMemo(()=>ledgerData.filter(r=>{if(r.date!==dateF)return false;if(sessF!=="all"&&r.session!==sessF)return false;if(stateF!=="all"&&r.state!==stateF)return false;if(search&&!r.result.includes(search)&&!r.label.toLowerCase().includes(search.toLowerCase())&&!r.state.toLowerCase().includes(search.toLowerCase()))return false;return true;}),[ledgerData,dateF,sessF,stateF,search]);
  const midRows=filtered.filter(r=>r.session==="midday"),eveRows=filtered.filter(r=>r.session==="evening");
  const SH=({label,count,color})=>React.createElement("div",{style:{display:"flex",alignItems:"center",gap:10,padding:"10px 0 6px",borderBottom:"1px solid "+C.border,marginBottom:6,marginTop:12}},
    [React.createElement("span",{key:"d",style:{width:8,height:8,borderRadius:"50%",background:color,display:"inline-block"}}),React.createElement("span",{key:"l",style:{fontSize:11,fontWeight:800,color,letterSpacing:1}},label),React.createElement("span",{key:"c",style:{fontSize:10,color:C.inkTer,marginLeft:"auto"}},count+" draws")]);
  const LR=({row})=>{const isExp=expanded===row.label+row.date+row.result;const isMid=row.session==="midday";const sc=isMid?C.gold:C.primary;
    return React.createElement("div",{style:{marginBottom:6}},
      React.createElement(Card,{onClick:()=>setExpanded(isExp?null:row.label+row.date+row.result),style:{padding:"10px 14px",borderLeft:"3px solid "+sc}},
        [React.createElement("div",{key:"main",style:{display:"flex",alignItems:"center",gap:10}},
           [React.createElement("div",{key:"st",style:{minWidth:34,height:34,borderRadius:9,background:isMid?C.goldL:C.primaryL,border:"1px solid "+(isMid?C.gold+"44":C.primary+"44"),display:"flex",alignItems:"center",justifyContent:"center"}},
              React.createElement("span",{style:{fontSize:9,fontWeight:800,color:isMid?C.gold:C.primary}},row.state)),
            React.createElement("div",{key:"info",style:{flex:1}},[React.createElement("div",{key:"l",style:{fontSize:11,fontWeight:700,color:C.ink}},row.label),React.createElement("div",{key:"t",style:{fontSize:10,color:C.inkTer}},row.time)]),
            React.createElement("span",{key:"r",style:{fontSize:20,fontWeight:900,color:C.ink,letterSpacing:4,fontFamily:M}},row.result),
            React.createElement("span",{key:"s",style:{fontSize:10,color:C.inkTer,fontFamily:M}},row.comboSet),
            React.createElement("span",{key:"arr",style:{fontSize:12,color:C.inkTer}},isExp?"▲":"▼")]),
         isExp&&React.createElement("div",{key:"detail",style:{marginTop:10,paddingTop:10,borderTop:"1px solid "+C.border}},
           [React.createElement("div",{key:"pairs",style:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:8}},
              [{l:"FRONT",v:row.front,c:C.primary},{l:"BACK",v:row.back,c:C.rose},{l:"SPLIT",v:row.split,c:C.teal}].map(p=>
                React.createElement(Card,{key:p.l,style:{padding:"8px",textAlign:"center",background:C.bgMuted}},
                  [React.createElement("div",{key:"l",style:{fontSize:9,color:C.inkTer,fontWeight:700,marginBottom:2}},p.l+" PAIR"),React.createElement("div",{key:"v",style:{fontSize:18,fontWeight:900,color:p.c,fontFamily:M}},p.v)]))),
            React.createElement("div",{key:"tags",style:{display:"flex",gap:6,flexWrap:"wrap"}},
              [React.createElement(Tag,{key:"s",label:row.session==="midday"?"☀️ Midday":"🌙 Evening",color:isMid?C.gold:C.primary}),
               React.createElement(Tag,{key:"set",label:"Box: "+row.comboSet,color:C.inkSec})])])]));};
  return React.createElement("div",{style:{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}},
    [React.createElement("div",{key:"ctrl",style:{background:C.bgCard,borderBottom:"1px solid "+C.border,padding:"10px 20px",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}},
       [React.createElement("div",{key:"dates",style:{display:"flex",gap:3,background:C.bgMuted,borderRadius:10,padding:3}},
          dates.map(d=>React.createElement("button",{key:d,onClick:()=>setDateF(d),style:{padding:"5px 10px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:F,fontSize:11,fontWeight:dateF===d?700:500,background:dateF===d?C.bgCard:"transparent",color:dateF===d?C.ink:C.inkSec,transition:"all .13s",whiteSpace:"nowrap"}},d.slice(5)))),
        React.createElement("div",{key:"sess",style:{display:"flex",gap:3,background:C.bgMuted,borderRadius:10,padding:3}},
          [{id:"all",l:"All"},{id:"midday",l:"☀️ Mid"},{id:"evening",l:"🌙 Eve"}].map(o=>React.createElement("button",{key:o.id,onClick:()=>setSessF(o.id),style:{padding:"5px 10px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:F,fontSize:11,fontWeight:sessF===o.id?700:500,background:sessF===o.id?C.bgCard:"transparent",color:sessF===o.id?C.ink:C.inkSec,transition:"all .13s"}},o.l))),
        React.createElement("select",{key:"state",value:stateF,onChange:e=>setStateF(e.target.value),style:{fontSize:11,padding:"6px 10px",borderRadius:9,border:"1px solid "+C.border,background:C.bgCard,color:C.ink,fontFamily:F,cursor:"pointer"}},
          [React.createElement("option",{key:"all",value:"all"},"All States"),...allStates.map(s=>React.createElement("option",{key:s,value:s},s))]),
        React.createElement("div",{key:"search",style:{display:"flex",alignItems:"center",gap:6,background:C.bgMuted,borderRadius:9,padding:"6px 12px",border:"1.5px solid "+(search?C.primary:C.border),flex:1,minWidth:120}},
          [React.createElement("span",{key:"ic",style:{color:C.inkTer,fontSize:12}},"🔍"),React.createElement("input",{key:"inp",value:search,onChange:e=>setSearch(e.target.value),placeholder:"Search…",style:{background:"none",border:"none",outline:"none",fontFamily:F,fontSize:12,color:C.ink,flex:1}})])]),
     React.createElement("div",{key:"stats",style:{padding:"8px 20px",background:C.bgCard,borderBottom:"1px solid "+C.border,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}},
       [React.createElement("span",{key:"t",style:{fontSize:11,color:C.inkSec}},[React.createElement("b",{key:"b",style:{color:C.ink}},filtered.length)," draws · "+dateF]),
        React.createElement("span",{key:"m",style:{fontSize:11,color:C.gold,fontWeight:700}},"☀️ "+midRows.length),
        React.createElement("span",{key:"e",style:{fontSize:11,color:C.primary,fontWeight:700}},"🌙 "+eveRows.length),
        React.createElement(DrawTicker,{key:"ticker",session:"all"})]),
     React.createElement("div",{key:"list",style:{flex:1,overflowY:"auto",padding:"0 20px 20px"}},
       [(sessF==="all"||sessF==="midday")&&[React.createElement(SH,{key:"mh",label:"☀️ MIDDAY",count:midRows.length,color:C.gold}),...midRows.map(row=>React.createElement(LR,{key:row.label+row.result+row.date,row}))],
        (sessF==="all"||sessF==="evening")&&[React.createElement(SH,{key:"eh",label:"🌙 EVENING",count:eveRows.length,color:C.primary}),...eveRows.map(row=>React.createElement(LR,{key:row.label+row.result+row.date,row}))],
        filtered.length===0&&React.createElement("div",{key:"empty",style:{textAlign:"center",padding:"40px",color:C.inkTer}},
          [React.createElement("div",{key:"i",style:{fontSize:32,marginBottom:8}},"📋"),React.createElement("div",{key:"t",style:{fontSize:13,fontWeight:700,color:C.ink}},"No results")])])]);
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function Sidebar({tab,setTab,user,adminClicks,setAdminClicks}){
  const tabs=[
    {id:"home",i:"🏠",l:"Home",dot:true},
    {id:"slates",i:"⚡",l:"Slates"},
    {id:"ledger",i:"📋",l:"Results"},
    {id:"book",i:"📖",l:"Number Book"},
    {id:"learn",i:"🎓",l:"Learn"},
    {id:"profile",i:"♛",l:"Profile"},
  ];
  const tc=user.tier==="FREE"?C.free:user.tier==="PRO"?C.pro:C.plus;
  const tl=user.tier==="FREE"?"FREE":user.tier==="PRO"?"PRO ♛":"PLUS ♛";

  // Triple-click logo to reveal admin (hidden from normal users)
  const handleLogoClick=()=>{
    const next=adminClicks+1;setAdminClicks(next);
    if(next>=3){setTab("admin");setAdminClicks(0);}
  };

  return React.createElement("div",{style:{width:210,background:C.bgCard,borderRight:"1px solid "+C.border,display:"flex",flexDirection:"column",padding:"22px 0",height:"100vh",boxShadow:"2px 0 12px "+C.primary+"06"}},
    [React.createElement("div",{key:"logo",onClick:handleLogoClick,style:{padding:"0 18px 24px",cursor:"default",userSelect:"none"}},
       [React.createElement("div",{key:"name",style:{fontSize:18,fontWeight:900,color:C.ink,letterSpacing:-.5}},
          ["HIT",React.createElement("span",{key:"s",style:{color:C.primary}},"MASTER")]),
        React.createElement("div",{key:"sub",style:{fontSize:9,color:C.inkTer,letterSpacing:2,marginTop:2}},"ZK6 ANALYTICS PLATFORM")]),
     React.createElement("div",{key:"nav",style:{flex:1,padding:"0 10px",display:"flex",flexDirection:"column",gap:2}},
       tabs.map(t=>{const on=tab===t.id;return React.createElement("button",{key:t.id,onClick:()=>setTab(t.id),style:{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:11,border:"none",cursor:"pointer",fontFamily:F,background:on?"linear-gradient(135deg,"+C.primaryL+","+C.cosmicL+")":"transparent",color:on?C.primary:C.inkSec,fontWeight:on?700:400,fontSize:13,transition:"all .15s",textAlign:"left",width:"100%",boxShadow:on?"0 2px 8px "+C.primary+"18":"none"}},
         [React.createElement("span",{key:"i"},t.i),t.l,t.dot&&React.createElement("span",{key:"dot",style:{marginLeft:"auto",width:6,height:6,borderRadius:"50%",background:C.red,boxShadow:"0 0 6px "+C.red}})]);})),
     React.createElement("div",{key:"user",style:{padding:"14px 18px",borderTop:"1px solid "+C.border}},
       [React.createElement("div",{key:"l",style:{fontSize:11,color:C.inkTer,marginBottom:4}},"Signed in"),
        React.createElement("div",{key:"e",style:{fontSize:12,color:C.ink,fontWeight:600,marginBottom:6,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},"you@example.com"),
        React.createElement(Pill,{key:"tier",label:"✦ "+tl,color:tc})])]);
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── LEARN SCREEN — Lottery Education for New Players ─────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const LEARN_MODULES = [
  {
    id:"what-is-pick3",icon:"🎰",title:"What is Pick 3?",
    summary:"The most popular daily lottery game in America.",
    sections:[
      {title:"The Basics",body:"Pick 3 is a daily lottery game where you choose 3 digits (000–999). Each state runs it 1–2 times per day — a Midday draw and an Evening draw. You pick 3 numbers and try to match the winning combination drawn by your state lottery."},
      {title:"How Much Can You Win?",body:"Straight play: match all 3 digits in exact order → typically $500 for a $1 bet.\nBox play: match all 3 digits in any order → typically $80–$160 for a $1 bet.\nStraight/Box combo: play both for one ticket → win both if you hit straight, or just the box prize if out of order."},
      {title:"Where Do You Buy Tickets?",body:"Walk into any gas station, convenience store, grocery store, or dedicated lottery retailer in your state. Ask for 'Pick 3' or look for the lottery terminal. Most states also allow online play through their official lottery website."},
    ]
  },
  {
    id:"box-vs-straight",icon:"📦",title:"Box vs Straight",
    summary:"The two ways to play — and why Box is the smarter play.",
    sections:[
      {title:"Straight Play",body:"You must match ALL 3 digits in the EXACT order they are drawn. Example: You play 4-2-7. The winning number drawn is 4-2-7. You WIN. If 7-2-4 or 2-7-4 is drawn — you LOSE. Higher payout (~$500 per $1) but much harder to win."},
      {title:"Box Play",body:"You match all 3 digits in ANY ORDER. Example: You play the box set {2,4,7}. You win if 4-2-7, 7-4-2, 2-7-4, or any arrangement of those three digits is drawn. Lower payout (~$80–$160) but significantly better odds."},
      {title:"HitMaster focuses on Box",body:"Our ZK6 Engine analyzes the universe of all possible 3-digit number sets (000–999). We score each SET regardless of order, then identify the optimal straight arrangement. This gives you the best of both worlds — the strategic edge of box analysis with the straight-play payout opportunity."},
      {title:"Singles vs Doubles vs Triples",body:"Singles: 3 different digits (123, 456) — 6 possible straight arrangements. Most common.\nDoubles: one repeated digit (112, 344) — 3 arrangements. Less frequent.\nTriples: all same digit (111, 777) — only 1 arrangement. Rare but high pattern signals."},
    ]
  },
  {
    id:"daily-drawings",icon:"📅",title:"Daily Drawing Times",
    summary:"76 draws happen every day — HitMaster tracks all of them.",
    sections:[
      {title:"Two Sessions Per Day",body:"Most states run Pick 3 twice daily:\n☀️ Midday: draws happen between 9:53 AM – 3:45 PM ET\n🌙 Evening: draws happen between 6:25 PM – 11:15 PM ET\n\nYou buy your ticket BEFORE the draw. Most states stop selling tickets 15–30 minutes before draw time."},
      {title:"Your State's Times",body:"Every state has its specific draw time. For example:\n• New York Midday: 2:00 PM ET\n• Florida Evening: 9:15 PM ET\n• Ohio Midday: 12:14 PM ET\n• California Evening: 9:15 PM ET\n\nHitMaster shows you all 76 daily draw times and the next upcoming draw at the top of every screen."},
      {title:"All Day Scope",body:"HitMaster's 'All Day' analysis combines data from BOTH Midday and Evening sessions. This gives ZK6 the largest possible historical dataset to work with — ideal when you want the strongest overall picks regardless of session."},
    ]
  },
  {
    id:"regions-states",icon:"🗺",title:"States & Regions",
    summary:"Pick 3 is played across the US and Canada — each state is its own game.",
    sections:[
      {title:"Each State is Independent",body:"Every state runs its own Pick 3 lottery with its own drawing equipment, its own history, and its own winning numbers. A number hitting in New York does NOT affect New York's next draw — each draw is independent."},
      {title:"Drawing Method Matters",body:"States using physical ball machines (like TX, SC, NY, FL) produce draws with real physical randomness — slight mechanical patterns can emerge over time. States using computerized RNG (random number generators) are designed to be purely random. ZK6 adjusts its signal confidence accordingly."},
      {title:"HitMaster Covers 40+ Jurisdictions",body:"We track Pick 3 drawings in: AZ, AR, CA, CO, CT, DC, DE, FL, GA, IA, ID, IL, IN, KS, KY, LA, ME, MI, MN, MO, MS, NC, NE, NH, NJ, NM, NY, OH, OK, PA, SC, TN, TX, VA, VT, WA, WI, WV — plus Ontario, Quebec, and Western Canada."},
    ]
  },
  {
    id:"zk6-for-you",icon:"⚡",title:"How ZK6 Works For You",
    summary:"You don't need to understand the math — just follow the slate.",
    sections:[
      {title:"Your Daily K6 Slate",body:"Every day, ZK6 analyzes the entire Pick 3 universe — all 1,000 possible combinations — and selects the 6 picks with the strongest signal convergence. These are your K6 Slate picks. Pro members see all 6; Free members see the top 2 as a preview."},
      {title:"Reading a Pick Card",body:"Each pick shows:\n• The 3-digit number set and its box combination\n• Frequency, Momentum, Pattern signal bars (higher = stronger signal)\n• Energy Score (0–100): how strongly the pick stands out vs. the full universe\n• Optimal Straight: the best ordering for straight play\n\nPicks with Energy 65+ are considered HOT. 80+ is BLAZING."},
      {title:"How to Use It",body:"1. Open HitMaster before your state's draw time\n2. Check the K6 Slate for your session (Midday or Evening)\n3. Find your state's picks — or use All Day for the combined slate\n4. Play the top picks as Box bets at your local lottery retailer\n5. After the draw, check Results to see if your picks hit"},
      {title:"Managing Expectations",body:"HitMaster provides data-driven analysis to help you make smarter picks — it is NOT a guarantee of winning. The lottery is a game of chance. ZK6 identifies statistical patterns and signal convergence, but every draw is independent. Play responsibly, within your means."},
    ]
  },
];

function LearnScreen({user,onUpgrade}){
  const[active,setActive]=useState(null);
  const[section,setSection]=useState(null);
  const isPro=user.tier!=="FREE";

  const activeModule=LEARN_MODULES.find(m=>m.id===active);

  return React.createElement("div",{style:{flex:1,display:"flex",overflow:"hidden"}},
    [// Left: module list
     React.createElement("div",{key:"nav",style:{width:260,borderRight:"1px solid "+C.border,display:"flex",flexDirection:"column",background:C.bgCard}},
       [React.createElement("div",{key:"hdr",style:{padding:"18px 16px 12px",borderBottom:"1px solid "+C.border}},
          [React.createElement("div",{key:"t",style:{fontSize:15,fontWeight:900,color:C.ink,marginBottom:2}},["🎓 ",React.createElement("span",{key:"s",style:{color:C.primary}},"Learn to Play")]),
           React.createElement("div",{key:"s",style:{fontSize:11,color:C.inkTer}},"Pick 3 from zero to pro player")]),
        React.createElement("div",{key:"list",style:{flex:1,overflowY:"auto",padding:"8px"}},
          LEARN_MODULES.map(m=>{
            const on=active===m.id;
            return React.createElement("div",{key:m.id,onClick:()=>{setActive(m.id);setSection(null);},
              style:{padding:"12px",borderRadius:11,cursor:"pointer",marginBottom:4,transition:"all .15s",
                background:on?"linear-gradient(135deg,"+C.primaryL+","+C.cosmicL+")":"transparent",
                border:on?"1px solid "+C.primary+"33":"1px solid transparent"}},
              [React.createElement("div",{key:"row",style:{display:"flex",gap:10,alignItems:"flex-start"}},
                 [React.createElement("span",{key:"i",style:{fontSize:20,flexShrink:0}},m.icon),
                  React.createElement("div",{key:"info"},
                    [React.createElement("div",{key:"t",style:{fontSize:12,fontWeight:700,color:on?C.primary:C.ink}},m.title),
                     React.createElement("div",{key:"s",style:{fontSize:10,color:C.inkTer,marginTop:2,lineHeight:1.4}},m.summary)])])]);})),

        // Quick tip at bottom
        React.createElement("div",{key:"tip",style:{padding:"12px 14px",background:C.goldL,borderTop:"1px solid "+C.gold+"33",margin:"8px",borderRadius:10}},
          [React.createElement("div",{key:"t",style:{fontSize:10,fontWeight:800,color:C.gold,marginBottom:3}},"💡 Quick Tip"),
           React.createElement("div",{key:"d",style:{fontSize:10,color:C.inkSec,lineHeight:1.5}},"Always play BOX on new picks. Once you're comfortable, add straight plays for bigger payouts.")])]),

     // Right: module content
     React.createElement("div",{key:"content",style:{flex:1,overflowY:"auto",background:C.bg,padding:"0"}},
       !active
         // Welcome page
         ? React.createElement("div",{style:{padding:"32px"}},
             [React.createElement("div",{key:"hero",style:{textAlign:"center",padding:"20px 0 28px"}},
                [React.createElement("div",{key:"i",style:{fontSize:52,marginBottom:10}},"🎓"),
                 React.createElement("h2",{key:"t",style:{fontSize:22,fontWeight:900,color:C.ink,margin:"0 0 8px"}},"New to Pick 3?"),
                 React.createElement("p",{key:"d",style:{fontSize:13,color:C.inkSec,maxWidth:380,margin:"0 auto",lineHeight:1.7}},
                   "Most players only know how to play at their local store in their home state. We'll teach you everything — from buying your first ticket to understanding ZK6 picks — in plain English.")]),
              React.createElement("div",{key:"modules",style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}},
                LEARN_MODULES.map(m=>React.createElement(Card,{key:m.id,onClick:()=>setActive(m.id),style:{padding:"16px",cursor:"pointer"}},
                  [React.createElement("div",{key:"i",style:{fontSize:28,marginBottom:8}},m.icon),
                   React.createElement("div",{key:"t",style:{fontSize:13,fontWeight:700,color:C.ink,marginBottom:4}},m.title),
                   React.createElement("div",{key:"s",style:{fontSize:11,color:C.inkSec,lineHeight:1.5}},m.summary)]))),
              React.createElement("div",{key:"cta",style:{marginTop:24,padding:"18px 20px",borderRadius:14,background:"linear-gradient(135deg,"+C.primaryL+","+C.cosmicL+")",border:"1px solid "+C.primary+"33",textAlign:"center"}},
                [React.createElement("div",{key:"t",style:{fontSize:13,fontWeight:800,color:C.ink,marginBottom:4}},"Ready to get your picks?"),
                 React.createElement("div",{key:"d",style:{fontSize:11,color:C.inkSec,marginBottom:12}},"Once you understand the basics, your daily K6 Slate is waiting."),
                 React.createElement(Btn,{key:"btn",v:"primary",onClick:()=>setActive("zk6-for-you")},"Start with ZK6 ⚡")])])

         // Module detail
         : activeModule&&React.createElement("div",{style:{padding:"28px"}},
             [React.createElement("button",{key:"back",onClick:()=>setActive(null),
                style:{background:"none",border:"none",cursor:"pointer",fontSize:13,color:C.inkSec,
                  display:"flex",alignItems:"center",gap:4,marginBottom:16,fontFamily:F}},
                "← All Topics"),
              React.createElement("div",{key:"hero",style:{display:"flex",gap:14,alignItems:"flex-start",marginBottom:24}},
                [React.createElement("span",{key:"i",style:{fontSize:40}},activeModule.icon),
                 React.createElement("div",{key:"info"},
                   [React.createElement("h2",{key:"t",style:{fontSize:20,fontWeight:900,color:C.ink,margin:"0 0 4px"}},activeModule.title),
                    React.createElement("p",{key:"s",style:{fontSize:13,color:C.inkSec,margin:0}},activeModule.summary)])]),
              ...activeModule.sections.map((s,i)=>React.createElement(Card,{key:i,style:{padding:"18px",marginBottom:12}},
                [React.createElement("div",{key:"t",style:{fontSize:13,fontWeight:800,color:C.primary,marginBottom:8}},s.title),
                 React.createElement("div",{key:"b",style:{fontSize:13,color:C.inkSec,lineHeight:1.8,whiteSpace:"pre-line"}},s.body)])),

              // Pro secret teaser for "playing nationwide"
              active==="regions-states"&&!isPro&&React.createElement(Card,{key:"secret",style:{padding:"18px",marginTop:4,background:"linear-gradient(135deg,"+C.cosmicL+","+C.goldL+")",border:"1.5px dashed "+C.primary+"44"}},
                [React.createElement("div",{key:"i",style:{fontSize:24,marginBottom:6}},"🔐"),
                 React.createElement("div",{key:"t",style:{fontSize:14,fontWeight:800,color:C.ink,marginBottom:4}},"Pro Secret: Play All States Nationwide"),
                 React.createElement("div",{key:"d",style:{fontSize:12,color:C.inkSec,marginBottom:12}},"Did you know you can legally play Pick 3 in multiple states from your home? Pro members unlock our curated guide showing exactly how."),
                 React.createElement(Btn,{key:"btn",v:"gold",onClick:onUpgrade},"Unlock with Pro ♛")]),

              active==="regions-states"&&isPro&&React.createElement(Card,{key:"nationwide",style:{padding:"18px",marginTop:4,background:C.greenL,border:"1px solid "+C.green+"33"}},
                [React.createElement("div",{key:"i",style:{fontSize:24,marginBottom:6}},"🌎"),
                 React.createElement("div",{key:"t",style:{fontSize:14,fontWeight:800,color:C.ink,marginBottom:4}},"Play All States — Pro Members Only"),
                 React.createElement("div",{key:"d",style:{fontSize:12,color:C.inkSec,marginBottom:12}},"Legal lottery concierge services allow you to play in multiple US states from anywhere. Your ZK6 picks work everywhere these services operate."),
                 React.createElement("a",{key:"link",
                   href:"https://www.thelotter.com",target:"_blank",rel:"noopener",
                   style:{display:"inline-block",padding:"10px 20px",borderRadius:10,background:C.green,
                     color:"#fff",fontFamily:F,fontSize:13,fontWeight:700,textDecoration:"none"}},
                   "🌐 Access Nationwide Play Guide →")])]))]);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── CREATOR SCREEN — Import Wizard + Health + History ────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Mock import history
const MOCK_IMPORTS = [
  {id:"i1",type:"box_history",class_id:1,horizon:"H01Y",scope:"midday",status:"completed",accepted:847,rejected:3,fixed:12,warnings:["3 rows had DS<0, auto-set to 0"],created_at:"2026-04-12T10:31:00",p99:287,first_seen:"2025-01-01",last_seen:"2026-04-12"},
  {id:"i2",type:"pair_history",class_id:2,horizon:"H01Y",scope:"midday",status:"completed",accepted:612,rejected:0,fixed:4,warnings:[],created_at:"2026-04-12T10:35:00",p99:198,first_seen:"2025-01-01",last_seen:"2026-04-12"},
  {id:"i3",type:"pair_history",class_id:3,horizon:"H01Y",scope:"midday",status:"completed",accepted:608,rejected:1,fixed:2,warnings:["1 pair key zero-padded"],created_at:"2026-04-12T10:38:00",p99:201,first_seen:"2025-01-01",last_seen:"2026-04-12"},
  {id:"i4",type:"box_history",class_id:1,horizon:"H01Y",scope:"evening",status:"completed",accepted:831,rejected:5,fixed:9,warnings:["5 rows rejected: invalid date format"],created_at:"2026-04-11T18:20:00",p99:312,first_seen:"2025-01-02",last_seen:"2026-04-11"},
  {id:"i5",type:"ledger",class_id:null,horizon:null,scope:"allday",status:"completed",accepted:1240,rejected:0,fixed:0,warnings:[],created_at:"2026-04-11T09:00:00",p99:null,first_seen:"2024-01-01",last_seen:"2026-04-11"},
  {id:"i6",type:"daily_input",class_id:null,horizon:null,scope:"midday",status:"completed",accepted:22,rejected:0,fixed:0,warnings:[],created_at:"2026-04-13T14:00:00",p99:null,first_seen:null,last_seen:null},
  {id:"i7",type:"box_history",class_id:1,horizon:"H02Y",scope:"allday",status:"failed",accepted:0,rejected:0,fixed:0,warnings:["Schema error: missing DrawsSince column"],created_at:"2026-04-10T11:00:00",p99:null,first_seen:null,last_seen:null},
];

const IMPORT_TYPES = [
  {id:"box_history",icon:"📦",label:"Box History",desc:"Unordered combo frequency data.\nOne file per scope × horizon (H01Y–H10Y).",color:"#2563EB",headers:["Combo","ComboSet","TimesDrawn","LastSeen","DrawsSince"]},
  {id:"pair_history",icon:"🔗",label:"Pair History",desc:"Pair class frequency data.\nClasses 2–11, one file per class × scope × horizon.",color:"#7C3AED",headers:["Pair","TimesDrawn","LastSeen","DrawsSince"]},
  {id:"daily_input",icon:"📅",label:"Daily Input",desc:"Today's draw results for DrawsSince rescoring.\nSame shape as Box History.",color:"#D97706",headers:["Combo","ComboSet","TimesDrawn","LastSeen","DrawsSince"]},
  {id:"ledger",icon:"📋",label:"Results Ledger",desc:"Authoritative draw results by jurisdiction.\nDrives hit tracking and same-day exclusion.",color:"#059669",headers:["jurisdiction","game","date_et","session","result_digits"]},
];

const PAIR_CLASSES = [
  {id:2,label:"Front Pair Straight (AB)"},{id:3,label:"Back Pair Straight (BC)"},{id:4,label:"Split Pair Straight (AC)"},
  {id:5,label:"Front Pair Box {A,B}"},{id:6,label:"Back Pair Box {B,C}"},{id:7,label:"Split Pair Box {A,C}"},
  {id:8,label:"Front from Box Sort"},{id:9,label:"Back from Box Sort"},{id:10,label:"Split from Box Sort"},
  {id:11,label:"Any Position Box"},
];

// ── Import Wizard ─────────────────────────────────────────────────────────────
function ImportWizard({onBack,onDone}){
  const[step,setStep]=useState(0); // 0=select type, 1=configure, 2=validate, 3=review, 4=result
  const[importType,setImportType]=useState(null);
  const[config,setConfig]=useState({scope:"midday",horizon:"H01Y",class_id:1});
  const[csvText,setCsvText]=useState("");
  const[parsed,setParsed]=useState(null);
  const[validating,setValidating]=useState(false);
  const[importing,setImporting]=useState(false);
  const[result,setResult]=useState(null);

  const typeInfo = IMPORT_TYPES.find(t=>t.id===importType);

  // Parse CSV text into rows + validation
  const parseCSV = useCallback((text)=>{
    const lines = text.trim().split('\n').filter(l=>l.trim());
    if(!lines.length) return null;
    const headers = lines[0].split(',').map(h=>h.trim().replace(/"/g,''));
    const rows = lines.slice(1).map(l=>l.split(',').map(c=>c.trim().replace(/"/g,'')));
    
    const errors=[], fixes=[], warnings=[];
    const validRows=[], rejectedRows=[];
    
    rows.forEach((row,i)=>{
      const obj={};
      headers.forEach((h,j)=>obj[h]=row[j]||'');
      
      let valid=true;
      
      // DrawsSince must be >= 0
      if(obj.DrawsSince!==undefined){
        const ds=parseInt(obj.DrawsSince);
        if(isNaN(ds)){ errors.push(`Row ${i+2}: DrawsSince invalid`); valid=false; }
        else if(ds<0){ fixes.push(`Row ${i+2}: DrawsSince ${ds} → 0`); obj.DrawsSince='0'; }
      }
      // Pair key zero-pad
      if(obj.Pair!==undefined && obj.Pair.length===1){ 
        fixes.push(`Row ${i+2}: Pair '${obj.Pair}' zero-padded to '0${obj.Pair}'`);
        obj.Pair='0'+obj.Pair;
      }
      // Date format
      if(obj.LastSeen && !/^\d{4}-\d{2}-\d{2}$/.test(obj.LastSeen)){
        warnings.push(`Row ${i+2}: LastSeen format unusual: ${obj.LastSeen}`);
      }
      
      if(valid) validRows.push(obj); else rejectedRows.push(obj);
    });
    
    return {headers,totalRows:rows.length,accepted:validRows.length,rejected:rejectedRows.length,
      fixed:fixes.length,warnings,fixes,errors,sampleRows:validRows.slice(0,5)};
  },[]);

  const handleValidate = useCallback(()=>{
    setValidating(true);
    setTimeout(()=>{
      const p = parseCSV(csvText||generateSampleCSV(typeInfo));
      setParsed(p);
      setValidating(false);
      setStep(3);
    },900);
  },[csvText,typeInfo,parseCSV]);

  const handleCommit = useCallback(()=>{
    setImporting(true);
    setTimeout(()=>{
      setResult({
        id:"imp_"+Date.now(),
        type:importType,
        ...config,
        accepted:parsed?.accepted||0,
        rejected:parsed?.rejected||0,
        fixed:parsed?.fixed||0,
        warnings:parsed?.warnings||[],
        p99:Math.floor(Math.random()*200+100),
        first_seen:"2025-01-01",
        last_seen:"2026-04-13",
      });
      setImporting(false);
      setStep(4);
    },1200);
  },[importType,config,parsed]);

  const generateSampleCSV = (type)=>{
    if(!type) return "";
    const h=type.headers.join(',');
    const rows=type.id==="box_history"
      ?["742,{2,4,7},48,2026-04-10,3","319,{1,3,9},31,2026-04-08,5","506,{0,5,6},27,2026-04-11,2"]
      :type.id==="pair_history"
      ?["42,18,2026-04-10,3","13,22,2026-04-08,5","19,15,2026-04-11,2"]
      :type.id==="ledger"
      ?["NY,Pick3,2026-04-13,midday,742","FL,Pick3,2026-04-13,midday,319","OH,Pick3,2026-04-13,midday,506"]
      :["742,{2,4,7},48,2026-04-13,0","319,{1,3,9},31,2026-04-13,0"];
    return h+'\n'+rows.join('\n');
  };

  const steps=[
    {label:"Type",done:step>0},
    {label:"Configure",done:step>1},
    {label:"Upload",done:step>2},
    {label:"Review",done:step>3},
    {label:"Done",done:step>4},
  ];

  // Step 0: Select import type
  const Step0 = ()=>React.createElement("div",{style:{padding:"24px"}},
    [React.createElement("h2",{key:"t",style:{fontSize:18,fontWeight:800,color:C.ink,marginBottom:4}},"Select Import Type"),
     React.createElement("p",{key:"s",style:{fontSize:12,color:C.inkSec,marginBottom:20}},"What type of data are you importing?"),
     React.createElement("div",{key:"grid",style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}},
       IMPORT_TYPES.map(t=>React.createElement(Card,{key:t.id,onClick:()=>{setImportType(t.id);setStep(1);},
         style:{padding:"18px",border:"2px solid "+(importType===t.id?t.color:C.border),
           background:importType===t.id?t.color+"08":C.bgCard,cursor:"pointer"}},
         [React.createElement("div",{key:"i",style:{fontSize:28,marginBottom:8}},t.icon),
          React.createElement("div",{key:"l",style:{fontSize:14,fontWeight:700,color:C.ink,marginBottom:4}},t.label),
          React.createElement("div",{key:"d",style:{fontSize:11,color:C.inkSec,lineHeight:1.5,whiteSpace:"pre-line"}},t.desc),
          React.createElement("div",{key:"h",style:{marginTop:8,display:"flex",gap:4,flexWrap:"wrap"}},
            t.headers.map(h=>React.createElement(Pill,{key:h,label:h,color:t.color,xs:true})))])))]
  );

  // Step 1: Configure
  const Step1 = ()=>React.createElement("div",{style:{padding:"24px",maxWidth:520}},
    [React.createElement("h2",{key:"t",style:{fontSize:18,fontWeight:800,color:C.ink,marginBottom:4}},"Configure Import"),
     React.createElement("p",{key:"s",style:{fontSize:12,color:C.inkSec,marginBottom:20}},
       "Set scope, horizon, and class for this import."),

     // Scope
     React.createElement("div",{key:"scope",style:{marginBottom:16}},
       [React.createElement("label",{key:"l",style:{fontSize:11,fontWeight:700,color:C.inkTer,letterSpacing:1,display:"block",marginBottom:6}},"SCOPE"),
        React.createElement("div",{key:"opts",style:{display:"flex",gap:6}},
          [{id:"midday",l:"☀️ Midday"},{id:"evening",l:"🌙 Evening"},{id:"allday",l:"◈ All Day"}].map(o=>{
            const on=config.scope===o.id;
            return React.createElement("button",{key:o.id,onClick:()=>setConfig(c=>({...c,scope:o.id})),
              style:{padding:"8px 14px",borderRadius:9,cursor:"pointer",fontFamily:F,fontSize:12,fontWeight:on?700:500,transition:"all .15s",
                border:"1.5px solid "+(on?C.primary:C.border),background:on?C.primaryL:"transparent",color:on?C.primary:C.inkSec}},o.l);
          }))]),

     // Horizon (only for history imports)
     (importType==="box_history"||importType==="pair_history")&&React.createElement("div",{key:"horizon",style:{marginBottom:16}},
       [React.createElement("label",{key:"l",style:{fontSize:11,fontWeight:700,color:C.inkTer,letterSpacing:1,display:"block",marginBottom:6}},"HORIZON (Year Depth)"),
        React.createElement("div",{key:"opts",style:{display:"flex",gap:6,flexWrap:"wrap"}},
          HORIZONS.map(h=>{
            const on=config.horizon===h;
            return React.createElement("button",{key:h,onClick:()=>setConfig(c=>({...c,horizon:h})),
              style:{padding:"6px 12px",borderRadius:8,cursor:"pointer",fontFamily:M,fontSize:11,fontWeight:on?700:500,transition:"all .15s",
                border:"1.5px solid "+(on?C.primary:C.border),background:on?C.primaryL:"transparent",color:on?C.primary:C.inkSec}},h);
          }))]),

     // Pair class (only for pair_history)
     importType==="pair_history"&&React.createElement("div",{key:"class",style:{marginBottom:16}},
       [React.createElement("label",{key:"l",style:{fontSize:11,fontWeight:700,color:C.inkTer,letterSpacing:1,display:"block",marginBottom:6}},"PAIR CLASS"),
        React.createElement("select",{key:"sel",value:config.class_id,
          onChange:e=>setConfig(c=>({...c,class_id:parseInt(e.target.value)})),
          style:{width:"100%",padding:"9px 12px",borderRadius:9,border:"1px solid "+C.border,fontFamily:F,fontSize:13,color:C.ink,background:C.bgCard,cursor:"pointer"}},
          PAIR_CLASSES.map(pc=>React.createElement("option",{key:pc.id,value:pc.id},"Class "+pc.id+" — "+pc.label)))]),

     React.createElement("div",{key:"summary",style:{padding:"12px 16px",borderRadius:12,background:C.bgMuted,border:"1px solid "+C.border,marginBottom:20}},
       [React.createElement("div",{key:"t",style:{fontSize:11,fontWeight:700,color:C.ink,marginBottom:4}},"Import will create:"),
        React.createElement("div",{key:"d",style:{fontSize:12,color:C.inkSec,fontFamily:M}},
          (importType==="box_history"?"Box Class (1)":(importType==="pair_history"?"Pair Class ("+config.class_id+")":""))+(config.horizon?" · "+config.horizon:"")+" · Scope: "+config.scope)]),

     React.createElement("div",{key:"btns",style:{display:"flex",gap:10}},
       [React.createElement(Btn,{key:"next",v:"primary",onClick:()=>setStep(2)},"Continue →"),
        React.createElement(Btn,{key:"back",v:"ghost",onClick:()=>setStep(0)},"← Back")])]);

  // Step 2: Upload
  const Step2 = ()=>React.createElement("div",{style:{padding:"24px",maxWidth:600}},
    [React.createElement("h2",{key:"t",style:{fontSize:18,fontWeight:800,color:C.ink,marginBottom:4}},"Upload CSV"),
     React.createElement("p",{key:"s",style:{fontSize:12,color:C.inkSec,marginBottom:8}},
       "Paste your CSV data or upload a file. Required columns: "+typeInfo?.headers.join(", ")),

     // Headers reference
     React.createElement("div",{key:"headers",style:{display:"flex",gap:5,flexWrap:"wrap",marginBottom:12}},
       (typeInfo?.headers||[]).map(h=>React.createElement(Pill,{key:h,label:h,color:C.primary,xs:true}))),

     // CSV textarea
     React.createElement("textarea",{key:"csv",value:csvText,onChange:e=>setCsvText(e.target.value),
       placeholder:"Paste CSV here, or click 'Load Sample' to try with sample data...",
       style:{width:"100%",height:180,padding:"12px",borderRadius:11,border:"1.5px solid "+(csvText?C.primary:C.border),
         fontFamily:M,fontSize:11,color:C.ink,background:C.bgCard,resize:"vertical",outline:"none",lineHeight:1.6,boxSizing:"border-box"}}),

     React.createElement("div",{key:"btns",style:{display:"flex",gap:8,marginTop:12}},
       [React.createElement(Btn,{key:"validate",v:"primary",onClick:handleValidate,disabled:validating},
          validating?"⏳ Validating…":"Validate & Preview →"),
        React.createElement(Btn,{key:"sample",v:"ghost",onClick:()=>setCsvText(generateSampleCSV(typeInfo))},"Load Sample"),
        React.createElement(Btn,{key:"back",v:"ghost",onClick:()=>setStep(1)},"← Back")])]);

  // Step 3: Review
  const Step3 = ()=>React.createElement("div",{style:{padding:"24px",maxWidth:640}},
    [React.createElement("h2",{key:"t",style:{fontSize:18,fontWeight:800,color:C.ink,marginBottom:16}},"Review & Commit"),

     // Summary stats
     React.createElement("div",{key:"stats",style:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}},
       [{l:"Accepted",v:parsed?.accepted||0,c:C.green},{l:"Rejected",v:parsed?.rejected||0,c:C.red},
        {l:"Auto-Fixed",v:parsed?.fixed||0,c:C.gold},{l:"Total Rows",v:parsed?.totalRows||0,c:C.primary}
       ].map(s=>React.createElement(Card,{key:s.l,style:{padding:"12px",textAlign:"center"}},
         [React.createElement("div",{key:"v",style:{fontSize:22,fontWeight:900,color:s.c,fontFamily:M,marginBottom:2}},s.v),
          React.createElement("div",{key:"l",style:{fontSize:10,color:C.inkTer,fontWeight:700}},s.l)]))),

     // Auto-fixes
     parsed?.fixes?.length>0&&React.createElement(Card,{key:"fixes",style:{padding:"14px 16px",marginBottom:12,background:"#FFFBEB",border:"1px solid "+C.gold+"44"}},
       [React.createElement("div",{key:"t",style:{fontSize:11,fontWeight:700,color:C.gold,marginBottom:6}},"⚡ Auto-fixes applied"),
        ...parsed.fixes.map((f,i)=>React.createElement("div",{key:i,style:{fontSize:11,color:C.inkSec,padding:"2px 0",fontFamily:M}},f))]),

     // Warnings
     parsed?.warnings?.length>0&&React.createElement(Card,{key:"warns",style:{padding:"14px 16px",marginBottom:12,background:C.orangeL,border:"1px solid "+C.orange+"44"}},
       [React.createElement("div",{key:"t",style:{fontSize:11,fontWeight:700,color:C.orange,marginBottom:6}},"⚠️ Warnings"),
        ...parsed.warnings.map((w,i)=>React.createElement("div",{key:i,style:{fontSize:11,color:C.inkSec,padding:"2px 0",fontFamily:M}},w))]),

     // Errors
     parsed?.errors?.length>0&&React.createElement(Card,{key:"errs",style:{padding:"14px 16px",marginBottom:12,background:C.redL,border:"1px solid "+C.red+"44"}},
       [React.createElement("div",{key:"t",style:{fontSize:11,fontWeight:700,color:C.red,marginBottom:6}},"✗ Errors (rows rejected)"),
        ...parsed.errors.map((e,i)=>React.createElement("div",{key:i,style:{fontSize:11,color:C.inkSec,padding:"2px 0",fontFamily:M}},e))]),

     // Sample rows preview
     parsed?.sampleRows?.length>0&&React.createElement("div",{key:"preview",style:{marginBottom:16}},
       [React.createElement("div",{key:"t",style:{fontSize:11,fontWeight:700,color:C.inkTer,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}},"Sample (first 5 rows)"),
        React.createElement("div",{key:"table",style:{overflowX:"auto",borderRadius:11,border:"1px solid "+C.border}},
          React.createElement("table",{style:{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:M}},
            [React.createElement("thead",{key:"h"},
               React.createElement("tr",null,
                 parsed.headers.map(h=>React.createElement("th",{key:h,style:{padding:"8px 10px",background:C.bgMuted,color:C.inkTer,fontWeight:700,textAlign:"left",borderBottom:"1px solid "+C.border}},h)))),
             React.createElement("tbody",{key:"b"},
               parsed.sampleRows.map((row,i)=>
                 React.createElement("tr",{key:i,style:{borderBottom:"1px solid "+C.border+"88"}},
                   parsed.headers.map(h=>React.createElement("td",{key:h,style:{padding:"7px 10px",color:C.ink}},row[h]||"—")))))]))]),

     // Import config summary
     React.createElement(Card,{key:"cfg",style:{padding:"14px 16px",marginBottom:16,background:C.primaryL,border:"1px solid "+C.primary+"28"}},
       [React.createElement("div",{key:"t",style:{fontSize:11,fontWeight:700,color:C.primary,marginBottom:6}},"Import Configuration"),
        React.createElement("div",{key:"d",style:{fontSize:12,color:C.inkSec,fontFamily:M}},
          "Type: "+importType+" · Scope: "+config.scope+(config.horizon?" · Horizon: "+config.horizon:"")+(importType==="pair_history"?" · Class: "+config.class_id:""))]),

     React.createElement("div",{key:"btns",style:{display:"flex",gap:10}},
       [React.createElement(Btn,{key:"commit",v:"primary",onClick:handleCommit,disabled:importing||parsed?.accepted===0},
          importing?"⏳ Committing…":"✓ Commit Import"),
        React.createElement(Btn,{key:"back",v:"ghost",onClick:()=>setStep(2)},"← Back")])]);

  // Step 4: Result / ImportSummary
  const Step4 = ()=>React.createElement("div",{style:{padding:"24px",maxWidth:520}},
    [React.createElement("div",{key:"hero",style:{textAlign:"center",marginBottom:24}},
       [React.createElement("div",{key:"i",style:{fontSize:48,marginBottom:8}},"✅"),
        React.createElement("h2",{key:"t",style:{fontSize:20,fontWeight:800,color:C.green,marginBottom:4}},"Import Committed"),
        React.createElement("div",{key:"id",style:{fontSize:11,color:C.inkTer,fontFamily:M}},"ID: "+result?.id)]),

     React.createElement("div",{key:"stats",style:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}},
       [{l:"Accepted",v:result?.accepted,c:C.green},{l:"Rejected",v:result?.rejected,c:C.red},{l:"Auto-Fixed",v:result?.fixed,c:C.gold}]
         .map(s=>React.createElement(Card,{key:s.l,style:{padding:"12px",textAlign:"center"}},
           [React.createElement("div",{key:"v",style:{fontSize:22,fontWeight:900,color:s.c,fontFamily:M}},s.v),
            React.createElement("div",{key:"l",style:{fontSize:10,color:C.inkTer,fontWeight:700}},s.l)]))),

     React.createElement(Card,{key:"meta",style:{padding:"16px",marginBottom:16}},
       [React.createElement("div",{key:"t",style:{fontSize:11,fontWeight:700,color:C.inkTer,letterSpacing:1,marginBottom:10,textTransform:"uppercase"}},"Import Summary"),
        ...[
          ["Type", result?.type],
          ["Scope", result?.scope],
          result?.horizon&&["Horizon", result?.horizon],
          result?.class_id&&["Class", "Pair Class "+result?.class_id],
          result?.p99&&["P99 Cap", result?.p99+" DrawsSince"],
          result?.first_seen&&["First Seen", result?.first_seen],
          result?.last_seen&&["Last Seen", result?.last_seen],
        ].filter(Boolean).map(([k,v])=>
          React.createElement("div",{key:k,style:{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid "+C.border+"66"}},
            [React.createElement("span",{key:"k",style:{fontSize:12,color:C.inkTer}},k),
             React.createElement("span",{key:"v",style:{fontSize:12,color:C.ink,fontFamily:M,fontWeight:600}},v)]))]),

     result?.warnings?.length>0&&React.createElement(Card,{key:"warns",style:{padding:"14px",marginBottom:16,background:C.goldL,border:"1px solid "+C.gold+"44"}},
       [React.createElement("div",{key:"t",style:{fontSize:11,fontWeight:700,color:C.gold,marginBottom:6}},"Warnings"),
        ...result.warnings.map((w,i)=>React.createElement("div",{key:i,style:{fontSize:11,color:C.inkSec}},w))]),

     React.createElement(Card,{key:"next",style:{padding:"14px 16px",background:C.greenL,border:"1px solid "+C.green+"33",marginBottom:16}},
       [React.createElement("div",{key:"t",style:{fontSize:12,fontWeight:700,color:C.green,marginBottom:4}},"✓ Server hooks triggered"),
        React.createElement("div",{key:"d",style:{fontSize:11,color:C.inkSec}},"P99 caps computed · Percentile maps updated · Horizon blends refreshed · Slate regeneration queued")]),

     React.createElement("div",{key:"btns",style:{display:"flex",gap:10}},
       [React.createElement(Btn,{key:"new",v:"primary",onClick:()=>{setStep(0);setImportType(null);setParsed(null);setCsvText("");setResult(null);}},"Import Another"),
        React.createElement(Btn,{key:"hist",v:"ghost",onClick:()=>onDone&&onDone("history")},"View Import History"),
        React.createElement(Btn,{key:"back",v:"ghost",onClick:()=>onBack&&onBack()},"← Dashboard")])]);

  return React.createElement("div",{style:{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}},
    [// Wizard header
     React.createElement("div",{key:"hdr",style:{background:C.bgCard,borderBottom:"1px solid "+C.border,padding:"14px 24px",display:"flex",alignItems:"center",gap:16}},
       [React.createElement("button",{key:"back",onClick:onBack,style:{background:"none",border:"none",cursor:"pointer",fontSize:16,color:C.inkSec,padding:0}},"←"),
        React.createElement("div",{key:"title"},
          [React.createElement("div",{key:"t",style:{fontSize:15,fontWeight:800,color:C.ink}},
             (importType?typeInfo?.icon+" "+typeInfo?.label+" Import":"Import Wizard")),
           React.createElement("div",{key:"s",style:{fontSize:11,color:C.inkTer}},"Creator Access · Data Pipeline")]),
        // Step indicator
        React.createElement("div",{key:"steps",style:{display:"flex",gap:4,marginLeft:"auto",alignItems:"center"}},
          steps.map((s,i)=>React.createElement(React.Fragment,{key:i},
            [React.createElement("div",{key:"dot",style:{
               width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,
               background:s.done?C.green:i===step?C.primary:C.bgMuted,
               color:s.done||i===step?"#fff":C.inkTer,
               border:"2px solid "+(s.done?C.green:i===step?C.primary:C.border)
             }},s.done?"✓":(i+1)),
             i<steps.length-1&&React.createElement("div",{key:"line",style:{width:12,height:2,background:s.done?C.green:C.border}})
            ])))]),

     React.createElement("div",{key:"body",style:{flex:1,overflowY:"auto"}},
       step===0?React.createElement(Step0,{key:"s0"}):
       step===1?React.createElement(Step1,{key:"s1"}):
       step===2?React.createElement(Step2,{key:"s2"}):
       step===3?React.createElement(Step3,{key:"s3"}):
       React.createElement(Step4,{key:"s4"}))]);
}

// ── Import History ────────────────────────────────────────────────────────────
function ImportHistory({onBack}){
  const[imports,setImports]=useState(MOCK_IMPORTS);
  const[selected,setSelected]=useState(null);
  const[typeFilter,setTypeFilter]=useState("all");

  const filtered=imports.filter(i=>typeFilter==="all"||i.type===typeFilter);
  const selItem=imports.find(i=>i.id===selected);

  const softDelete=id=>setImports(list=>list.map(i=>i.id===id?{...i,status:"deleted"}:i));
  const undoDelete=id=>setImports(list=>list.map(i=>i.id===id?{...i,status:"completed"}:i));

  const statusColor=s=>s==="completed"?C.green:s==="failed"?C.red:s==="deleted"?C.inkTer:C.gold;

  return React.createElement("div",{style:{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}},
    [React.createElement("div",{key:"hdr",style:{background:C.bgCard,borderBottom:"1px solid "+C.border,padding:"14px 24px",display:"flex",alignItems:"center",gap:12}},
       [React.createElement("button",{key:"back",onClick:onBack,style:{background:"none",border:"none",cursor:"pointer",fontSize:16,color:C.inkSec}},"←"),
        React.createElement("div",{key:"t",style:{fontSize:15,fontWeight:800,color:C.ink}},"Import History"),
        React.createElement("div",{key:"filters",style:{display:"flex",gap:4,marginLeft:"auto"}},
          [{id:"all",l:"All"},{id:"box_history",l:"Box"},{id:"pair_history",l:"Pairs"},{id:"daily_input",l:"Daily"},{id:"ledger",l:"Ledger"}].map(f=>{
            const on=typeFilter===f.id;
            return React.createElement("button",{key:f.id,onClick:()=>setTypeFilter(f.id),
              style:{padding:"4px 10px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:F,fontSize:11,fontWeight:on?700:500,
                background:on?C.primary:"transparent",color:on?"#fff":C.inkSec,transition:"all .13s"}},f.l);
          }))]),

     React.createElement("div",{key:"content",style:{flex:1,display:"flex",overflow:"hidden"}},
       [// List
        React.createElement("div",{key:"list",style:{width:380,borderRight:"1px solid "+C.border,overflowY:"auto",background:C.bgCard}},
          filtered.map(imp=>{
            const isSel=selected===imp.id;
            return React.createElement("div",{key:imp.id,onClick:()=>setSelected(isSel?null:imp.id),
              style:{padding:"12px 16px",borderBottom:"1px solid "+C.border,cursor:"pointer",transition:"background .13s",
                background:isSel?C.primaryL:"transparent"}},
              [React.createElement("div",{key:"row",style:{display:"flex",alignItems:"center",gap:10}},
                 [React.createElement("div",{key:"icon",style:{fontSize:18}},IMPORT_TYPES.find(t=>t.id===imp.type)?.icon||"📦"),
                  React.createElement("div",{key:"info",style:{flex:1}},
                    [React.createElement("div",{key:"t",style:{fontSize:12,fontWeight:700,color:isSel?C.primary:C.ink}},
                       imp.type+(imp.horizon?" · "+imp.horizon:"")+(imp.class_id?" · Class "+imp.class_id:"")),
                     React.createElement("div",{key:"m",style:{fontSize:10,color:C.inkTer}},
                       imp.scope+" · "+new Date(imp.created_at).toLocaleString())]),
                  React.createElement("div",{key:"status"},
                    [React.createElement(Pill,{key:"s",label:imp.status,color:statusColor(imp.status),xs:true}),
                     imp.warnings?.length>0&&React.createElement("div",{key:"w",style:{fontSize:9,color:C.gold,marginTop:2}},imp.warnings.length+" warning"+( imp.warnings.length>1?"s":""))])]),
               React.createElement("div",{key:"counts",style:{display:"flex",gap:12,marginTop:6,fontSize:10,color:C.inkTer}},
                 [React.createElement("span",{key:"a",style:{color:C.green}},"✓ "+imp.accepted+" accepted"),
                  React.createElement("span",{key:"r",style:{color:C.red}},"✗ "+imp.rejected+" rejected"),
                  imp.fixed>0&&React.createElement("span",{key:"f",style:{color:C.gold}},"⚡ "+imp.fixed+" fixed")])]);
          })),

        // Detail panel
        selItem
          ? React.createElement("div",{key:"detail",style:{flex:1,overflowY:"auto",padding:"20px"}},
              [React.createElement("div",{key:"hdr",style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}},
                 [React.createElement("div",{key:"t",style:{fontSize:16,fontWeight:800,color:C.ink}},
                    IMPORT_TYPES.find(t=>t.id===selItem.type)?.label+" Import"),
                  React.createElement("div",{key:"actions",style:{display:"flex",gap:8}},
                    selItem.status==="deleted"
                      ? React.createElement(Btn,{key:"undo",v:"success",sm:true,onClick:()=>undoDelete(selItem.id)},"↺ Undo Delete")
                      : React.createElement(Btn,{key:"del",v:"danger",sm:true,onClick:()=>softDelete(selItem.id)},"🗑 Soft Delete"))]),
               React.createElement(Card,{key:"meta",style:{padding:"16px",marginBottom:14}},
                 [React.createElement("div",{key:"t",style:{fontSize:10,fontWeight:800,color:C.inkTer,letterSpacing:1,marginBottom:10,textTransform:"uppercase"}},"Import Details"),
                  ...[
                    ["ID", selItem.id],
                    ["Type", selItem.type],
                    ["Scope", selItem.scope],
                    selItem.horizon&&["Horizon", selItem.horizon],
                    selItem.class_id&&["Class ID", selItem.class_id],
                    ["Status", selItem.status],
                    ["Created", new Date(selItem.created_at).toLocaleString()],
                    selItem.p99&&["P99 Cap", selItem.p99+" DrawsSince"],
                    selItem.first_seen&&["First Seen", selItem.first_seen],
                    selItem.last_seen&&["Last Seen", selItem.last_seen],
                  ].filter(Boolean).map(([k,v])=>
                    React.createElement("div",{key:k,style:{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid "+C.border+"66"}},
                      [React.createElement("span",{key:"k",style:{fontSize:12,color:C.inkTer}},k),
                       React.createElement("span",{key:"v",style:{fontSize:12,color:C.ink,fontFamily:M,fontWeight:600}},String(v))]))]),
               React.createElement(Card,{key:"stats",style:{padding:"14px",marginBottom:14}},
                 [React.createElement("div",{key:"t",style:{fontSize:10,fontWeight:800,color:C.inkTer,letterSpacing:1,marginBottom:10,textTransform:"uppercase"}},"Row Counts"),
                  React.createElement("div",{key:"g",style:{display:"flex",gap:16}},
                    [{l:"Accepted",v:selItem.accepted,c:C.green},{l:"Rejected",v:selItem.rejected,c:C.red},{l:"Fixed",v:selItem.fixed,c:C.gold}]
                      .map(s=>React.createElement("div",{key:s.l,style:{textAlign:"center"}},
                        [React.createElement("div",{key:"v",style:{fontSize:20,fontWeight:900,color:s.c,fontFamily:M}},s.v),
                         React.createElement("div",{key:"l",style:{fontSize:10,color:C.inkTer}},s.l)])))]),
               selItem.warnings?.length>0&&React.createElement(Card,{key:"warns",style:{padding:"14px",background:C.goldL,border:"1px solid "+C.gold+"33"}},
                 [React.createElement("div",{key:"t",style:{fontSize:11,fontWeight:700,color:C.gold,marginBottom:6}},"Warnings"),
                  ...selItem.warnings.map((w,i)=>React.createElement("div",{key:i,style:{fontSize:11,color:C.inkSec,fontFamily:M,padding:"2px 0"}},w))])])
          : React.createElement("div",{key:"empty",style:{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:C.inkTer,fontSize:13,padding:40}},
              "← Select an import to view details")])]);
}

// ── Horizon Coverage Matrix ───────────────────────────────────────────────────
function HorizonMatrix(){
  const classes=[
    {id:1,label:"Box",type:"box"},
    ...PAIR_CLASSES.map(p=>({...p,type:"pair"}))
  ];
  // Mock coverage data
  const coverage={};
  classes.forEach((cls,ci)=>{
    coverage[cls.id]={};
    HORIZONS.forEach((h,hi)=>{
      coverage[cls.id][h]=hi<(ci===0?4:ci<4?3:ci<8?2:1);
    });
  });

  return React.createElement("div",{style:{padding:"20px",overflowX:"auto"}},
    [React.createElement("div",{key:"t",style:{fontSize:15,fontWeight:800,color:C.ink,marginBottom:4}},"Horizon Coverage Matrix"),
     React.createElement("p",{key:"s",style:{fontSize:12,color:C.inkSec,marginBottom:16}},"✓ = data present · ⌛ = missing — click a gap to import · K6 requires H01Y for all 11 classes"),
     React.createElement("div",{key:"wrap",style:{overflowX:"auto",borderRadius:12,border:"1px solid "+C.border}},
       React.createElement("table",{style:{borderCollapse:"collapse",width:"100%",minWidth:700}},
         [React.createElement("thead",{key:"head"},
            React.createElement("tr",{style:{background:C.bgMuted}},
              [React.createElement("th",{key:"cls",style:{padding:"10px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:C.inkTer,borderBottom:"1px solid "+C.border}},"CLASS"),
               ...HORIZONS.map(h=>React.createElement("th",{key:h,style:{padding:"10px 8px",textAlign:"center",fontSize:10,fontWeight:700,color:C.inkTer,borderBottom:"1px solid "+C.border,letterSpacing:.5}},h))])),
          React.createElement("tbody",{key:"body"},
            classes.map((cls,ci)=>
              React.createElement("tr",{key:cls.id,style:{background:ci%2===0?C.bgCard:C.bg}},
                [React.createElement("td",{key:"cls",style:{padding:"9px 12px",fontSize:11,fontWeight:600,color:C.inkSec,borderBottom:"1px solid "+C.border+"66",whiteSpace:"nowrap"}},
                   [React.createElement("span",{key:"badge",style:{fontSize:9,background:cls.type==="box"?C.primaryL:C.purpleL,color:cls.type==="box"?C.primary:C.purple,padding:"1px 5px",borderRadius:4,fontWeight:700,marginRight:6}},cls.type==="box"?"BOX":"PAIR"),
                    (cls.label||("Class "+cls.id))]),
                 ...HORIZONS.map(h=>{
                   const ok=coverage[cls.id]?.[h];
                   return React.createElement("td",{key:h,
                     onClick:ok?undefined:()=>alert("Opening Import Wizard: "+cls.label+" / "+h),
                     style:{padding:"8px",textAlign:"center",borderBottom:"1px solid "+C.border+"66",cursor:ok?"default":"pointer"}},
                     React.createElement("span",{style:{
                       fontSize:11,display:"inline-flex",width:22,height:22,borderRadius:6,
                       alignItems:"center",justifyContent:"center",
                       background:ok?C.greenL:C.bgMuted,color:ok?C.green:C.inkTer,
                       border:"1px solid "+(ok?C.green+"33":C.border),
                       cursor:ok?"default":"pointer",transition:"all .13s"
                     }},ok?"✓":"⌛"));
                 })])
            ))]))]);
}

// ── Snapshot Health ───────────────────────────────────────────────────────────
function SnapshotHealth(){
  const[tests,setTests]=useState({conn:{s:"idle",msg:"Ready",ms:null},snap:{s:"idle",msg:"Ready",hash:null},regen:{s:"idle",msg:"Ready",hash:null},imports:{s:"idle",msg:"Ready"}});
  const[running,setRunning]=useState(false);
  const run=(k,delay,result)=>{
    setTests(t=>({...t,[k]:{s:"running",msg:"Testing…"}}));
    setTimeout(()=>setTests(t=>({...t,[k]:result})),delay);
  };
  const runAll=()=>{
    setRunning(true);
    run("conn",700,{s:"success",msg:"Connected · Supabase healthy",ms:38});
    setTimeout(()=>run("snap",600,{s:"success",msg:"Snapshots readable · 3 scopes",hash:"A3F9C2"}),800);
    setTimeout(()=>run("regen",800,{s:"success",msg:"Determinism check passed",hash:"A3F9C2"}),1500);
    setTimeout(()=>{run("imports",500,{s:"success",msg:"7 imports · 1 failed"});setRunning(false);},2400);
  };
  const dotColor=s=>s==="success"?C.green:s==="error"?C.red:s==="running"?C.gold:C.inkTer;
  const SUITE=[{k:"conn",l:"Connection Test",h:"Ping Supabase endpoint"},{k:"snap",l:"Snapshot Read",h:"Fetch latest slate snapshots"},{k:"regen",l:"Determinism Check",h:"Re-run engine, compare hash"},{k:"imports",l:"Import Health",h:"Check recent import statuses"}];
  return React.createElement("div",{style:{padding:"20px",maxWidth:640}},
    [React.createElement("div",{key:"hdr",style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}},
       [React.createElement("div",{key:"t",style:{fontSize:15,fontWeight:800,color:C.ink}},"Backend Health"),
        React.createElement("div",{key:"btns",style:{display:"flex",gap:8}},
          [React.createElement(Btn,{key:"all",v:"primary",sm:true,onClick:runAll,disabled:running},running?"⏳ Running…":"▶ Run All"),
           React.createElement(Btn,{key:"copy",v:"ghost",sm:true,onClick:()=>alert("Diagnostics copied")},"📋 Copy")])]),
     ...SUITE.map(t=>React.createElement(Card,{key:t.k,style:{padding:"12px 14px",marginBottom:8,
       background:tests[t.k].s==="success"?C.greenL:tests[t.k].s==="error"?C.redL:tests[t.k].s==="running"?C.goldL:C.bgMuted,
       border:"1px solid "+(tests[t.k].s==="success"?C.green+"33":tests[t.k].s==="error"?C.red+"33":tests[t.k].s==="running"?C.gold+"33":C.border)}},
       React.createElement("div",{style:{display:"flex",alignItems:"center",gap:10}},
         [React.createElement("span",{key:"dot",style:{width:8,height:8,borderRadius:"50%",background:dotColor(tests[t.k].s),flexShrink:0}}),
          React.createElement("div",{key:"info",style:{flex:1}},
            [React.createElement("div",{key:"l",style:{fontSize:12,fontWeight:700,color:C.ink}},t.l),
             React.createElement("div",{key:"m",style:{fontSize:10,color:C.inkTer}},tests[t.k].msg||t.h)]),
          tests[t.k].ms&&React.createElement("code",{key:"ms",style:{fontSize:10,color:C.green,fontFamily:M}},tests[t.k].ms+"ms"),
          tests[t.k].hash&&React.createElement("code",{key:"h",style:{fontSize:10,color:C.primary,fontFamily:M}},"hash …"+tests[t.k].hash),
          React.createElement(Btn,{key:"run",v:"ghost",sm:true,onClick:()=>run(t.k,700,{s:"success",msg:t.l+" OK",ms:Math.floor(Math.random()*60+20)})},"Run")]))),
     React.createElement("div",{key:"note",style:{marginTop:12,fontSize:10,color:C.inkTer,fontFamily:M,padding:"10px 14px",background:C.bgMuted,borderRadius:10}},
       "Endpoint: tgagarhwqbdcwoqhpapi.supabase.co · ZK6 Engine v2 · 76 draws")]);
}

// ── Main Creator Screen ───────────────────────────────────────────────────────
// ── Engine Configuration Panel ────────────────────────────────────────────────
function EngineConfig(){
  const[wPreset,setWPreset]=useState("balanced");
  const[customW,setCustomW]=useState({BOX:40,PBURST:40,CO:20});
  const[useCustom,setUseCustom]=useState(false);
  const[pairRepCap,setPairRepCap]=useState(2);
  const[singlesMax,setSinglesMax]=useState(4);
  const[doublesMax,setDoublesMax]=useState(2);
  const[triplesOn,setTriplesOn]=useState(false);
  const[defaultScope,setDefaultScope]=useState("midday");
  const[confAdjust,setConfAdjust]=useState(true);
  const[burstSignal,setBurstSignal]=useState(true);
  const[saved,setSaved]=useState(false);

  const totalW=customW.BOX+customW.PBURST+customW.CO;
  const wValid=Math.abs(totalW-100)<1;

  const SliderRow=({label,value,min,max,onChange,color,note})=>
    React.createElement("div",{style:{marginBottom:14}},
      [React.createElement("div",{key:"hdr",style:{display:"flex",justifyContent:"space-between",marginBottom:5}},
         [React.createElement("div",{key:"l"},
            [React.createElement("span",{key:"t",style:{fontSize:12,fontWeight:600,color:C.ink}},label),
             note&&React.createElement("div",{key:"n",style:{fontSize:10,color:C.inkTer}},note)]),
          React.createElement("span",{key:"v",style:{fontSize:14,fontWeight:900,color:color||C.primary,fontFamily:M}},value)]),
       React.createElement("input",{key:"inp",type:"range",min,max,value,
         onChange:e=>onChange(Number(e.target.value)),
         style:{width:"100%",accentColor:color||C.primary,cursor:"pointer"}})]);

  const ToggleRow=({icon,label,sub,on,onChange})=>
    React.createElement("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid "+C.border}},
      [React.createElement("div",{key:"l",style:{display:"flex",gap:10,alignItems:"center"}},
         [React.createElement("span",{key:"i",style:{fontSize:15}},icon),
          React.createElement("div",{key:"txt"},
            [React.createElement("div",{key:"l",style:{fontSize:12,fontWeight:600,color:C.ink}},label),
             sub&&React.createElement("div",{key:"s",style:{fontSize:10,color:C.inkTer}},sub)])]),
       React.createElement("button",{key:"tog",onClick:()=>onChange(!on),
         style:{width:42,height:22,borderRadius:11,background:on?C.primary:C.bgMutedD,border:"none",
           cursor:"pointer",transition:"background .2s",position:"relative",flexShrink:0}},
         React.createElement("div",{style:{width:16,height:16,borderRadius:"50%",background:"#fff",
           position:"absolute",top:3,left:on?23:3,transition:"left .2s",boxShadow:"0 1px 4px #1E1B4B22"}}))]);

  return React.createElement("div",{style:{flex:1,overflowY:"auto",padding:"24px",maxWidth:620}},
    [React.createElement("div",{key:"hdr",style:{marginBottom:22}},
       [React.createElement("h2",{key:"t",style:{fontSize:18,fontWeight:800,color:C.ink,marginBottom:4}},"⚙️ ZK6 Engine Configuration"),
        React.createElement("p",{key:"s",style:{fontSize:12,color:C.inkSec,margin:0}},"Proprietary settings — creator access only. Changes apply to the next slate generation.")]),

     // Weight presets
     React.createElement(SecTitle,{key:"w-t"},"Signal Weights"),
     React.createElement(Card,{key:"weights",style:{padding:"18px 20px",marginBottom:16}},
       [React.createElement("div",{key:"presets",style:{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}},
          [React.createElement("span",{key:"lbl",style:{fontSize:9,color:C.inkTer,fontWeight:800,letterSpacing:1.5,alignSelf:"center"}},"PRESET"),
           ...Object.entries(_WTS).map(([k,v])=>{
             const on=wPreset===k&&!useCustom;
             return React.createElement("button",{key:k,onClick:()=>{setWPreset(k);setUseCustom(false);},
               style:{fontSize:11,padding:"5px 12px",borderRadius:99,fontFamily:F,fontWeight:700,cursor:"pointer",
                 border:"1.5px solid "+(on?C.primary:C.border),background:on?C.primaryL:"transparent",color:on?C.primary:C.inkSec,transition:"all .15s"}},
               k.charAt(0).toUpperCase()+k.slice(1)+" ("+Math.round(v.BOX*100)+"/"+Math.round(v.PBURST*100)+"/"+Math.round(v.CO*100)+")");
           }),
           React.createElement("button",{key:"custom",onClick:()=>setUseCustom(true),
             style:{fontSize:11,padding:"5px 12px",borderRadius:99,fontFamily:F,fontWeight:700,cursor:"pointer",
               border:"1.5px solid "+(useCustom?C.purple:C.border),background:useCustom?C.purpleL:"transparent",color:useCustom?C.purple:C.inkSec,transition:"all .15s"}},
             "Custom ✏️")]),
        useCustom&&React.createElement("div",{key:"sliders",style:{background:C.bgMuted,borderRadius:12,padding:"14px 16px",marginBottom:12}},
          [React.createElement(SliderRow,{key:"box",label:"BOX (Frequency)",value:customW.BOX,min:0,max:100,onChange:v=>setCustomW(w=>({...w,BOX:v})),color:C.primary,note:"Historical draw frequency pressure"}),
           React.createElement(SliderRow,{key:"pb",label:"PBURST (Momentum)",value:customW.PBURST,min:0,max:100,onChange:v=>setCustomW(w=>({...w,PBURST:v})),color:C.rose,note:"Pair burst probability signals"}),
           React.createElement(SliderRow,{key:"co",label:"CO (Pattern)",value:customW.CO,min:0,max:100,onChange:v=>setCustomW(w=>({...w,CO:v})),color:C.teal,note:"Co-occurrence relationship signal"}),
           React.createElement("div",{key:"sum",style:{display:"flex",justifyContent:"space-between",marginTop:6,paddingTop:6,borderTop:"1px solid "+C.border}},
             [React.createElement("span",{key:"l",style:{fontSize:11,color:C.inkTer}},"Sum must equal 100"),
              React.createElement("span",{key:"v",style:{fontSize:13,fontWeight:900,color:wValid?C.green:C.red,fontFamily:M}},totalW)])]),
        React.createElement("div",{key:"preview",style:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}},
          [{l:"BOX",v:useCustom?customW.BOX:Math.round((wPreset?_WTS[wPreset].BOX:_WTS.balanced.BOX)*100),c:C.primary},
           {l:"PBURST",v:useCustom?customW.PBURST:Math.round((wPreset?_WTS[wPreset].PBURST:_WTS.balanced.PBURST)*100),c:C.rose},
           {l:"CO",v:useCustom?customW.CO:Math.round((wPreset?_WTS[wPreset].CO:_WTS.balanced.CO)*100),c:C.teal},
          ].map(s=>React.createElement(Card,{key:s.l,style:{padding:"10px",textAlign:"center",background:C.bgMuted}},
            [React.createElement("div",{key:"l",style:{fontSize:9,color:C.inkTer,fontWeight:800,letterSpacing:1,marginBottom:3}},s.l),
             React.createElement("div",{key:"v",style:{fontSize:20,fontWeight:900,color:s.c,fontFamily:M}},s.v+"%"),
             React.createElement("div",{key:"b",style:{height:4,background:C.border,borderRadius:2,marginTop:5,overflow:"hidden"}},
               React.createElement("div",{style:{width:s.v+"%",height:"100%",background:s.c,borderRadius:2}}))])))]),

     // Rail controls
     React.createElement(SecTitle,{key:"rails-t"},"K6 Rail Controls"),
     React.createElement(Card,{key:"rails",style:{padding:"4px 18px",marginBottom:16}},
       [React.createElement(ToggleRow,{key:"conf",icon:"🏆",label:"Drawing Confidence Adjustment",sub:"Weight signals higher for states using physical ball machines (Report Card)",on:confAdjust,onChange:setConfAdjust}),
        React.createElement(ToggleRow,{key:"burst",icon:"📈",label:"Recency Burst Detection",sub:"Bonus signal for combos building extra pressure in H01Y vs historical average",on:burstSignal,onChange:setBurstSignal}),
        React.createElement(ToggleRow,{key:"trip",icon:"3️⃣",label:"Allow Triples in K6",sub:"Currently off — triples have very low historical frequency",on:triplesOn,onChange:setTriplesOn}),
        React.createElement("div",{key:"singles",style:{padding:"12px 0",borderBottom:"1px solid "+C.border}},
          [React.createElement("div",{key:"hdr",style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
             [React.createElement("div",{key:"l"},
                [React.createElement("div",{key:"t",style:{fontSize:12,fontWeight:600,color:C.ink}},"Max Singles in K6"),
                 React.createElement("div",{key:"s",style:{fontSize:10,color:C.inkTer}},"Current: "+singlesMax+" slots reserved for single-digit combos")]),
              React.createElement("span",{key:"v",style:{fontSize:14,fontWeight:900,color:C.primary,fontFamily:M}},singlesMax)]),
           React.createElement("input",{key:"inp",type:"range",min:1,max:6,value:singlesMax,onChange:e=>setSinglesMax(Number(e.target.value)),style:{width:"100%",accentColor:C.primary}})]),
        React.createElement("div",{key:"doubles",style:{padding:"12px 0",borderBottom:"1px solid "+C.border}},
          [React.createElement("div",{key:"hdr",style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
             [React.createElement("div",{key:"l"},
                [React.createElement("div",{key:"t",style:{fontSize:12,fontWeight:600,color:C.ink}},"Max Doubles in K6"),
                 React.createElement("div",{key:"s",style:{fontSize:10,color:C.inkTer}},"Current: "+doublesMax+" slots for double-digit combos")]),
              React.createElement("span",{key:"v",style:{fontSize:14,fontWeight:900,color:C.teal,fontFamily:M}},doublesMax)]),
           React.createElement("input",{key:"inp",type:"range",min:0,max:4,value:doublesMax,onChange:e=>setDoublesMax(Number(e.target.value)),style:{width:"100%",accentColor:C.teal}})]),
        React.createElement("div",{key:"pair",style:{padding:"12px 0"}},
          [React.createElement("div",{key:"hdr",style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
             [React.createElement("div",{key:"l"},
                [React.createElement("div",{key:"t",style:{fontSize:12,fontWeight:600,color:C.ink}},"Pair Repetition Cap"),
                 React.createElement("div",{key:"s",style:{fontSize:10,color:C.inkTer}},"Max picks sharing the same TopPair — ensures diversity")]),
              React.createElement("span",{key:"v",style:{fontSize:14,fontWeight:900,color:C.gold,fontFamily:M}},pairRepCap)]),
           React.createElement("input",{key:"inp",type:"range",min:1,max:4,value:pairRepCap,onChange:e=>setPairRepCap(Number(e.target.value)),style:{width:"100%",accentColor:C.gold}})])]),

     // Default scope
     React.createElement(SecTitle,{key:"scope-t"},"Default Settings"),
     React.createElement(Card,{key:"scope",style:{padding:"14px 18px",marginBottom:16}},
       [React.createElement("div",{key:"l",style:{fontSize:12,fontWeight:600,color:C.ink,marginBottom:8}},"Default Scope on App Launch"),
        React.createElement("div",{key:"opts",style:{display:"flex",gap:6}},
          [{id:"midday",l:"☀️ Midday"},{id:"evening",l:"🌙 Evening"},{id:"allday",l:"◈ All Day"}].map(o=>{
            const on=defaultScope===o.id;
            return React.createElement("button",{key:o.id,onClick:()=>setDefaultScope(o.id),
              style:{flex:1,padding:"8px",borderRadius:9,cursor:"pointer",fontFamily:F,fontSize:11,fontWeight:on?700:500,
                border:"1.5px solid "+(on?C.primary:C.border),background:on?C.primaryL:"transparent",color:on?C.primary:C.inkSec,transition:"all .15s"}},o.l);
          }))]),

     // Drawing Report Card summary
     React.createElement(SecTitle,{key:"drc-t"},"Drawing Report Card Confidence"),
     React.createElement(Card,{key:"drc",style:{padding:"14px 18px",marginBottom:16}},
       [React.createElement("div",{key:"desc",style:{fontSize:11,color:C.inkSec,marginBottom:10,lineHeight:1.6}},"ZK6 v2.1 adjusts signal confidence based on whether a state uses physical ball machines (more reliable patterns) or computerized RNG. This is applied automatically when Drawing Confidence Adjustment is ON."),
        React.createElement("div",{key:"grades",style:{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}},
          [{grade:"A+ (100%)",states:"TX, SC, PR",conf:"100%",c:C.green},
           {grade:"A (89-92%)",states:"OH, NY, CT, NJ, FL",conf:"92–97%",c:C.teal},
           {grade:"B/C (43-78%)",states:"MI, NC, PA, GA, VA",conf:"72–88%",c:C.gold},
           {grade:"D/F (<40%)",states:"IL, MO, MS, CO, WI",conf:"50–68%",c:C.red},
          ].map(g=>React.createElement("div",{key:g.grade,style:{padding:"10px 12px",borderRadius:10,background:g.c+"10",border:"1px solid "+g.c+"33"}},
            [React.createElement("div",{key:"g",style:{fontSize:10,fontWeight:800,color:g.c}},g.grade),
             React.createElement("div",{key:"s",style:{fontSize:10,color:C.inkSec,marginTop:2}},g.states),
             React.createElement("div",{key:"c",style:{fontSize:11,fontWeight:700,color:g.c,marginTop:2}},g.conf+" signal confidence")])))]),

     React.createElement("div",{key:"btns",style:{display:"flex",gap:10}},
       [React.createElement(Btn,{key:"save",v:"primary",onClick:()=>{setSaved(true);setTimeout(()=>setSaved(false),2500);}},
          saved?"✓ Saved!":"💾 Save Engine Config"),
        React.createElement(Btn,{key:"reset",v:"ghost",onClick:()=>{setWPreset("balanced");setUseCustom(false);setSinglesMax(4);setDoublesMax(2);setPairRepCap(2);setTriplesOn(false);setConfAdjust(true);setBurstSignal(true);}},
          "↺ Reset Defaults")])]);
}

// ── Nationwide Play Admin ──────────────────────────────────────────────────────
function NationwideAdmin(){
  const[url,setUrl]=useState("https://www.thelotter.com");
  const[customNote,setCustomNote]=useState("Legal lottery concierge service — buy tickets in 40+ states from home.");
  const[enabled,setEnabled]=useState(true);
  const[saved,setSaved]=useState(false);

  return React.createElement("div",{style:{flex:1,overflowY:"auto",padding:"24px",maxWidth:600}},
    [React.createElement("div",{key:"hdr",style:{marginBottom:20}},
       [React.createElement("h2",{key:"t",style:{fontSize:18,fontWeight:800,color:C.ink,marginBottom:4}},"🌎 Nationwide Play Admin"),
        React.createElement("p",{key:"s",style:{fontSize:12,color:C.inkSec,margin:0}},"Configure the secret Pro feature — legal nationwide lottery access")]),

     // What this is
     React.createElement(Card,{key:"info",style:{padding:"16px",marginBottom:16,background:C.greenL,border:"1px solid "+C.green+"33"}},
       [React.createElement("div",{key:"t",style:{fontSize:13,fontWeight:700,color:C.green,marginBottom:6}},"ℹ️ What This Feature Does"),
        React.createElement("div",{key:"d",style:{fontSize:12,color:C.inkSec,lineHeight:1.7}},
          "Pro subscribers gain access to a curated guide showing how to legally play Pick 3 across multiple US states. Third-party lottery concierge services purchase tickets on the player's behalf. You control which URL is shown to Pro users and the description message.")]),

     // Enable toggle
     React.createElement(Card,{key:"toggle",style:{padding:"14px 16px",marginBottom:16}},
       [React.createElement("div",{key:"row",style:{display:"flex",alignItems:"center",justifyContent:"space-between"}},
          [React.createElement("div",{key:"l"},
             [React.createElement("div",{key:"t",style:{fontSize:13,fontWeight:700,color:C.ink}},"Enable for Pro subscribers"),
              React.createElement("div",{key:"s",style:{fontSize:11,color:C.inkTer}},"If OFF, the Learn screen hides the nationwide play section")]),
           React.createElement("button",{key:"tog",onClick:()=>setEnabled(e=>!e),
             style:{width:42,height:22,borderRadius:11,background:enabled?C.green:C.bgMutedD,border:"none",
               cursor:"pointer",transition:"background .2s",position:"relative"}},
             React.createElement("div",{style:{width:16,height:16,borderRadius:"50%",background:"#fff",
               position:"absolute",top:3,left:enabled?23:3,transition:"left .2s"}}))])]),

     // URL config
     React.createElement(SecTitle,{key:"url-t"},"Service URL"),
     React.createElement(Card,{key:"url-card",style:{padding:"16px",marginBottom:16}},
       [React.createElement("div",{key:"l",style:{fontSize:11,fontWeight:700,color:C.inkTer,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}},"Nationwide Play URL"),
        React.createElement("input",{key:"url",value:url,onChange:e=>setUrl(e.target.value),
          style:{width:"100%",padding:"9px 12px",borderRadius:9,border:"1.5px solid "+(url?C.primary:C.border),
            fontFamily:M,fontSize:12,color:C.primary,background:C.bgCard,outline:"none",boxSizing:"border-box",marginBottom:10}}),
        React.createElement("div",{key:"note-l",style:{fontSize:11,fontWeight:700,color:C.inkTer,letterSpacing:1,marginBottom:6,textTransform:"uppercase"}},"Description shown to Pro users"),
        React.createElement("textarea",{key:"note",value:customNote,onChange:e=>setCustomNote(e.target.value),rows:3,
          style:{width:"100%",padding:"9px 12px",borderRadius:9,border:"1px solid "+C.border,
            fontFamily:F,fontSize:12,color:C.ink,background:C.bgCard,outline:"none",resize:"vertical",boxSizing:"border-box"}})]),

     // Options
     React.createElement(SecTitle,{key:"opts-t"},"Recommended Services"),
     React.createElement(Card,{key:"services",style:{padding:"0"}},
       [["TheLotter","https://www.thelotter.com","Largest multi-state lottery concierge, 40+ US states"],
        ["Jackpot.com","https://www.jackpot.com","US-focused, easy interface, multiple states"],
        ["LottoMaster","https://www.lottomaster.com","Specialty Pick 3/4 focus"]
       ].map(([name,link,desc],i,arr)=>
         React.createElement("div",{key:name,style:{padding:"12px 16px",borderBottom:i<arr.length-1?"1px solid "+C.border:"none",display:"flex",gap:12,alignItems:"center"}},
           [React.createElement("div",{key:"info",style:{flex:1}},
              [React.createElement("div",{key:"n",style:{fontSize:13,fontWeight:700,color:C.ink}},name),
               React.createElement("div",{key:"d",style:{fontSize:11,color:C.inkSec}},desc)]),
            React.createElement("button",{key:"use",onClick:()=>setUrl(link),
              style:{fontSize:11,padding:"5px 10px",borderRadius:8,border:"1px solid "+C.border,background:url===link?C.primaryL:"transparent",color:url===link?C.primary:C.inkSec,cursor:"pointer",fontFamily:F,fontWeight:url===link?700:400}},
              url===link?"✓ Selected":"Use")]))),

     React.createElement("div",{key:"btns",style:{marginTop:16,display:"flex",gap:10}},
       [React.createElement(Btn,{key:"save",v:"primary",onClick:()=>{setSaved(true);setTimeout(()=>setSaved(false),2000);}},saved?"✓ Saved!":"💾 Save Settings"),
        React.createElement(Btn,{key:"preview",v:"ghost",onClick:()=>window.open(url,"_blank")},"🔗 Preview URL")])]);
}

// ── Adaptive Learning Panel ───────────────────────────────────────────────────
function AdaptiveLearning(){
  // Mock performance data — in production this comes from tracking slate picks vs actual results
  const mockPerf={
    totalSlates:284,hitsTracked:284*6,
    boxHitRate:34.2,straightHitRate:8.1,
    signalHitRates:{BOX:38.1,PBURST:31.4,CO:29.8,BURST:41.2},
    recentTrend:{BOX:"+2.1%",PBURST:"-1.3%",CO:"+0.4%",BURST:"+3.8%"},
    suggestedWeights:{BOX:0.42,PBURST:0.38,CO:0.20},
    lastUpdated:"2026-04-13",statesAnalyzed:28
  };

  return React.createElement("div",{style:{flex:1,overflowY:"auto",padding:"24px",maxWidth:680}},
    [React.createElement("div",{key:"hdr",style:{marginBottom:20}},
       [React.createElement("h2",{key:"t",style:{fontSize:18,fontWeight:800,color:C.ink,marginBottom:4}},"🧠 Adaptive Learning System"),
        React.createElement("p",{key:"s",style:{fontSize:12,color:C.inkSec,margin:0}},"ZK6 tracks prediction accuracy and suggests weight adjustments over time")]),

     // How it works
     React.createElement(Card,{key:"how",style:{padding:"16px",marginBottom:16,background:C.primaryL,border:"1px solid "+C.primary+"28"}},
       [React.createElement("div",{key:"t",style:{fontSize:13,fontWeight:700,color:C.primary,marginBottom:8}},"How Adaptive Learning Works"),
        React.createElement("div",{key:"steps",style:{display:"flex",flexDirection:"column",gap:6}},
          ["1. Each day's K6 slate picks are recorded with their signal scores",
           "2. After the draw, actual results are matched against predictions via the Ledger",
           "3. Per-signal hit rates are calculated: which signal (BOX/PBURST/CO/BURST) best predicted hits",
           "4. A rolling Bayesian update suggests weight adjustments toward higher-performing signals",
           "5. You review and apply suggested weights in Engine Config — never automatic"
          ].map((s,i)=>React.createElement("div",{key:i,style:{display:"flex",gap:10,fontSize:12,color:C.inkSec}},
            [React.createElement("span",{key:"n",style:{color:C.primary,fontWeight:700,flexShrink:0}},s[0]+"."),
             s.slice(3)])))]),

     // Performance stats
     React.createElement(SecTitle,{key:"perf-t"},"Current Performance"),
     React.createElement("div",{key:"stats",style:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}},
       [{l:"Slates Generated",v:mockPerf.totalSlates,c:C.primary,i:"📊"},
        {l:"Box Hit Rate",v:mockPerf.boxHitRate+"%",c:C.green,i:"✓"},
        {l:"Straight Hit Rate",v:mockPerf.straightHitRate+"%",c:C.teal,i:"🎯"},
        {l:"States Analyzed",v:mockPerf.statesAnalyzed,c:C.gold,i:"🗺"}
       ].map(s=>React.createElement(Card,{key:s.l,style:{padding:"12px",textAlign:"center"}},
         [React.createElement("div",{key:"i",style:{fontSize:18,marginBottom:3}},s.i),
          React.createElement("div",{key:"v",style:{fontSize:18,fontWeight:900,color:s.c,fontFamily:M,lineHeight:1,margin:"2px 0"}},s.v),
          React.createElement("div",{key:"l",style:{fontSize:9,color:C.inkTer,fontWeight:700}},s.l)]))),

     // Signal hit rates
     React.createElement(SecTitle,{key:"sig-t"},"Signal Hit Rate Analysis"),
     React.createElement(Card,{key:"signals",style:{padding:"16px",marginBottom:16}},
       [React.createElement("div",{key:"note",style:{fontSize:11,color:C.inkSec,marginBottom:12}},"Hit rate = % of winning picks where this signal was in the top quartile. Higher = better predictor."),
        ...Object.entries(mockPerf.signalHitRates).map(([sig,rate])=>{
          const trend=mockPerf.recentTrend[sig];
          const color=sig==="BOX"?C.primary:sig==="PBURST"?C.rose:sig==="CO"?C.teal:C.gold;
          return React.createElement("div",{key:sig,style:{display:"flex",alignItems:"center",gap:12,marginBottom:12}},
            [React.createElement("span",{key:"l",style:{fontSize:11,fontWeight:700,color,width:60}},sig),
             React.createElement("div",{key:"bar",style:{flex:1,height:10,background:C.bgMuted,borderRadius:5,overflow:"hidden"}},
               React.createElement("div",{style:{width:rate+"%",height:"100%",background:color,borderRadius:5}})),
             React.createElement("span",{key:"v",style:{fontSize:12,fontWeight:800,color,fontFamily:M,width:36}},rate+"%"),
             React.createElement("span",{key:"t",style:{fontSize:11,color:trend.startsWith("+")?C.green:C.red,fontWeight:700,width:40}},trend)]);
        })]),

     // Suggested weight adjustment
     React.createElement(SecTitle,{key:"suggest-t"},"Suggested Weight Adjustment"),
     React.createElement(Card,{key:"suggest",style:{padding:"16px",marginBottom:16,background:C.goldL,border:"1px solid "+C.gold+"33"}},
       [React.createElement("div",{key:"t",style:{fontSize:13,fontWeight:700,color:C.gold,marginBottom:8}},"⚡ Bayesian Recommendation — "+mockPerf.lastUpdated),
        React.createElement("div",{key:"desc",style:{fontSize:11,color:C.inkSec,marginBottom:12}},"Based on "+mockPerf.totalSlates+" slate predictions vs actual results, the following weight adjustment may improve accuracy. Review before applying."),
        React.createElement("div",{key:"weights",style:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}},
          [{l:"BOX",cur:40,sug:Math.round(mockPerf.suggestedWeights.BOX*100),c:C.primary},
           {l:"PBURST",cur:40,sug:Math.round(mockPerf.suggestedWeights.PBURST*100),c:C.rose},
           {l:"CO",cur:20,sug:Math.round(mockPerf.suggestedWeights.CO*100),c:C.teal},
          ].map(w=>React.createElement(Card,{key:w.l,style:{padding:"10px",textAlign:"center"}},
            [React.createElement("div",{key:"l",style:{fontSize:9,color:C.inkTer,fontWeight:700,marginBottom:3}},w.l),
             React.createElement("div",{key:"cur",style:{fontSize:11,color:C.inkTer}},"Current: "+w.cur+"%"),
             React.createElement("div",{key:"arr",style:{fontSize:14}},w.sug>w.cur?"↑":"↓"),
             React.createElement("div",{key:"sug",style:{fontSize:16,fontWeight:900,color:w.c,fontFamily:M}},"→ "+w.sug+"%")]))),
        React.createElement("div",{key:"btns",style:{display:"flex",gap:8}},
          [React.createElement(Btn,{key:"apply",v:"primary",onClick:()=>alert("Weight suggestion applied to Engine Config.")},"Apply to Engine Config"),
           React.createElement(Btn,{key:"dismiss",v:"ghost"},"Dismiss")])]),

     React.createElement("div",{key:"foot",style:{padding:"12px 14px",borderRadius:10,background:C.bgMuted,fontSize:10,color:C.inkTer,lineHeight:1.6}},
       "Adaptive Learning requires Ledger data to compare predictions vs results. The more data imported, the more accurate the suggestions. These are recommendations only — you always control the final engine configuration.")]);
}

function CreatorScreen({onBack}){
  const[view,setView]=useState("dashboard"); // dashboard | wizard | history | matrix | health

  const NAV=[
    {id:"dashboard",icon:"🏠",label:"Dashboard"},
    {id:"wizard",icon:"📥",label:"Import Wizard"},
    {id:"history",icon:"🗂",label:"Import History"},
    {id:"matrix",icon:"📊",label:"Coverage Matrix"},
    {id:"health",icon:"⚡",label:"Health Tests"},
    {id:"engine",icon:"⚙️",label:"Engine Config"},
    {id:"nationwide",icon:"🌎",label:"Nationwide Play"},
    {id:"adaptive",icon:"🧠",label:"Adaptive Learning"},
  ];

  // Recent import stats
  const completed=MOCK_IMPORTS.filter(i=>i.status==="completed").length;
  const failed=MOCK_IMPORTS.filter(i=>i.status==="failed").length;
  const totalAccepted=MOCK_IMPORTS.reduce((s,i)=>s+i.accepted,0);

  const Dashboard=()=>React.createElement("div",{style:{padding:"24px",maxWidth:720}},
    [React.createElement("div",{key:"hdr",style:{marginBottom:20}},
       [React.createElement("h1",{key:"t",style:{fontSize:22,fontWeight:900,color:C.ink,marginBottom:4}},"🔐 Creator Dashboard"),
        React.createElement("p",{key:"s",style:{fontSize:12,color:C.inkSec,margin:0}},"Data pipeline · ZK6 engine management · System health")]),

     // Quick stats
     React.createElement("div",{key:"stats",style:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:24}},
       [{i:"📥",v:MOCK_IMPORTS.length,l:"Total Imports",c:C.primary},{i:"✅",v:completed,l:"Completed",c:C.green},
        {i:"❌",v:failed,l:"Failed",c:C.red},{i:"📊",v:totalAccepted.toLocaleString(),l:"Rows Accepted",c:C.teal}]
         .map(s=>React.createElement(Card,{key:s.l,style:{padding:"14px",textAlign:"center"}},
           [React.createElement("div",{key:"i",style:{fontSize:20,marginBottom:4}},s.i),
            React.createElement("div",{key:"v",style:{fontSize:20,fontWeight:900,color:s.c,fontFamily:M,lineHeight:1,marginBottom:2}},s.v),
            React.createElement("div",{key:"l",style:{fontSize:10,color:C.inkTer,fontWeight:700}},s.l)]))),

     React.createElement("div",{key:"actions",style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:24}},
       [
         {view:"wizard",icon:"📥",title:"Import Wizard",desc:"Box History · Pair History\nDaily Input · Results Ledger",color:C.primary},
         {view:"history",icon:"🗂",title:"Import History",desc:"Browse, review, soft-delete\nand undo past imports",color:C.purple},
         {view:"matrix",icon:"📊",title:"Coverage Matrix",desc:"H01Y–H10Y presence per class\nClick gaps to import",color:C.teal},
         {view:"health",icon:"⚡",title:"Health Tests",desc:"Connection · Snapshots\nDeterminism · Import status",color:C.green},
         {view:"engine",icon:"⚙️",title:"Engine Config",desc:"Signal weights · Rail controls\nDrawing confidence · Defaults",color:C.gold},
         {view:"adaptive",icon:"🧠",title:"Adaptive Learning",desc:"Track hit rates · Bayesian\nweight suggestions",color:C.rose},
         {view:"nationwide",icon:"🌎",title:"Nationwide Play",desc:"Configure Pro feature URL\nfor multi-state play guide",color:C.teal},
       ].map(a=>React.createElement(Card,{key:a.view,onClick:()=>setView(a.view),style:{padding:"18px",cursor:"pointer"}},
         [React.createElement("div",{key:"row",style:{display:"flex",gap:12,alignItems:"flex-start",marginBottom:6}},
            [React.createElement("span",{key:"i",style:{fontSize:24}},a.icon),
             React.createElement("div",{key:"info"},
               [React.createElement("div",{key:"t",style:{fontSize:14,fontWeight:700,color:C.ink}},a.title),
                React.createElement(Pill,{key:"p",label:"Creator Only",color:a.color,xs:true})])]),
          React.createElement("div",{key:"d",style:{fontSize:11,color:C.inkSec,lineHeight:1.6,whiteSpace:"pre-line"}},a.desc)]))),

     // Recent imports quick view
     React.createElement(SecTitle,{key:"recent-t"},"Recent Imports"),
     React.createElement(Card,{key:"recent",style:{padding:"0"}},
       MOCK_IMPORTS.slice(0,5).map((imp,i)=>
         React.createElement("div",{key:imp.id,style:{display:"flex",alignItems:"center",gap:12,padding:"11px 16px",borderBottom:i<4?"1px solid "+C.border:"none"}},
           [React.createElement("span",{key:"i",style:{fontSize:16}},IMPORT_TYPES.find(t=>t.id===imp.type)?.icon||"📦"),
            React.createElement("div",{key:"info",style:{flex:1}},
              [React.createElement("div",{key:"t",style:{fontSize:12,fontWeight:600,color:C.ink}},
                 imp.type+(imp.horizon?" · "+imp.horizon:"")+(imp.class_id?" · Class "+imp.class_id:"")),
               React.createElement("div",{key:"m",style:{fontSize:10,color:C.inkTer}},imp.scope+" · "+new Date(imp.created_at).toLocaleDateString())]),
            React.createElement(Pill,{key:"s",label:imp.status,color:imp.status==="completed"?C.green:imp.status==="failed"?C.red:C.inkTer,xs:true}),
            React.createElement("span",{key:"a",style:{fontSize:12,color:C.green,fontFamily:M}},"+"+imp.accepted)])))]);

  return React.createElement("div",{style:{flex:1,display:"flex",overflow:"hidden"}},
    [// Creator sidebar
     React.createElement("div",{key:"nav",style:{width:200,background:"linear-gradient(180deg,"+C.cosmic+" 0%,"+C.primary+" 100%)",display:"flex",flexDirection:"column",padding:"20px 0"}},
       [React.createElement("div",{key:"logo",style:{padding:"0 16px 20px",borderBottom:"1px solid rgba(255,255,255,.15)"}},
          [React.createElement("div",{key:"icon",style:{fontSize:22,marginBottom:4}},"🔐"),
           React.createElement("div",{key:"t",style:{fontSize:13,fontWeight:800,color:"#fff"}},"Creator Access"),
           React.createElement("div",{key:"s",style:{fontSize:9,color:"rgba(255,255,255,.6)",letterSpacing:1.5}},"ADMIN ONLY")]),
        React.createElement("div",{key:"links",style:{flex:1,padding:"10px 8px"}},
          NAV.map(n=>{const on=view===n.id;return React.createElement("button",{key:n.id,onClick:()=>setView(n.id),
            style:{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"9px 12px",borderRadius:9,
              border:"none",cursor:"pointer",fontFamily:F,fontSize:12,fontWeight:on?700:400,marginBottom:2,
              background:on?"rgba(255,255,255,.18)":"transparent",color:on?"#fff":"rgba(255,255,255,.7)",textAlign:"left",transition:"all .15s"}},
            [React.createElement("span",{key:"i"},n.icon),n.label]);})),
        React.createElement("button",{key:"exit",onClick:onBack,style:{margin:"12px 16px 0",padding:"8px 12px",borderRadius:9,border:"1px solid rgba(255,255,255,.3)",background:"transparent",cursor:"pointer",fontFamily:F,fontSize:12,color:"rgba(255,255,255,.7)",textAlign:"left"}},
          "← Exit Creator")]),

     // Content area
     React.createElement("div",{key:"content",style:{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}},
       view==="dashboard"?React.createElement(Dashboard,{key:"dash"}):
       view==="wizard"?React.createElement(ImportWizard,{key:"wiz",onBack:()=>setView("dashboard")}):
       view==="history"?React.createElement(ImportHistory,{key:"hist",onBack:()=>setView("dashboard")}):
       view==="matrix"?React.createElement(HorizonMatrix,{key:"matrix"}):
       view==="health"?React.createElement(SnapshotHealth,{key:"health"}):
       view==="engine"?React.createElement(EngineConfig,{key:"engine"}):
       view==="nationwide"?React.createElement(NationwideAdmin,{key:"nationwide"}):
       view==="adaptive"?React.createElement(AdaptiveLearning,{key:"adaptive"}):null)]);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── SUPABASE CONNECTION ──────────────────────────────────────────────────────
// Reads real slate snapshots from your live database.
// Falls back to the local ZK6 mock engine if Supabase is unreachable or empty.
const SB_URL  = "https://tgagarhwqbdcwoqhpapi.supabase.co";
const SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnYWdhcmh3cWJkY3dvcWhwYXBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NjM4NDYsImV4cCI6MjA3MzQzOTg0Nn0.n78k9_hxxk8EjYpvzPaHxeiEMueZy_ZSkE4zsq2gmXM";

async function fetchRealSlate(scope) {
  try {
    const res = await fetch(
      SB_URL + "/rest/v1/v_latest_slate_snapshots?scope=eq." + scope + "&limit=1",
      { headers: { apikey: SB_ANON, Authorization: "Bearer " + SB_ANON, Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[0];

    // Parse the top_k_straights_json from the snapshot into our pick format
    let picks = [];
    try {
      const raw = typeof row.top_k_straights_json === "string"
        ? JSON.parse(row.top_k_straights_json)
        : row.top_k_straights_json;
      if (Array.isArray(raw) && raw.length > 0) {
        picks = raw.map((p, i) => ({
          combo:      p.combo || p.key || "000",
          comboSet:   toSet(p.combo || p.key || "000"),
          ind:        parseFloat(p.indicator) || 0,
          signals: {
            BOX:    parseFloat(p.box || p.components?.BOX) || 0.5,
            PBURST: parseFloat(p.pburst || p.components?.PBURST) || 0.5,
            CO:     parseFloat(p.co || p.components?.CO) || 0.5,
            BURST:  0.5,
          },
          mult:       p.multiplicity || _mult(p.combo || "000"),
          topPair:    p.topPair || _tP(p.combo || "000"),
          energy:     parseInt(p.temperature || p.energy_score) || 50,
          bestOrder:  p.bestOrder || p.combo || "000",
          rank:       i + 1,
          confidence: parseInt(row.confidence_score) || 80,
        }));
      }
    } catch (e) { return null; }

    if (picks.length === 0) return null;

    return {
      k6:    picks.slice(0, 6),
      hash:  row.hash || row.snapshot_hash || "LIVE",
      scope: row.scope || scope,
      horizonsPresent: typeof row.horizons_present_json === "string"
        ? JSON.parse(row.horizons_present_json)
        : (row.horizons_present_json || {}),
      confidence:    parseInt(row.confidence_score) || 80,
      engineVersion: row.engine_version || "v2.1",
      source:        "live",   // ← tells the UI this is REAL data
    };
  } catch (e) {
    console.log("[HitMaster] Supabase fetch failed, using local engine:", e.message);
    return null;
  }
}

async function fetchRealLedger() {
  try {
    const res = await fetch(
      SB_URL + "/rest/v1/v_recent_ledger?limit=200&order=date_et.desc",
      { headers: { apikey: SB_ANON, Authorization: "Bearer " + SB_ANON, Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows.map(r => ({
      date:     r.date_et,
      state:    r.jurisdiction,
      label:    r.jurisdiction + " " + (r.session === "midday" ? "Midday" : "Evening"),
      session:  r.session,
      time:     "",
      result:   r.result_digits,
      comboSet: r.comboset_sorted || toSet(r.result_digits),
      front:    r.result_digits.slice(0, 2),
      back:     r.result_digits.slice(1, 3),
      split:    r.result_digits[0] + r.result_digits[2],
    }));
  } catch (e) { return null; }
}

export default function App(){
  const[tab,setTab]=useState("home");
  const[user,setUser]=useState({tier:"FREE"});
  const[showPaywall,setShowPaywall]=useState(false);
  const[scope,setScope]=useState(getActiveSession());
  const[wKey,setWKey]=useState("balanced");
  const[slate,setSlate]=useState(null);
  const[loading,setLoading]=useState(true);
  const[adminClicks,setAdminClicks]=useState(0);

  const[dataSource,setDataSource]=useState("loading"); // "loading"|"live"|"mock"
  const[liveledger,setLiveLedger]=useState(null);

  // On mount — try to load real ledger from Supabase once
  useEffect(()=>{
    fetchRealLedger().then(rows=>{
      if(rows&&rows.length>0) setLiveLedger(rows);
    });
  },[]);

  useEffect(()=>{
    setLoading(true); setSlate(null); setDataSource("loading");

    let cancelled=false;
    const run=async()=>{
      // 1. Try Supabase first
      const live=await fetchRealSlate(scope);
      if(cancelled) return;

      if(live && live.k6 && live.k6.length>0){
        setSlate(live);
        setDataSource("live");
        setLoading(false);
        return;
      }

      // 2. Fall back to local mock engine
      const mock=computeSlate(scope,wKey);
      if(!cancelled){
        setSlate({...mock, source:"mock"});
        setDataSource("mock");
        setLoading(false);
      }
    };

    run();
    return()=>{ cancelled=true; };
  },[scope,wKey]);

  const shared={user,onUpgrade:()=>setShowPaywall(true),slate,loading,scope,setScope,wKey,setWKey};

  return React.createElement("div",{style:{display:"flex",height:"100vh",background:C.bg,fontFamily:F,color:C.ink,overflow:"hidden"}},
    [React.createElement("style",{key:"css"},`
      @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;800&display=swap');
      *{box-sizing:border-box;margin:0;padding:0}
      ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}
      ::-webkit-scrollbar-thumb{background:${C.borderMed};border-radius:2px}
      @keyframes slideUp{from{transform:translateY(60px);opacity:0}to{transform:translateY(0);opacity:1}}
      input::placeholder{color:${C.inkTer}} select{outline:none}
    `),
     React.createElement(Sidebar,{key:"sb",tab,setTab,user,adminClicks,setAdminClicks}),
     React.createElement("div",{key:"main",style:{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}},
       [// Demo tier bar
        React.createElement("div",{key:"demo",style:{background:C.cosmicL,borderBottom:"1px solid "+C.primary+"22",padding:"6px 20px",display:"flex",gap:8,alignItems:"center"}},
          [React.createElement("span",{key:"l",style:{fontSize:11,color:C.inkSec,fontWeight:600}},"🔮 Demo — View as:"),
           ...["FREE","PRO","PLUS"].map(t=>React.createElement("button",{key:t,onClick:()=>setUser({tier:t}),style:{fontSize:10,padding:"3px 10px",borderRadius:99,fontFamily:F,fontWeight:700,cursor:"pointer",border:"1.5px solid "+(user.tier===t?C.primary:C.border),background:user.tier===t?C.primaryL:"transparent",color:user.tier===t?C.primary:C.inkTer,transition:"all .15s"}},{FREE:"FREE",PRO:"Pro",PLUS:"PLUS"}[t])),
           React.createElement("span",{key:"v",style:{marginLeft:"auto",fontSize:10,color:C.inkTer,fontFamily:M}},"ZK6™ Intelligence · 76 draws")]),
        // Ribbon
        React.createElement("div",{key:"ribbon",style:{background:C.bgCard,borderBottom:"1px solid "+C.border,padding:"7px 20px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",fontSize:11}},
          [React.createElement("span",{key:"live",style:{display:"flex",alignItems:"center",gap:5,
              color:dataSource==="live"?C.green:dataSource==="mock"?C.gold:C.inkTer}},
             [React.createElement("span",{key:"d",style:{width:6,height:6,borderRadius:"50%",display:"inline-block",
                background:dataSource==="live"?C.green:dataSource==="mock"?C.gold:C.inkTer,
                boxShadow:dataSource==="live"?"0 0 6px "+C.green:dataSource==="mock"?"0 0 6px "+C.gold:"none"}}),
              dataSource==="live"?"● Supabase — Live":dataSource==="mock"?"● Mock (import data to go live)":"● Connecting…"]),
           React.createElement(Pill,{key:"tier",label:{FREE:"Seeker",PRO:"Oracle+ ♛",PLUS:"Mystic ♛"}[user.tier],color:{FREE:C.free,PRO:C.pro,PLUS:C.plus}[user.tier]}),
           React.createElement("span",{key:"t",style:{color:C.inkSec}},["Updated: ",React.createElement("b",{key:"b",style:{color:C.ink,fontFamily:M}},fET())]),
           slate&&React.createElement("code",{key:"h",style:{fontFamily:M,color:dataSource==="live"?C.green:C.inkTer,fontSize:10}},
             (dataSource==="live"?"🟢 ":"")+"hash …"+(slate.hash||"").slice(-6)),
           React.createElement("div",{key:"hz",style:{display:"flex",gap:3,marginLeft:"auto"}},
             slate&&Object.entries(slate.horizonsPresent||{}).slice(0,5).map(([h,ok])=>
               React.createElement("span",{key:h,style:{fontSize:9,padding:"2px 5px",borderRadius:4,fontWeight:700,background:ok?C.greenL:C.bgMuted,color:ok?C.green:C.inkTer,border:"1px solid "+(ok?C.green+"33":C.border)}},h+(ok?" ✓":" ⌛"))))]),
        // Content
        React.createElement("div",{key:"content",style:{flex:1,overflow:"hidden",display:"flex"}},
          tab==="home"?React.createElement(HomeScreen,{key:"home",...shared}):
          tab==="slates"?React.createElement(SlatesScreen,{key:"slates",...shared}):
          tab==="ledger"?React.createElement(LedgerScreen,{key:"ledger",liveledger}):
          tab==="book"?React.createElement(NumberBookScreen,{key:"book",user,onUpgrade:()=>setShowPaywall(true)}):
          tab==="learn"?React.createElement(LearnScreen,{key:"learn",user,onUpgrade:()=>setShowPaywall(true)}):
          tab==="profile"?React.createElement(ProfileScreen,{key:"profile",user,onUpgrade:()=>setShowPaywall(true)}):
          tab==="admin"?React.createElement(CreatorScreen,{key:"admin",onBack:()=>setTab("home")}):null)]),
     showPaywall&&React.createElement(Paywall,{key:"pw",onClose:()=>setShowPaywall(false),onSuccess:()=>{setUser({tier:"PRO"});setShowPaywall(false);}})]);
}
