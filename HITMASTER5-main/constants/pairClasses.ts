// Ten Pair Classes mapping - canonical definitions for ZK6 engine
// Class 1 is Box (handled separately), Classes 2-11 are Pair classes

export const PAIR_CLASSES = {
  1: {
    label: 'Box Combination',
    description: 'Unordered digit set from straight combo',
    example: '{1,2,3} from 123'
  },
  2: {
    label: 'Front Pair Straight',
    description: 'First two digits in order (AB)',
    example: '12 from 123'
  },
  3: {
    label: 'Back Pair Straight', 
    description: 'Last two digits in order (BC)',
    example: '23 from 123'
  },
  4: {
    label: 'Split Pair Straight',
    description: 'First and last digits in order (AC)',
    example: '13 from 123'
  },
  5: {
    label: 'Front Pair Box',
    description: 'Unordered front pair {A,B}',
    example: '{1,2} from 123'
  },
  6: {
    label: 'Back Pair Box',
    description: 'Unordered back pair {B,C}',
    example: '{2,3} from 123'
  },
  7: {
    label: 'Split Pair Box',
    description: 'Unordered split pair {A,C}',
    example: '{1,3} from 123'
  },
  8: {
    label: 'Front Pair from Box Combination',
    description: 'Front pair after sorting box digits',
    example: 'After sort: front pair'
  },
  9: {
    label: 'Back Pair from Box Combination',
    description: 'Back pair after sorting box digits',
    example: 'After sort: back pair'
  },
  10: {
    label: 'Split Pair from Box Combination',
    description: 'Split pair after sorting box digits',
    example: 'After sort: split pair'
  },
  11: {
    label: 'Any Position Box',
    description: 'All unordered pairs within a draw',
    example: 'All pairs from {1,2,3}'
  }
} as const;

export const HORIZONS = [
  'H01Y', 'H02Y', 'H03Y', 'H04Y', 'H05Y',
  'H06Y', 'H07Y', 'H08Y', 'H09Y', 'H10Y'
] as const;

export const SCOPES = {
  midday: { label: 'midday', icon: 'AM' },
  evening: { label: 'evening', icon: 'PM' },
  allday: { label: 'allday', icon: '24H' }
} as const;