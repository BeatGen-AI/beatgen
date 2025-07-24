import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Play, ChevronUp, ChevronDown, ChevronRight, Heart, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPublicDrumSamples } from '../../../../platform/api/drum_samples';
import { DrumSamplePublicRead } from '../../../../platform/types/dto/public_models/drum_samples';
import { prettyPrint } from '../../../../utils/pretty_print';

// Sample categories with sub-categories (similar to instruments)
const sampleCategories = [
  { 
    id: 'favorites', 
    name: 'Favorites', 
    icon: Heart,
    subCategories: []
  },
  { 
    id: 'drums', 
    name: 'Drums', 
    icon: Play,
    subCategories: [
      { id: 'kicks', name: 'Kicks' },
      { id: 'snares', name: 'Snares' },
      { id: 'hi-hats', name: 'Hi-Hats' },
      { id: 'cymbals', name: 'Cymbals' },
      { id: 'toms', name: 'Toms' },
      { id: 'drums-misc', name: 'Misc' }
    ]
  },
  { 
    id: 'percussion', 
    name: 'Percussion', 
    icon: Play,
    subCategories: [
      { id: 'shakers', name: 'Shakers' },
      { id: 'tambourines', name: 'Tambourines' },
      { id: 'claps', name: 'Claps' },
      { id: 'snaps', name: 'Snaps' },
      { id: 'percussion-misc', name: 'Misc' }
    ]
  },
  { 
    id: 'electronic', 
    name: 'Electronic', 
    icon: Play,
    subCategories: [
      { id: '808s', name: '808s' },
      { id: 'trap', name: 'Trap' },
      { id: 'techno', name: 'Techno' },
      { id: 'house', name: 'House' },
      { id: 'electronic-misc', name: 'Misc' }
    ]
  },
  { 
    id: 'world', 
    name: 'World', 
    icon: Play,
    subCategories: [
      { id: 'african', name: 'African' },
      { id: 'latin', name: 'Latin' },
      { id: 'asian', name: 'Asian' },
      { id: 'middle-eastern', name: 'Middle Eastern' },
      { id: 'world-misc', name: 'Misc' }
    ]
  }
];

// COMPREHENSIVE CATEGORY MAPPING SYSTEM
const API_CATEGORY_MAP: Record<string, string> = {
  // Kicks - all possible variations
  'kick': 'kicks',
  'kicks': 'kicks',
  'bd': 'kicks',
  'bass_drum': 'kicks',
  'bassdrum': 'kicks',
  'bass drum': 'kicks',
  'kick_drum': 'kicks',
  'kickdrum': 'kicks',
  
  // Snares - all variations
  'snare': 'snares',
  'snares': 'snares',
  'sd': 'snares',
  'snare_drum': 'snares',
  'snaredrum': 'snares',
  'rim': 'snares',
  'rimshot': 'snares',
  'rim_shot': 'snares',
  'sidestick': 'snares',
  'side_stick': 'snares',
  
  // Hi-hats - comprehensive
  'hihat': 'hi-hats',
  'hi_hat': 'hi-hats',
  'hi-hat': 'hi-hats',
  'hh': 'hi-hats',
  'closed_hh': 'hi-hats',
  'open_hh': 'hi-hats',
  'hat': 'hi-hats',
  'hats': 'hi-hats',
  'closed_hat': 'hi-hats',
  'open_hat': 'hi-hats',
  'pedal_hat': 'hi-hats',
  'foot_hat': 'hi-hats',
  
  // Cymbals
  'crash': 'cymbals',
  'ride': 'cymbals',
  'cymbal': 'cymbals',
  'cymbals': 'cymbals',
  'splash': 'cymbals',
  'china': 'cymbals',
  'bell': 'cymbals',
  'ride_bell': 'cymbals',
  
  // Toms
  'tom': 'toms',
  'toms': 'toms',
  'floor_tom': 'toms',
  'rack_tom': 'toms',
  'high_tom': 'toms',
  'mid_tom': 'toms',
  'low_tom': 'toms',
  'tom_tom': 'toms',
  'tomtom': 'toms',
  
  // Percussion
  'clap': 'claps',
  'claps': 'claps',
  'handclap': 'claps',
  'hand_clap': 'claps',
  
  'snap': 'snaps',
  'snaps': 'snaps',
  'finger_snap': 'snaps',
  'fingersnap': 'snaps',
  
  'shaker': 'shakers',
  'shakers': 'shakers',
  'shake': 'shakers',
  'maraca': 'shakers',
  'maracas': 'shakers',
  'egg': 'shakers',
  'cabasa': 'shakers',
  
  'tambourine': 'tambourines',
  'tambourines': 'tambourines',
  'tamb': 'tambourines',
  'tambo': 'tambourines',
  
  // Electronic
  'eight_o_eight': '808s',
  'eight_oh_eight': '808s',
  '808': '808s',
  '808_kick': '808s',
  '808_bass': '808s',
  'sub': '808s',
  'sub_bass': '808s',
  
  // Generic mappings (removed 'perc' to allow pattern matching)
  'percussion': 'percussion-misc',
  'misc': 'drums-misc',
  'fx': 'electronic-misc',
  'effect': 'electronic-misc',
  'sfx': 'electronic-misc',
};

