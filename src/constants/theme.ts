export const Colors = {
  primary: '#3D3530',      // koyu kahve - Onni tonu
  primaryLight: '#6B5E57', // açık kahve
  accent: '#C4A882',       // sıcak bej - porselen tonu
  accentLight: '#EDE0CF',  // açık bej
  background: '#F8F5F1',   // krem beyaz
  surface: '#FFFFFF',
  surfaceVariant: '#F0EAE2',
  error: '#B54E4E',
  success: '#4E8B6B',
  warning: '#B58A3E',
  info: '#3E6B8B',

  text: '#2A211C',
  textSecondary: '#7A6E69',
  textMuted: '#ADA39E',
  border: '#E0D8D0',
  divider: '#EDE8E3',

  // Aşama renkleri
  stages: {
    casting: '#7B9EC4',
    drying: '#C4B87B',
    bisque: '#C4947B',
    bisque_done: '#C4847B',
    glazing: '#7BC4A4',
    glaze_firing: '#7BA4C4',
    glaze_done: '#7BC48C',
    decal: '#A47BC4',
    decal_firing: '#947BC4',
    sanding: '#C4C47B',
    finished: '#4E8B6B',
  },

  // Fırın tipi renkleri
  firing: {
    bisque: '#C4947B',
    glaze: '#7BA4C4',
    decal: '#A47BC4',
  },

  // Koleksiyon renkleri
  collections: {
    Rigel: '#3E6B8B',
    Origo: '#4E8B6B',
    Onnimug: '#8B4E6B',
    Vega: '#6B6B3E',
    'Diğer': '#6B6B6B',
  },
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

export const Typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '600' as const, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodySmall: { fontSize: 13, fontWeight: '400' as const },
  caption: { fontSize: 11, fontWeight: '400' as const, letterSpacing: 0.3 },
  label: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const },
} as const;
