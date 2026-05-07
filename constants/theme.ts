export const theme = {
  colors: {
    // Cosmic backgrounds (light theme)
    background: '#FAF7FF',
    surface: '#FFFFFF',
    surfaceLight: '#F0EBFF',
    surfaceMuted: '#E4DAFB',
    border: '#DDD6FE',
    borderMed: '#C4B5FD',

    // Text
    text: '#1E1B4B',
    textSecondary: '#4C3D8F',
    textTertiary: '#8B7EC8',

    // Primary — deep indigo/violet
    primary: '#7C3AED',
    primaryLight: '#EDE9FE',
    primaryDark: '#5B21B6',

    // Gold — oracle/divine
    gold: '#D97706',
    goldLight: '#FEF3C7',
    starGold: '#FCD34D',
    orange: '#EA580C',
    orangeLight: '#FFF7ED',

    // Signal colors
    success: '#059669',
    successLight: '#ECFDF5',
    error: '#DC2626',
    errorLight: '#FEF2F2',
    warning: '#D97706',

    rose: '#BE185D',
    roseLight: '#FDF2F8',
    teal: '#0D9488',
    tealLight: '#F0FDFA',

    // Cosmic special
    cosmic: '#4C1D95',
    cosmicLight: '#F5F3FF',

    // Tier colors
    free: '#6B7280',
    premium: '#D97706',   // PRO tier
    admin: '#7C3AED',     // PLUS/admin tier

    // Legacy compat
    crownGold: '#FCD34D',
    crownYellow: '#D97706',
    crownPurple: '#7C3AED',
    dataBlue: '#3B82F6',
    dataGreen: '#059669',
    dataYellow: '#D97706',
    dataPurple: '#7C3AED',
    dataRed: '#DC2626',
    glow: '#7C3AED40',
    hotGlow: '#DC2626',
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },

  borderRadius: {
    sm: 6,
    md: 10,
    lg: 14,
    xl: 18,
    xxl: 22,
    xxxl: 28,
    full: 9999,
  },

  typography: {
    fontFamily: {
      regular: 'System',
      mono: 'Courier',
      tabular: 'System',
    },
    fontSize: {
      xs: 11,
      sm: 13,
      md: 15,
      lg: 17,
      xl: 22,
      xxl: 28,
      xxxl: 36,
    },
  },

  animation: {
    fast: 150,
    medium: 250,
    slow: 350,
  },

  shadows: {
    soft: {
      shadowColor: '#1E1B4B',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    medium: {
      shadowColor: '#1E1B4B',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.10,
      shadowRadius: 14,
      elevation: 6,
    },
    glow: {
      shadowColor: '#7C3AED',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 8,
    },
  },
} as const;