// Main category for each subcategory
const SUBCATEGORY_TO_MAIN: Record<string, string> = {
  // Drums
  'kicks': 'drums',
  'snares': 'drums',
  'hi-hats': 'drums',
  'cymbals': 'drums',
  'toms': 'drums',
  'drums-misc': 'drums',
  
  // Percussion
  'shakers': 'percussion',
  'tambourines': 'percussion',
  'claps': 'percussion',
  'snaps': 'percussion',
  'percussion-misc': 'percussion',
  
  // Electronic
  '808s': 'electronic',
  'trap': 'electronic',
  'techno': 'electronic',
  'house': 'electronic',
  'electronic-misc': 'electronic',
  
  // World
  'african': 'world',
  'latin': 'world',
  'asian': 'world',
  'middle-eastern': 'world',
  'world-misc': 'world',
};

// Enhanced keyword matching with regex patterns
const SUBCATEGORY_PATTERNS: Record<string, RegExp[]> = {
  // Drums
  'kicks': [
    /\bkick/i, /\bbd\b/i, /\bbass\s*drum/i, /\bbassdrum/i, 
    /\bkik\b/i, /\bkck\b/i, /\bboom\b/i, /\bthump\b/i,
    /\bbdrum/i, /\bkdrm/i, /\bkd\b/i
  ],
  'snares': [
    /\bsnare/i, /\bsnr\b/i, /\bsd\b/i, /\brim/i, 
    /\bside\s*stick/i, /\bbrush/i, /\broll/i
  ],
  'hi-hats': [
    /\bh(?:i)?[\s-]*hat/i, /\bhh\b/i, /\bopen\s*hat/i, 
    /\bclosed\s*hat/i, /\bpedal\s*hat/i, /\bfoot\s*hat/i,
    /\bhat\b/i, /\bhats\b/i, /\bhihat/i, /\bhi-hat/i,
    /\boh\b/i, /\bch\b/i, /\boph\b/i, /\bclh\b/i
  ],
  'cymbals': [
    /\bcymbal/i, /\bcrash/i, /\bride\b/i, /\bsplash/i, 
    /\bchina/i, /\bbell/i, /\bgong\b/i
  ],
  'toms': [
    /\btom/i, /\bfloor\s*tom/i, /\brack\s*tom/i, 
    /\bhigh\s*tom/i, /\bmid\s*tom/i, /\blow\s*tom/i
  ],
  
  // Percussion
  'claps': [
    /\bclap/i, /\bhand\s*clap/i, /\bapplause/i, /\bhands/i,
    /\bclp\b/i, /\bhandz/i
  ],
  'snaps': [
    /\bsnap/i, /\bfinger\s*snap/i, /\bclick/i, /\bfinger/i,
    /\bsnp\b/i, /\bfingerz/i
  ],
  'shakers': [
    /\bshak/i, /\bmaraca/i, /\begg\b/i, /\bcabasa/i, 
    /\bsand/i, /\brattle/i, /\bshk\b/i, /\bshkr/i,
    /\bmrc\b/i, /\bcabs/i
  ],
  'tambourines': [
    /\btamb/i, /\bjingle/i, /\btmb\b/i, /\btambor/i,
    /\bjngl/i, /\btambr/i
  ],
  
  // Electronic
  '808s': [
    /\b808/i, /\beight[\s_-]*o[\s_-]*eight/i, 
    /\bsub\s*bass/i, /\bboom\s*bass/i, /\btrap\s*bass/i
  ],
  'trap': [/\btrap/i, /\bdrill/i, /\broll/i],
  'techno': [/\btechno/i, /\bacid/i, /\brave/i],
  'house': [/\bhouse/i, /\bdeep/i, /\bgarage/i],
  
  // World
  'african': [
    /\bafrican/i, /\bdjembe/i, /\bconga/i, /\bbongo/i, 
    /\btribal/i, /\btalking\s*drum/i, /\bdjmb/i, /\bcng\b/i,
    /\bbng\b/i, /\btrbl/i, /\bafrk/i, /\bafrc/i
  ],
  'latin': [
    /\blatin/i, /\bsalsa/i, /\bsamba/i, /\bbossa/i, 
    /\btimbale/i, /\bclave/i, /\bguiro/i, /\bcowbell/i,
    /\btmbl/i, /\bclv\b/i, /\bgro\b/i, /\bcwbl/i,
    /\bltn\b/i, /\blatn/i, /\bcuban/i, /\bbrazil/i
  ],
  'asian': [
    /\basian/i, /\btaiko/i, /\btabla/i, /\bgong/i, 
    /\bchinese/i, /\bjapanese/i, /\bindian/i, /\btko\b/i,
    /\btbl\b/i, /\bgng\b/i, /\basn\b/i, /\basia/i
  ],
  'middle-eastern': [
    /\bmiddle[\s-]*east/i, /\barabic/i, /\bdarbuka/i, 
    /\bdoumbek/i, /\briq\b/i, /\bdef\b/i, /\bdarb/i,
    /\bdmbk/i, /\barb\b/i, /\bmeast/i, /\bmdest/i
  ],
  
  // Additional percussion patterns
  'percussion-misc': [
    /\bperc/i, /\bpercussion/i, /\bwood\s*block/i, /\btriangle/i,
    /\bbell/i, /\bchime/i, /\bvibraslap/i, /\bblock/i,
    /\bstick/i, /\bmisc/i, /\bfx/i, /\beffect/i,
    /\bnoise/i, /\bspecial/i, /\bother/i
  ],
};

