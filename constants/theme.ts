export const theme = {
  colors: {
    // Surfaces
    background:   '#0a0613',
    bgElevated:   '#120a1f',
    card:         'rgba(20,12,38,0.72)',
    border:       'rgba(255,255,255,0.08)',
    borderMed:    'rgba(255,255,255,0.16)',

    // Text
    text:          '#ffffff',
    textSecondary: 'rgba(255,255,255,0.72)',
    textTertiary:  'rgba(255,255,255,0.45)',

    // Signal channels
    cyan:   '#2bffcc',   // Frequency / Hits
    rose:   '#ff3d9a',   // Momentum / Pburst
    amber:  '#ff6a2b',   // Hot streak
    gold:   '#ffd93d',   // Consistency / DGC
    purple: '#9b5bff',   // Pattern / CO / Brand
    blue:   '#22a3ff',

    // Channel map (semantic aliases)
    BOX:    '#2bffcc',
    PBURST: '#ff3d9a',
    CO:     '#9b5bff',
    DGC:    '#ffd93d',

    // Semantic signal aliases (Phase I — UI Enhancement Plan)
    freqSignal:    '#2bffcc',   // frequency / BOX
    momoSignal:    '#ff3d9a',   // momentum / PBURST
    patternSignal: '#9b5bff',   // pattern / CO
    consistSignal: '#ffd93d',   // consistency / DGC
    hotStreak:     '#ff6a2b',   // hot streak banner / amber accents
    brand:         '#9b5bff',   // primary brand color (was `primary`)
    neutralCool:   'rgba(43,255,204,0.12)',
    neutralWarm:   'rgba(255,106,43,0.12)',

    // Temperature
    hot:  '#ff3b30',
    warm: '#ffcc00',
    mild: '#34c759',
    cold: '#666666',

    // State / feedback
    success:      '#34c759',
    successLight: 'rgba(52,199,89,0.12)',
    error:        '#ff3b30',
    errorLight:   'rgba(255,59,48,0.12)',
    warning:      '#ffcc00',

    // Tier colors
    free:    '#666666',
    premium: '#ffd93d',
    admin:   '#9b5bff',

    // Depth layers
    surface2:     '#0d0820',   // intermediate depth between background and surface

    // Compat shims — these are load-bearing across the codebase and
    // effectively canonical. The eight unused aliases (crownPurple,
    // crownYellow, dataRed, glow, hotGlow, orangeLight, primaryDark,
    // starGold) were removed 2026-05-12 per enhancements §7.6.
    primary:      '#9b5bff',
    primaryLight: 'rgba(155,91,255,0.12)',
    surface:      '#120a1f',
    surfaceLight: 'rgba(255,255,255,0.06)',
    surfaceMuted: 'rgba(255,255,255,0.04)',
    crownGold:    '#ffd93d',
    dataBlue:     '#22a3ff',
    dataGreen:    '#34c759',
    dataYellow:   '#ffd93d',
    dataPurple:   '#9b5bff',
    orange:       '#ff6a2b',
    teal:         '#2bffcc',
    tealLight:    'rgba(43,255,204,0.12)',
    cosmic:       '#9b5bff',
    cosmicLight:  'rgba(155,91,255,0.12)',
    goldLight:    'rgba(255,217,61,0.12)',
    roseLight:    'rgba(255,61,154,0.12)',
  },

  spacing: {
    xs:  4,
    sm:  8,
    md:  16,
    lg:  24,
    xl:  32,
    xxl: 48,
    // token aliases
    s1:  4,
    s2:  8,
    s3:  12,
    s4:  16,
    s5:  20,
    s6:  24,
    s8:  32,
  },

  borderRadius: {
    sm:   6,
    md:   10,
    lg:   14,
    xl:   18,
    xxl:  22,
    xxxl: 28,
    full: 9999,
    // token aliases
    pill:   999,
    card:   16,
    tile:   12,
    chip:   10,
    bar:    2,
    banner: 8,
  },

  // Layout tokens (design.md step 2). Every screen's horizontal inset
  // sources from `screenInset` so the content edge is identical across
  // Home / Slate / Results. Don't hardcode 12/14/16 in screen styles.
  layout: {
    screenInset: 16,
  },

  typography: {
    fontFamily: {
      regular: 'Inter_400Regular',
      medium:  'Inter_500Medium',
      semibold:'Inter_600SemiBold',
      bold:    'Inter_700Bold',
      mono:    'JetBrainsMono_400Regular',
      monoBold:'JetBrainsMono_700Bold',
      tabular: 'JetBrainsMono_400Regular',
    },
    fontSize: {
      eyebrow: 10,
      xs:      11,
      sm:      13,
      body:    13,
      md:      15,
      card:    16,
      h2:      18,
      lg:      17,
      h1:      24,
      xl:      22,
      stat:    32,
      xxl:     28,
      combo:   38,
      xxxl:    36,
      hero:    72,
    },
  },

  animation: {
    fast:   150,
    medium: 250,
    slow:   350,
    pulse:  900,
    hit:    1400,
  },

  letterSpacing: {
    tight:  -0.3,
    normal:  0,
    wide:    0.5,
    wider:   1,
    widest:  1.5,
    combo:   3,    // 3-digit pick combos
    comboLg: 6,    // large combo inputs / displays
  },

  gradients: {
    purpleRose:  ['#9b5bff', '#ff3d9a'] as [string, string],
    cyanPurple:  ['#2bffcc', '#9b5bff'] as [string, string],
    goldAmber:   ['#ffd93d', '#ff6a2b'] as [string, string],
    header:      ['#120a1f', '#0a0613'] as [string, string],
    hotEnergy:   ['#ff3b30', '#ff6a2b'] as [string, string],
    warmEnergy:  ['#ff6a2b', '#ffd93d'] as [string, string],
    mildEnergy:  ['#ffd93d', '#2bffcc'] as [string, string],
    coolEnergy:  ['rgba(255,255,255,0.2)', 'rgba(255,255,255,0.08)'] as [string, string],
  },

  shadows: {
    soft: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 4,
    },
    medium: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.5,
      shadowRadius: 16,
      elevation: 8,
    },
    glow: {
      shadowColor: '#9b5bff',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.6,
      shadowRadius: 16,
      elevation: 10,
    },
    cyan: {
      shadowColor: '#2bffcc',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 12,
      elevation: 8,
    },
    rose: {
      shadowColor: '#ff3d9a',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 12,
      elevation: 8,
    },
  },
} as const;

export type ThemeColors = keyof typeof theme.colors;
