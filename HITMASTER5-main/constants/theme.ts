export const theme = {
  colors: {
    // Primary palette - bright and fun
    background: '#0A0E1A',
    surface: '#141824',
    surfaceLight: '#1C2333',
    border: '#2A3142',
    
    // Text
    text: '#FFFFFF',
    textSecondary: '#94A3B8',
    textTertiary: '#64748B',
    
    // Accent colors - bright and energetic
    primary: '#00D4FF',
    primaryDark: '#0099CC',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    
    // Role colors with crown gradients
    admin: '#8B5CF6', // Plus tier
    premium: '#F59E0B', // PRO tier
    free: '#64748B', // FREE tier
    
    // Crown gradient colors
    crownGold: '#FFD700',
    crownYellow: '#FFA500',
    crownPurple: '#8B5CF6',
    
    // Data visualization
    dataBlue: '#3B82F6',
    dataGreen: '#10B981',
    dataYellow: '#F59E0B',
    dataPurple: '#8B5CF6',
    dataRed: '#EF4444',
    
    // Glow effects for "hot" items
    glow: '#00D4FF40',
    hotGlow: '#FF6B35',
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
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    xxl: 24, // 2xl rounded cards
    xxxl: 32, // 3xl rounded cards
    full: 9999,
  },
  
  typography: {
    // Using system fonts with tabular numerals
    fontFamily: {
      regular: 'System',
      mono: 'Courier',
      tabular: 'System', // For tabular numerals
    },
    fontSize: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 18,
      xl: 24,
      xxl: 32,
      xxxl: 40,
    },
  },
  
  // Animation timing
  animation: {
    fast: 150,
    medium: 250,
    slow: 350,
  },
  
  // Shadows for cards
  shadows: {
    soft: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
    },
    medium: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 6,
    },
  },
} as const;