// Improved categorization function
function categorizeSample(sample: DrumSamplePublicRead): string {
  // Build comprehensive search text first
  const searchText = [
    sample.category || '',
    sample.display_name || '',
    sample.kit_name || '',
    sample.file_name || '',
    sample.description || '',
    sample.genre || ''
  ].join(' ');
  
  // Check patterns with scoring system FIRST before simple mappings
  const scores: Record<string, number> = {};
  
  for (const [subcategory, patterns] of Object.entries(SUBCATEGORY_PATTERNS)) {
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(searchText)) {
        score += 1;
        // Give extra weight if pattern matches display_name
        if (sample.display_name && pattern.test(sample.display_name)) {
          score += 2;
        }
        // Give extra weight if pattern matches file_name
        if (sample.file_name && pattern.test(sample.file_name)) {
          score += 2;
        }
        // Give less weight if pattern only matches category field
        if (sample.category && pattern.test(sample.category)) {
          score += 1;
        }
      }
    }
    if (score > 0) {
      scores[subcategory] = score;
    }
  }
  
  // Return the subcategory with highest score if we have a good match
  if (Object.keys(scores).length > 0) {
    const bestMatch = Object.entries(scores).reduce((a, b) => 
      a[1] > b[1] ? a : b
    );
    // Use pattern match if we have any score
    if (bestMatch[1] >= 1) {
      return bestMatch[0];
    }
  }
  
  // Now try category mappings as fallback
  const normalizedCategory = (sample.category || '').toLowerCase().trim().replace(/[\s_-]+/g, '_');
  
  // Special handling for percussion category
  if (normalizedCategory === 'perc' || sample.category?.toLowerCase() === 'perc') {
    // Try to determine specific percussion type from patterns
    if (Object.keys(scores).length > 0) {
      const bestMatch = Object.entries(scores).reduce((a, b) => 
        a[1] > b[1] ? a : b
      );
      // For percussion, use even low-scoring matches
      const percussionSubcategories = ['claps', 'snaps', 'shakers', 'tambourines'];
      if (percussionSubcategories.includes(bestMatch[0])) {
        return bestMatch[0];
      }
    }
    // Default to percussion-misc if no specific match
    return 'percussion-misc';
  }
  
  // Try direct category mapping with normalized value
  if (API_CATEGORY_MAP[normalizedCategory]) {
    return API_CATEGORY_MAP[normalizedCategory];
  }
  
  // Try direct mapping with original category
  if (sample.category && API_CATEGORY_MAP[sample.category.toLowerCase()]) {
    return API_CATEGORY_MAP[sample.category.toLowerCase()];
  }
  
  // Genre-based categorization
  const genre = (sample.genre || '').toLowerCase();
  const genreMap: Record<string, string> = {
    'hip_hop': 'trap',
    'hip hop': 'trap',
    'rap': 'trap',
    'trap': 'trap',
    'electronic': 'electronic-misc',
    'edm': 'electronic-misc',
    'techno': 'techno',
    'house': 'house',
    'world': 'world-misc',
    'ethnic': 'world-misc',
    'latin': 'latin',
    'african': 'african',
    'asian': 'asian'
  };
  
  if (genreMap[genre]) {
    return genreMap[genre];
  }
  
  // Kit name based fallbacks
  const kitName = (sample.kit_name || '').toLowerCase();
  if (kitName.includes('trap')) return 'trap';
  if (kitName.includes('808')) return '808s';
  if (kitName.includes('house')) return 'house';
  if (kitName.includes('techno')) return 'techno';
  if (kitName.includes('rock')) return 'drums-misc';
  if (kitName.includes('jazz')) return 'drums-misc';
  if (kitName.includes('acoustic')) return 'drums-misc';
  if (kitName.includes('electronic')) return 'electronic-misc';
  if (kitName.includes('world')) return 'world-misc';
  if (kitName.includes('latin')) return 'latin';
  if (kitName.includes('african')) return 'african';
  
  // Final fallbacks based on any text
  if (/\b(electr|synth|digital|process)/i.test(searchText)) {
    return 'electronic-misc';
  }
  if (/\b(world|ethnic|tradition|folk)/i.test(searchText)) {
    return 'world-misc';
  }
  
  // Ultimate fallback - try to guess from any available text
  if (/\b(kick|bd|bass\s*drum)\b/i.test(searchText)) return 'kicks';
  if (/\b(snare|snr|sd)\b/i.test(searchText)) return 'snares';
  if (/\b(hat|hh)\b/i.test(searchText)) return 'hi-hats';
  if (/\b(cymbal|crash|ride)\b/i.test(searchText)) return 'cymbals';
  if (/\b(tom)\b/i.test(searchText)) return 'toms';
  if (/\b(clap|handclap)\b/i.test(searchText)) return 'claps';
  if (/\b(snap|finger)\b/i.test(searchText)) return 'snaps';
  if (/\b(shak|maraca)\b/i.test(searchText)) return 'shakers';
  if (/\b(tamb|jingle)\b/i.test(searchText)) return 'tambourines';
  if (/\b(808|eight)\b/i.test(searchText)) return '808s';
  if (/\b(trap|drill)\b/i.test(searchText)) return 'trap';
  if (/\b(perc)\b/i.test(searchText)) return 'percussion-misc';
  
  console.warn(`Could not categorize sample: ${sample.display_name} (category: ${sample.category})`);
  return 'drums-misc';
}

// Debug helper to analyze uncategorized samples
function analyzeUncategorizedSamples(samples: DrumSamplePublicRead[]) {
  const categorized = new Map<string, DrumSamplePublicRead[]>();
  const uncategorized: DrumSamplePublicRead[] = [];
  
  samples.forEach(sample => {
    const category = categorizeSample(sample);
    if (category.includes('-misc')) {
      uncategorized.push(sample);
    }
    const list = categorized.get(category) || [];
    categorized.set(category, [...list, sample]);
  });
  
  console.log('🔍 CATEGORIZATION ANALYSIS:');
  console.log(`Total samples: ${samples.length}`);
  console.log(`Uncategorized (in misc): ${uncategorized.length}`);
  
  if (uncategorized.length > 0) {
    console.log('\n📋 Samples in misc categories:');
    uncategorized.slice(0, 10).forEach(s => {
      console.log(`  - ${s.display_name} (${s.category}) → ${categorizeSample(s)}`);
    });
  }
  
  console.log('\n📊 Distribution:');
  Array.from(categorized.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([cat, samples]) => {
      console.log(`  ${cat}: ${samples.length} samples`);
    });
}

// Mock drum samples organized by sub-category (for fallback when no real samples found)
const mockDrumSamples = {
  // Drum samples organized by sub-category
  'kicks': [
    { id: 'kick-acoustic', display_name: 'Acoustic Kick', category: 'drums', kit_name: 'Acoustic Kit' },
    { id: 'kick-808', display_name: '808 Kick', category: 'drums', kit_name: 'Electronic Kit' },
    { id: 'kick-punch', display_name: 'Punchy Kick', category: 'drums', kit_name: 'Rock Kit' },
  ],
  'snares': [
    { id: 'snare-acoustic', display_name: 'Acoustic Snare', category: 'drums', kit_name: 'Acoustic Kit' },
    { id: 'snare-clap', display_name: 'Clap Snare', category: 'drums', kit_name: 'Electronic Kit' },
    { id: 'snare-rim', display_name: 'Rim Shot', category: 'drums', kit_name: 'Jazz Kit' },
  ],
  'hi-hats': [
    { id: 'hihat-closed', display_name: 'Closed Hi-Hat', category: 'drums', kit_name: 'Standard Kit' },
    { id: 'hihat-open', display_name: 'Open Hi-Hat', category: 'drums', kit_name: 'Standard Kit' },
    { id: 'hihat-pedal', display_name: 'Pedal Hi-Hat', category: 'drums', kit_name: 'Jazz Kit' },
  ],
  'cymbals': [
    { id: 'cymbal-crash', display_name: 'Crash Cymbal', category: 'drums', kit_name: 'Rock Kit' },
    { id: 'cymbal-ride', display_name: 'Ride Cymbal', category: 'drums', kit_name: 'Jazz Kit' },
    { id: 'cymbal-splash', display_name: 'Splash Cymbal', category: 'drums', kit_name: 'Studio Kit' },
  ],
  'toms': [
    { id: 'tom-high', display_name: 'High Tom', category: 'drums', kit_name: 'Standard Kit' },
    { id: 'tom-mid', display_name: 'Mid Tom', category: 'drums', kit_name: 'Standard Kit' },
    { id: 'tom-floor', display_name: 'Floor Tom', category: 'drums', kit_name: 'Rock Kit' },
  ],
  
  // Percussion samples
  'claps': [
    { id: 'clap-studio', display_name: 'Studio Clap', category: 'percussion', kit_name: 'Electronic Kit' },
    { id: 'clap-reverb', display_name: 'Reverb Clap', category: 'percussion', kit_name: 'Ambient Kit' },
  ],
  'shakers': [
    { id: 'shaker-egg', display_name: 'Egg Shaker', category: 'percussion', kit_name: 'Latin Kit' },
    { id: 'shaker-maraca', display_name: 'Maraca', category: 'percussion', kit_name: 'World Kit' },
  ],
  
  // Electronic samples
  '808s': [
    { id: '808-sub', display_name: '808 Sub Bass', category: 'electronic', kit_name: 'Trap Kit' },
    { id: '808-long', display_name: '808 Long Tail', category: 'electronic', kit_name: 'Hip Hop Kit' },
  ],
  'trap': [
    { id: 'trap-snare', display_name: 'Trap Snare', category: 'electronic', kit_name: 'Trap Kit' },
    { id: 'trap-hihat', display_name: 'Trap Hi-Hat', category: 'electronic', kit_name: 'Trap Kit' },
  ],
  
  // World samples
  'african': [
    { id: 'djembe', display_name: 'Djembe', category: 'world', kit_name: 'African Kit' },
    { id: 'talking-drum', display_name: 'Talking Drum', category: 'world', kit_name: 'African Kit' },
  ],
  'latin': [
    { id: 'conga', display_name: 'Conga', category: 'world', kit_name: 'Latin Kit' },
    { id: 'bongo', display_name: 'Bongo', category: 'world', kit_name: 'Latin Kit' },
  ],
};

export interface DrumMachineBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSelection: (selectedSamples: DrumSamplePublicRead[]) => void;
  isAIAssistantOpen?: boolean;
  isOtherBottomSheetOpen?: boolean;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
}

export const DrumMachineBottomSheet = ({ isOpen, onClose, onConfirmSelection, isAIAssistantOpen = false, isOtherBottomSheetOpen = false, isMinimized = false, onToggleMinimize }: DrumMachineBottomSheetProps) => {
  const [selectedCategory, setSelectedCategory] = useState('drums');
  const [selectedSubCategory, setSelectedSubCategory] = useState('kicks');
  
  console.log('🥁 DrumMachineBottomSheet rendered - isOpen:', isOpen);
  const [isSubCategoriesExpanded, setIsSubCategoriesExpanded] = useState(true);
  const [drumSamples, setDrumSamples] = useState<DrumSamplePublicRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [selectedSampleIds, setSelectedSampleIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Handle search state
  useEffect(() => {
    if (searchQuery.trim()) {
      setIsSearching(true);
      setSelectedCategory('search-results');
      setSelectedSubCategory('');
      setIsSubCategoriesExpanded(false);
    } else {
      setIsSearching(false);
      // Return to default category when search is cleared
      if (selectedCategory === 'search-results') {
        setSelectedCategory('drums');
        setSelectedSubCategory('kicks');
        setIsSubCategoriesExpanded(true);
      }
    }
  }, [searchQuery, selectedCategory]);

  // Fetch available drum samples when the modal opens
  useEffect(() => {
    if (isOpen) {
      fetchDrumSamples();
    }
  }, [isOpen]);

  const fetchDrumSamples = async () => {
    try {
      setLoading(true);
      
      console.log('🥁 FETCHDRUMSAMPLES CALLED - Starting to fetch drum samples...');
      const data = await getPublicDrumSamples();
      setDrumSamples(data);
      console.log('Fetched drum samples:', data);
      console.log(`Total drum samples loaded: ${data.length}`);
      
      // Analyze data with improved helper
      if (data.length > 0) {
        analyzeUncategorizedSamples(data);
      }
    } catch (err: any) {
      console.error('Error fetching drum samples:', err);
      // Still set an empty array so the UI can show fallback behavior
      setDrumSamples([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelect = (sample: DrumSamplePublicRead) => {
    // If selecting from search results, navigate to the sample's category
    if (selectedCategory === 'search-results') {
      // For mock samples, check their subCategory property first
      const sampleSubCategory = (sample as any).subCategory || categorizeSample(sample);
      const sampleMainCategory = SUBCATEGORY_TO_MAIN[sampleSubCategory] || 'drums';
      
      setSelectedCategory(sampleMainCategory);
      setSelectedSubCategory(sampleSubCategory);
      setIsSubCategoriesExpanded(true);
      setSearchQuery('');
      setIsSearching(false);
    }
    
    setSelectedSampleIds(prevSelectedIds => {
      const newSelectedIds = new Set(prevSelectedIds);
      if (newSelectedIds.has(sample.id)) {
        newSelectedIds.delete(sample.id);
      } else {
        newSelectedIds.add(sample.id);
      }
      return newSelectedIds;
    });
  };

  const handleConfirmSelection = () => {
    // Get selected real samples
    const selectedRealSamples = drumSamples.filter(sample => selectedSampleIds.has(sample.id));
    
    // Get selected mock samples
    const allMockSamples: DrumSamplePublicRead[] = Object.values(mockDrumSamples).flat() as any[];
    const selectedMockSamples = allMockSamples.filter((sample: any) => selectedSampleIds.has(sample.id));
    
    const allSelectedSamples = [...selectedRealSamples, ...selectedMockSamples];
    
    if (allSelectedSamples.length > 0) {
      console.log('Confirming selection:', allSelectedSamples);
      onConfirmSelection(allSelectedSamples);
      onClose();
    }
  };

  const toggleSubCategories = () => {
    setIsSubCategoriesExpanded(!isSubCategoriesExpanded);
  };

  const toggleFavorite = (sampleId: string) => {
    setFavorites(prev => {
      const newFavorites = new Set(prev);
      if (newFavorites.has(sampleId)) {
        newFavorites.delete(sampleId);
        console.log('Removed from favorites:', sampleId);
      } else {
        newFavorites.add(sampleId);
        console.log('Added to favorites:', sampleId);
      }
      return newFavorites;
    });
  };

  // Helper to check if a sample ID is from mock data
  const isMockSample = (id: string) => id.startsWith('kick-') || id.startsWith('snare-') || id.startsWith('hihat-') || 
                                       id.startsWith('cymbal-') || id.startsWith('tom-') || id.startsWith('clap-') || 
                                       id.startsWith('shaker-') || id.startsWith('808-') || id.startsWith('trap-') || 
                                       id.startsWith('djembe') || id.startsWith('conga') || id.startsWith('bongo') || 
                                       id.startsWith('talking-drum');

  const getCurrentSamples = useMemo(() => {
    console.log('🎵 getCurrentSamples called:', {
      selectedCategory,
      selectedSubCategory,
      totalDrumSamples: drumSamples.length,
      isSearching,
      searchQuery
    });

    // If we're in search mode, return all matching samples from all categories
    if (selectedCategory === 'search-results' && searchQuery) {
      const query = searchQuery.toLowerCase();
      
      // Search through all real drum samples
      const matchingRealSamples = drumSamples.filter(sample => {
        const searchableText = [
          sample.display_name,
          sample.kit_name,
          sample.category,
          sample.description,
          sample.genre
        ].filter(Boolean).join(' ').toLowerCase();
        
        return searchableText.includes(query);
      });
      
      // Search through all mock samples
      const allMockSamples: DrumSamplePublicRead[] = Object.values(mockDrumSamples).flat() as any[];
      const matchingMockSamples = allMockSamples.filter((sample: any) =>
        sample.display_name.toLowerCase().includes(query)
      );
      
      const result = [...matchingRealSamples, ...matchingMockSamples];
      console.log('Search results:', result.length);
      return result;
    }

    // Handle favorites
    if (selectedCategory === 'favorites') {
      // Get favorited real samples
      const favoritedRealSamples = drumSamples.filter(sample => favorites.has(sample.id));
      
      // Get favorited mock samples
      const allMockSamples: DrumSamplePublicRead[] = Object.values(mockDrumSamples).flat() as any[];
      const favoritedMockSamples = allMockSamples.filter((sample: any) => favorites.has(sample.id));
      
      const result = [...favoritedRealSamples, ...favoritedMockSamples];
      return result;
    }

    // Step 1: Categorize all samples ONCE
    const categorizedSamples = new Map<string, DrumSamplePublicRead[]>();
    
    // Initialize empty arrays for all subcategories
    Object.keys(SUBCATEGORY_TO_MAIN).forEach(subcategory => {
      categorizedSamples.set(subcategory, []);
    });

    // Categorize each sample
    drumSamples.forEach(sample => {
      const subcategory = categorizeSample(sample);
      const samples = categorizedSamples.get(subcategory) || [];
      categorizedSamples.set(subcategory, [...samples, sample]);
    });

    // Debug logging
    if (drumSamples.length > 0) {
      console.log('📊 Sample Distribution:');
      categorizedSamples.forEach((samples, subcategory) => {
        if (samples.length > 0) {
          console.log(`  ${subcategory}: ${samples.length} samples`);
        }
      });
    }

    // Step 2: Get samples based on selection
    let realSamples: DrumSamplePublicRead[] = [];
    
    if (selectedSubCategory) {
      // Get samples for specific subcategory
      realSamples = categorizedSamples.get(selectedSubCategory) || [];
    } else {
      // Get all samples for main category
      Object.entries(SUBCATEGORY_TO_MAIN).forEach(([subcategory, mainCategory]) => {
        if (mainCategory === selectedCategory) {
          realSamples = [...realSamples, ...(categorizedSamples.get(subcategory) || [])];
        }
      });
    }

    // If we have real samples, combine with mock samples for that subcategory
    let result: DrumSamplePublicRead[] = [...realSamples];
    
    // Always add mock samples for the selected subcategory
    if (selectedSubCategory && mockDrumSamples[selectedSubCategory as keyof typeof mockDrumSamples]) {
      const mockSamplesForSubcategory = mockDrumSamples[selectedSubCategory as keyof typeof mockDrumSamples] as any[];
      result = [...result, ...mockSamplesForSubcategory];
    }
    
    console.log(`🎯 Final result: ${result.length} samples (${realSamples.length} real, ${result.length - realSamples.length} mock)`);
    return result;
  }, [drumSamples, selectedCategory, selectedSubCategory, favorites, searchQuery, isSearching]);

  const selectedCategoryData = sampleCategories.find(cat => cat.id === selectedCategory);
  const selectedSubCategoryData = selectedCategoryData?.subCategories?.find(sub => sub.id === selectedSubCategory);

  if (!isOpen) return null;

  return (
    <div 
      className={cn(
        "bg-gray-900 border-t border-gray-700 transition-all duration-300 ease-in-out",
        "flex flex-col",
        isMinimized ? "flex-shrink-0" : "flex-1"
      )}
      style={{ 
        height: isMinimized ? '60px' : (isOtherBottomSheetOpen ? '50%' : '100%'),
        minHeight: '60px'
      }}
    >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900">
          <div className="flex items-center space-x-3 flex-1">
            <h2 className="text-lg font-semibold text-white whitespace-nowrap">Choose Drum Samples</h2>
            {selectedCategory === 'search-results' ? (
              <div className="flex items-center space-x-2 text-sm">
                <span className="text-gray-500">•</span>
                <span className="text-gray-300 font-medium">Search Results</span>
              </div>
            ) : (
              selectedCategoryData && (
                <div className="flex items-center space-x-2 text-sm">
                  <span className="text-gray-500">•</span>
                  <span className="text-gray-300 font-medium">{selectedCategoryData.name}</span>
                  {selectedSubCategoryData && (
                    <>
                      <span className="text-gray-500 mx-1">-</span>
                      <span className="text-gray-300">{selectedSubCategoryData.name}</span>
                    </>
                  )}
                </div>
              )
            )}
          </div>
          <div className="flex items-center space-x-3 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
              <Input
                type="text"
                placeholder="Search samples..."
                value={searchQuery}
                onChange={(e) => {
                  const newQuery = e.target.value;
                  setSearchQuery(newQuery);
                  
                  // Auto-expand if minimized and starting to search
                  if (newQuery && isMinimized) {
                    onToggleMinimize?.();
                  }
                }}
                className="pl-10 pr-8 py-2 w-64 bg-gray-800 border border-gray-600 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 text-sm rounded-lg shadow-sm transition-all duration-200 hover:border-gray-500 hover:bg-gray-750"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 text-gray-400 hover:text-white hover:bg-gray-600 rounded-md"
                  title="Clear search"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            {selectedSampleIds.size > 0 && (
              <Button
                variant="default"
                size="sm"
                onClick={handleConfirmSelection}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1"
              >
                Confirm ({selectedSampleIds.size})
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggleMinimize?.()}
              className="text-gray-400 hover:text-white hover:bg-gray-700 px-2 py-1"
              title={isMinimized ? "Expand panel" : "Collapse panel"}
            >
              {isMinimized ? (
                <div className="flex items-center space-x-1">
                  <ChevronUp className="h-4 w-4" />
                  <span className="text-xs">Expand</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1">
                  <ChevronDown className="h-4 w-4" />
                  <span className="text-xs">Collapse</span>
                </div>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-gray-400 hover:text-white hover:bg-gray-700"
              title="Close panel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content - Hidden when minimized */}
        {!isMinimized && (
          <div className="flex flex-1 min-h-0">
            {/* Left Panel - Main Categories */}
            <div className="w-48 border-r border-gray-700 flex-shrink-0 bg-gray-900 flex flex-col">
              <div className="text-xs font-medium text-gray-400 mb-3 uppercase tracking-wider p-3 pb-0">
                Categories
              </div>
              
              <div 
                className="flex-1 overflow-y-auto pl-3 pr-0"
                style={{ 
                  scrollbarWidth: 'thin', 
                  scrollbarColor: '#6B7280 #374151' 
                }}
              >
                <div className="space-y-1 pr-3">
                  {sampleCategories.map((category) => {
                    const IconComponent = category.icon;
                    const isCategorySelected = selectedCategory === category.id;
                    
                    return (
                      <Button
                        key={category.id}
                        variant="ghost"
                        className={cn(
                          "w-full text-left p-3 h-auto font-normal",
                          isCategorySelected 
                            ? "bg-blue-600 text-white hover:bg-blue-700 justify-between" 
                            : "text-gray-300 hover:text-white hover:bg-gray-800 justify-start"
                        )}
                        onClick={() => {
                          if (isCategorySelected) {
                            if (category.id !== 'favorites') {
                              toggleSubCategories();
                            }
                          } else {
                            // Clear search if it's active
                            if (searchQuery) {
                              setSearchQuery('');
                            }
                            
                            setSelectedCategory(category.id);
                            if (category.id === 'favorites') {
                              setSelectedSubCategory('');
                              setIsSubCategoriesExpanded(false);
                            } else if (category.subCategories && category.subCategories.length > 0) {
                              setSelectedSubCategory(category.subCategories[0].id);
                              setIsSubCategoriesExpanded(true);
                            }
                          }
                        }}
                      >
                        <div className="flex items-center flex-1">
                          <IconComponent className="h-4 w-4 mr-3" />
                          {category.name}
                        </div>
                        {category.id !== 'favorites' && (
                          <ChevronRight 
                            className={cn(
                              "h-4 w-4 transition-transform text-gray-400",
                              isCategorySelected && isSubCategoriesExpanded && "rotate-90",
                              isCategorySelected && "text-white"
                            )}
                          />
                        )}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
            
            {/* Middle Panel - Sub Categories (Collapsible) */}
            {isSubCategoriesExpanded && selectedCategory !== 'favorites' && (
              <div className="w-52 border-r border-gray-700 p-3 flex-shrink-0 bg-gray-850 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    {selectedCategoryData?.name} Types
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleSubCategories}
                    className="p-1 h-6 w-6 text-gray-400 hover:text-white"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
                
                <div 
                  className="flex-1 overflow-y-auto pr-2"
                  style={{ 
                    scrollbarWidth: 'thin', 
                    scrollbarColor: '#6B7280 #374151' 
                  }}
                >
                  <div className="space-y-1">
                    {selectedCategoryData?.subCategories?.map((subCategory) => {
                      const isSubSelected = selectedSubCategory === subCategory.id;
                      
                      return (
                        <Button
                          key={subCategory.id}
                          variant="ghost"
                          className={cn(
                            "w-full justify-start text-left p-2 h-auto font-normal text-sm",
                            isSubSelected
                              ? "bg-blue-500 text-white hover:bg-blue-600"
                              : "text-gray-400 hover:text-white hover:bg-gray-700"
                          )}
                          onClick={() => setSelectedSubCategory(subCategory.id)}
                        >
                          {subCategory.name}
                        </Button>
                      );
                    }) || (
                      <div className="text-gray-500 text-sm italic p-2">
                        No sub-categories available
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {/* Right Panel - Samples */}
            <div className="flex-1 flex flex-col min-w-0">
              
              <div 
                className="flex-1 overflow-y-auto bg-gray-900 min-h-0 pl-4 pr-0 pt-4"
                style={{ 
                  scrollbarWidth: 'thin', 
                  scrollbarColor: '#6B7280 #374151'
                }}
              >
                <div className="pr-4 pb-3">
                  {loading ? (
                    <div className="flex items-center justify-center h-32">
                      <div className="text-gray-400">Loading samples...</div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                      {getCurrentSamples.map((sample: DrumSamplePublicRead) => {
                        const isSelected = selectedSampleIds.has(sample.id);
                        const isFavorite = favorites.has(sample.id);
                        
                        return (
                          <div
                            key={sample.id}
                            className={cn(
                              "group relative border rounded-lg hover:bg-gray-750 transition-all duration-200 hover:border-gray-500",
                              isSelected 
                                ? "bg-blue-600/20 border-blue-500" 
                                : "bg-gray-800 border-gray-700"
                            )}
                            title={sample.display_name}
                          >
                            <div className="p-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex-1 mr-2 min-w-0">
                                  <h4 className="font-medium text-white text-sm truncate w-full">
                                    {sample.display_name}
                                  </h4>
                                  {selectedCategory === 'search-results' && (
                                    <div className="text-xs text-gray-500 truncate w-full">
                                      {SUBCATEGORY_TO_MAIN[categorizeSample(sample)] || 'misc'}
                                    </div>
                                  )}
                                </div>
                                
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs px-1 py-1 h-6 w-6 hover:bg-gray-600 flex-shrink-0"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleFavorite(sample.id);
                                    }}
                                  >
                                    <Heart 
                                      className={cn(
                                        "h-3 w-3 transition-colors",
                                        isFavorite 
                                          ? "fill-red-500 text-red-500" 
                                          : "text-gray-400 hover:text-red-400"
                                      )} 
                                    />
                                  </Button>
                                  
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className={cn(
                                      "text-xs px-2 py-1 h-6 border flex-shrink-0 min-w-[40px]",
                                      isSelected 
                                        ? "bg-blue-600 hover:bg-blue-700 border-blue-500 text-white" 
                                        : "bg-gray-700 hover:bg-gray-600 border-gray-600 hover:border-gray-500 text-gray-300 hover:text-white"
                                    )}
                                    onClick={() => handleToggleSelect(sample)}
                                  >
                                    {isSelected ? '✓' : '+'}
                                  </Button>
                                </div>
                              </div>
                              
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full h-8 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  console.log('Preview:', sample.display_name);
                                }}
                              >
                                <Play className="h-3 w-3 mr-2" />
                                Preview
                              </Button>
                            </div>
                            
                            {/* Hover Tooltip */}
                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 whitespace-nowrap border border-gray-600">
                              {sample.display_name}
                              {sample.kit_name && (
                                <div className="text-gray-400 mt-1">
                                  Kit: {prettyPrint(sample.kit_name)}
                                </div>
                              )}
                              <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                            </div>
                          </div>
                        );
                      })}
                      
                      {getCurrentSamples.length === 0 && !loading && (
                        <div className="col-span-full text-center py-8 text-gray-400">
                          No samples found
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};