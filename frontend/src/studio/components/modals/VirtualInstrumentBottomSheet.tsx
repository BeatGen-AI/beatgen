import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Play, Piano, Music, Guitar, ChevronUp, ChevronDown, ChevronRight, Heart, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPublicSoundfonts } from '../../../platform/api/soundfonts';
import SoundfontManager from '../../core/soundfont/soundfontManager';
import { db } from '../../core/db/dexie-client';
import { InstrumentFileRead } from 'src/platform/types/project';

// Instrument categories with sub-categories (favorites first, then alphabetically sorted)
const instrumentCategories = [
  { 
    id: 'favorites', 
    name: 'Favorites', 
    icon: Heart,
    subCategories: []
  },
  { 
    id: 'bass', 
    name: 'Bass', 
    icon: Music,
    subCategories: [
      { id: 'electric-bass', name: 'Electric Bass' },
      { id: 'sub-bass', name: 'Sub Bass' },
      { id: 'synth-bass', name: 'Synth Bass' },
      { id: 'upright-bass', name: 'Upright Bass' },
      { id: 'bass-misc', name: 'Misc' }
    ]
  },
  { 
    id: 'brass', 
    name: 'Brass', 
    icon: Music,
    subCategories: [
      { id: 'french-horns', name: 'French Horns' },
      { id: 'trombones', name: 'Trombones' },
      { id: 'trumpets', name: 'Trumpets' },
      { id: 'tubas', name: 'Tubas' },
      { id: 'brass-misc', name: 'Misc' }
    ]
  },
  { 
    id: 'guitars', 
    name: 'Guitars', 
    icon: Guitar,
    subCategories: [
      { id: 'acoustic-guitars', name: 'Acoustic Guitars' },
      { id: 'bass-guitars', name: 'Bass Guitars' },
      { id: 'classical-guitars', name: 'Classical Guitars' },
      { id: 'electric-guitars', name: 'Electric Guitars' },
      { id: 'guitars-misc', name: 'Misc' }
    ]
  },
  { 
    id: 'keyboards', 
    name: 'Keyboards', 
    icon: Piano,
    subCategories: [
      { id: 'clavinet', name: 'Clavinet' },
      { id: 'electric-pianos', name: 'Electric Pianos' },
      { id: 'grand-pianos', name: 'Grand Pianos' },
      { id: 'rhodes', name: 'Rhodes' },
      { id: 'upright-pianos', name: 'Upright Pianos' },
      { id: 'wurlitzer', name: 'Wurlitzer' },
      { id: 'keyboards-misc', name: 'Misc' }
    ]
  },
  { 
    id: 'leads', 
    name: 'Leads', 
    icon: Music,
    subCategories: [
      { id: 'analog-leads', name: 'Analog Leads' },
      { id: 'digital-leads', name: 'Digital Leads' },
      { id: 'pluck-leads', name: 'Pluck Leads' },
      { id: 'sequence-leads', name: 'Sequence Leads' },
      { id: 'leads-misc', name: 'Misc' }
    ]
  },
  { 
    id: 'organs', 
    name: 'Organs', 
    icon: Piano,
    subCategories: [
      { id: 'church-organs', name: 'Church Organs' },
      { id: 'electric-organs', name: 'Electric Organs' },
      { id: 'hammond-organs', name: 'Hammond Organs' },
      { id: 'organs-misc', name: 'Misc' }
    ]
  },
  { 
    id: 'pads', 
    name: 'Pads', 
    icon: Music,
    subCategories: [
      { id: 'ambient-pads', name: 'Ambient Pads' },
      { id: 'choir-pads', name: 'Choir Pads' },
      { id: 'string-pads', name: 'String Pads' },
      { id: 'warm-pads', name: 'Warm Pads' },
      { id: 'pads-misc', name: 'Misc' }
    ]
  },
  { 
    id: 'strings', 
    name: 'Strings', 
    icon: Music,
    subCategories: [
      { id: 'cellos', name: 'Cellos' },
      { id: 'string-sections', name: 'String Sections' },
      { id: 'violins', name: 'Violins' },
      { id: 'violas', name: 'Violas' },
      { id: 'strings-misc', name: 'Misc' }
    ]
  },
  { 
    id: 'woodwinds', 
    name: 'Woodwinds', 
    icon: Music,
    subCategories: [
      { id: 'clarinets', name: 'Clarinets' },
      { id: 'flutes', name: 'Flutes' },
      { id: 'oboes', name: 'Oboes' },
      { id: 'saxophones', name: 'Saxophones' },
      { id: 'woodwinds-misc', name: 'Misc' }
    ]
  },
  { 
    id: 'misc', 
    name: 'Misc', 
    icon: Music,
    subCategories: [
      { id: 'percussion', name: 'Percussion' },
      { id: 'mallets', name: 'Mallets' },
      { id: 'ethnic', name: 'Ethnic' },
      { id: 'sound-effects', name: 'Sound Effects' },
      { id: 'misc-other', name: 'Other' }
    ]
  }
];

const mockInstruments = {
  // Bass instruments organized by sub-category
  'electric-bass': [
    { id: 'bass-electric', name: 'Electric Bass', description: 'Deep electric bass', category: 'bass', subCategory: 'electric-bass' },
    { id: 'bass-fretless', name: 'Fretless Bass', description: 'Smooth fretless electric bass', category: 'bass', subCategory: 'electric-bass' },
  ],
  'sub-bass': [
    { id: 'sub-bass-808', name: '808 Sub Bass', description: 'Classic 808 sub bass', category: 'bass', subCategory: 'sub-bass' },
    { id: 'sub-bass-sine', name: 'Sine Sub Bass', description: 'Pure sine wave sub bass', category: 'bass', subCategory: 'sub-bass' },
  ],
  'synth-bass': [
    { id: 'synth-bass-analog', name: 'Analog Synth Bass', description: 'Warm analog synth bass', category: 'bass', subCategory: 'synth-bass' },
    { id: 'synth-bass-digital', name: 'Digital Synth Bass', description: 'Sharp digital synth bass', category: 'bass', subCategory: 'synth-bass' },
  ],
  'upright-bass': [
    { id: 'bass-upright', name: 'Upright Bass', description: 'Natural upright bass', category: 'bass', subCategory: 'upright-bass' },
    { id: 'bass-jazz', name: 'Jazz Upright Bass', description: 'Jazz-style upright bass', category: 'bass', subCategory: 'upright-bass' },
  ],

  // Keyboard instruments organized by sub-category
  'grand-pianos': [
    { id: 'studio-grand', name: 'Studio Grand', description: 'Rich, detailed grand piano', category: 'keyboards', subCategory: 'grand-pianos' },
    { id: 'concert-grand', name: 'Concert Grand', description: 'Concert hall grand piano', category: 'keyboards', subCategory: 'grand-pianos' },
  ],
  'upright-pianos': [
    { id: 'upright-piano', name: 'Upright Piano', description: 'Warm, intimate piano sound', category: 'keyboards', subCategory: 'upright-pianos' },
    { id: 'honky-tonk', name: 'Honky Tonk Piano', description: 'Vintage honky tonk piano', category: 'keyboards', subCategory: 'upright-pianos' },
  ],
  'electric-pianos': [
    { id: 'electric-piano', name: 'Electric Piano', description: 'Vintage electric piano', category: 'keyboards', subCategory: 'electric-pianos' },
    { id: 'mark-piano', name: 'Mark Piano', description: 'Classic Mark electric piano', category: 'keyboards', subCategory: 'electric-pianos' },
  ],
  'rhodes': [
    { id: 'whirly', name: 'Whirly', description: 'Classic electric piano', category: 'keyboards', subCategory: 'rhodes' },
    { id: 'rhodes-classic', name: 'Rhodes Classic', description: 'Vintage Rhodes electric piano', category: 'keyboards', subCategory: 'rhodes' },
  ],
  'wurlitzer': [
    { id: 'wurlitzer-ep', name: 'Wurlitzer EP', description: 'Classic Wurlitzer electric piano', category: 'keyboards', subCategory: 'wurlitzer' },
  ],
  'clavinet': [
    { id: 'clavinet-funk', name: 'Funk Clavinet', description: 'Funky clavinet sound', category: 'keyboards', subCategory: 'clavinet' },
  ],

  // Guitar instruments organized by sub-category
  'acoustic-guitars': [
    { id: 'acoustic-steel', name: 'Acoustic Steel', description: 'Bright steel string guitar', category: 'guitars', subCategory: 'acoustic-guitars' },
    { id: 'acoustic-12string', name: 'Acoustic 12-String', description: 'Rich 12-string acoustic guitar', category: 'guitars', subCategory: 'acoustic-guitars' },
  ],
  'electric-guitars': [
    { id: 'electric-clean', name: 'Electric Clean', description: 'Clean electric guitar', category: 'guitars', subCategory: 'electric-guitars' },
    { id: 'electric-distorted', name: 'Electric Distorted', description: 'Heavy distorted guitar', category: 'guitars', subCategory: 'electric-guitars' },
  ],
  'classical-guitars': [
    { id: 'acoustic-nylon', name: 'Acoustic Nylon', description: 'Warm nylon string guitar', category: 'guitars', subCategory: 'classical-guitars' },
    { id: 'spanish-guitar', name: 'Spanish Guitar', description: 'Traditional Spanish classical guitar', category: 'guitars', subCategory: 'classical-guitars' },
  ],
  'bass-guitars': [
    { id: 'bass-electric-guitar', name: 'Electric Bass', description: 'Deep electric bass', category: 'guitars', subCategory: 'bass-guitars' },
    { id: 'bass-acoustic', name: 'Acoustic Bass', description: 'Acoustic bass guitar', category: 'guitars', subCategory: 'bass-guitars' },
  ],

  // Other categories (simplified for now)
  leads: [
    { id: '80s-square-lead', name: '80s Square Lead', description: 'Retro synth lead sound', category: 'leads' },
    { id: 'analog-lead', name: 'Analog Lead', description: 'Warm analog synthesizer', category: 'leads' },
    { id: 'digital-lead', name: 'Digital Lead', description: 'Sharp digital synthesizer', category: 'leads' },
  ],
  brass: [
    { id: 'trumpet', name: 'Trumpet', description: 'Bright brass trumpet', category: 'brass' },
    { id: 'trombone', name: 'Trombone', description: 'Deep brass trombone', category: 'brass' },
    { id: 'french-horn', name: 'French Horn', description: 'Warm french horn', category: 'brass' },
  ],
  organs: [
    { id: 'hammond-b3', name: 'Hammond B3', description: 'Classic Hammond organ', category: 'organs' },
    { id: 'church-organ', name: 'Church Organ', description: 'Majestic church organ', category: 'organs' },
    { id: 'electric-organ', name: 'Electric Organ', description: 'Vintage electric organ', category: 'organs' },
  ],
  pads: [
    { id: 'ambient-pad', name: 'Ambient Pad', description: 'Ethereal ambient pad', category: 'pads' },
    { id: 'string-pad', name: 'String Pad', description: 'Lush string pad', category: 'pads' },
    { id: 'choir-pad', name: 'Choir Pad', description: 'Vocal choir pad', category: 'pads' },
  ],

  // Misc instruments organized by sub-category
  'percussion': [
    { id: 'glockenspiel', name: 'Glockenspiel', description: 'Bright metallic percussion', category: 'misc', subCategory: 'percussion' },
    { id: 'xylophone', name: 'Xylophone', description: 'Wooden mallet instrument', category: 'misc', subCategory: 'percussion' },
    { id: 'timpani', name: 'Timpani', description: 'Orchestral kettle drums', category: 'misc', subCategory: 'percussion' },
  ],
  'mallets': [
    { id: 'vibraphone', name: 'Vibraphone', description: 'Metal bar percussion with motor', category: 'misc', subCategory: 'mallets' },
    { id: 'marimba', name: 'Marimba', description: 'Large wooden xylophone', category: 'misc', subCategory: 'mallets' },
    { id: 'celesta', name: 'Celesta', description: 'Keyboard-controlled chimes', category: 'misc', subCategory: 'mallets' },
  ],
  'ethnic': [
    { id: 'sitar', name: 'Sitar', description: 'Indian string instrument', category: 'misc', subCategory: 'ethnic' },
    { id: 'erhu', name: 'Erhu', description: 'Chinese two-string violin', category: 'misc', subCategory: 'ethnic' },
    { id: 'didgeridoo', name: 'Didgeridoo', description: 'Aboriginal wind instrument', category: 'misc', subCategory: 'ethnic' },
  ],
  'sound-effects': [
    { id: 'rain', name: 'Rain', description: 'Rain sound effect', category: 'misc', subCategory: 'sound-effects' },
    { id: 'wind', name: 'Wind', description: 'Wind sound effect', category: 'misc', subCategory: 'sound-effects' },
    { id: 'birds', name: 'Birds', description: 'Bird chirping sounds', category: 'misc', subCategory: 'sound-effects' },
  ],
  'misc-other': [
    { id: 'accordion', name: 'Accordion', description: 'Bellows-driven instrument', category: 'misc', subCategory: 'misc-other' },
    { id: 'harmonica', name: 'Harmonica', description: 'Mouth harp instrument', category: 'misc', subCategory: 'misc-other' },
    { id: 'kalimba', name: 'Kalimba', description: 'African thumb piano', category: 'misc', subCategory: 'misc-other' },
  ],
};

// Type for mock instruments
interface MockInstrument {
  id: string;
  name: string;
  description: string;
  category: string;
  subCategory: string;
}

// Type guard to check if instrument has a name property (mock instrument)
const hasMockName = (instrument: InstrumentFileRead | MockInstrument): instrument is MockInstrument => {
  return 'name' in instrument && typeof (instrument as MockInstrument).name === 'string';
};

// Helper to get display name from either real or mock instrument
const getInstrumentDisplayName = (instrument: InstrumentFileRead | MockInstrument): string => {
  if (hasMockName(instrument)) {
    return instrument.name;
  }
  return instrument.display_name || '';
};

// Helper to get display category for an instrument
const getDisplayCategory = (instrument: InstrumentFileRead) => {
  const category = instrument.category?.toLowerCase() || '';
  const displayName = instrument.display_name?.toLowerCase() || '';
  const fileName = instrument.file_name?.toLowerCase() || '';
  
  // Build search text from all available fields
  const searchText = `${category} ${displayName} ${fileName}`;
  
  // Check for each category using multiple patterns
  if (/\b(piano|keyboard|keys|rhodes|wurlitzer|clav|ep)\b/i.test(searchText)) {
    return 'keyboards';
  }
  if (/\b(bass|sub)\b/i.test(searchText) && !/\b(drum|kick)\b/i.test(searchText)) {
    return 'bass';
  }
  if (/\b(guitar|gtr)\b/i.test(searchText)) {
    return 'guitars';
  }
  if (/\b(brass|trumpet|trombone|horn|tuba)\b/i.test(searchText)) {
    return 'brass';
  }
  if (/\b(lead|pluck|sync|saw)\b/i.test(searchText)) {
    return 'leads';
  }
  if (/\b(pad|atmosphere|ambient|sweep)\b/i.test(searchText)) {
    return 'pads';
  }
  if (/\b(organ|b3|hammond|church)\b/i.test(searchText)) {
    return 'organs';
  }
  if (/\b(string|violin|viola|cello|ensemble)\b/i.test(searchText) && !/\b(guitar|bass)\b/i.test(searchText)) {
    return 'strings';
  }
  if (/\b(wood|wind|flute|clarinet|sax|oboe)\b/i.test(searchText)) {
    return 'woodwinds';
  }
  
  // Simple category mapping as fallback
  const categoryMap: Record<string, string> = {
    'piano': 'keyboards',
    'pianos': 'keyboards',
    'keyboard': 'keyboards',
    'keyboards': 'keyboards',
    'bass': 'bass',
    'basses': 'bass',
    'guitar': 'guitars',
    'guitars': 'guitars',
    'brass': 'brass',
    'lead': 'leads',
    'leads': 'leads',
    'pad': 'pads',
    'pads': 'pads',
    'organ': 'organs',
    'organs': 'organs',
    'string': 'strings',
    'strings': 'strings',
    'woodwind': 'woodwinds',
    'woodwinds': 'woodwinds',
  };
  
  return categoryMap[category] || 'misc';
};

// Helper to check if instrument matches a subcategory
const matchesSubcategory = (instrument: InstrumentFileRead | MockInstrument, subCategoryId: string): boolean => {
  const displayName = getInstrumentDisplayName(instrument).toLowerCase();
  const name = hasMockName(instrument) ? instrument.name.toLowerCase() : displayName;
  
  switch(subCategoryId) {
    // Bass sub-categories
    case 'electric-bass':
      return (name.includes('bass') || displayName.includes('bass')) && 
             (name.includes('electric') || displayName.includes('electric'));
    case 'sub-bass':
      return (name.includes('sub') || displayName.includes('sub')) ||
             (name.includes('808') || displayName.includes('808'));
    case 'synth-bass':
      return (name.includes('synth') || displayName.includes('synth')) && 
             (name.includes('bass') || displayName.includes('bass'));
    case 'upright-bass':
      return (name.includes('upright') || displayName.includes('upright')) ||
             ((name.includes('acoustic') || displayName.includes('acoustic')) && 
              (name.includes('bass') || displayName.includes('bass')));
    
    // Keyboard sub-categories
    case 'grand-pianos':
      return name.includes('grand') || displayName.includes('grand');
    case 'upright-pianos':
      return (name.includes('upright') || displayName.includes('upright')) ||
             ((name.includes('piano') || displayName.includes('piano')) && 
              !name.includes('electric') && !displayName.includes('electric') && 
              !name.includes('grand') && !displayName.includes('grand'));
    case 'electric-pianos':
      return (name.includes('electric') || displayName.includes('electric')) && 
             (name.includes('piano') || displayName.includes('piano'));
    case 'rhodes':
      return name.includes('rhodes') || displayName.includes('rhodes') ||
             name.includes('whirly') || displayName.includes('whirly');
    case 'wurlitzer':
      return name.includes('wurlitzer') || displayName.includes('wurlitzer');
    case 'clavinet':
      return name.includes('clav') || displayName.includes('clav');
    
    // Guitar sub-categories
    case 'acoustic-guitars':
      return (name.includes('acoustic') || displayName.includes('acoustic')) && 
             (name.includes('guitar') || displayName.includes('guitar')) &&
             !name.includes('bass') && !displayName.includes('bass');
    case 'electric-guitars':
      return (name.includes('electric') || displayName.includes('electric')) && 
             (name.includes('guitar') || displayName.includes('guitar')) &&
             !name.includes('bass') && !displayName.includes('bass');
    case 'classical-guitars':
      return (name.includes('classical') || displayName.includes('classical')) ||
             (name.includes('nylon') || displayName.includes('nylon'));
    case 'bass-guitars':
      return (name.includes('bass') || displayName.includes('bass')) &&
             (name.includes('guitar') || displayName.includes('guitar'));
    
    // Brass sub-categories
    case 'trumpets':
      return name.includes('trumpet') || displayName.includes('trumpet');
    case 'trombones':
      return name.includes('trombone') || displayName.includes('trombone');
    case 'french-horns':
      return name.includes('horn') || displayName.includes('horn');
    case 'tubas':
      return name.includes('tuba') || displayName.includes('tuba');
    
    // Lead sub-categories
    case 'analog-leads':
      return name.includes('analog') || displayName.includes('analog');
    case 'digital-leads':
      return name.includes('digital') || displayName.includes('digital');
    case 'pluck-leads':
      return name.includes('pluck') || displayName.includes('pluck');
    case 'sequence-leads':
      return name.includes('sequence') || displayName.includes('sequence');
    
    // Organ sub-categories
    case 'hammond-organs':
      return name.includes('hammond') || displayName.includes('hammond');
    case 'church-organs':
      return name.includes('church') || displayName.includes('church');
    case 'electric-organs':
      return (name.includes('electric') || displayName.includes('electric')) && 
             (name.includes('organ') || displayName.includes('organ'));
    
    // Pad sub-categories
    case 'ambient-pads':
      return name.includes('ambient') || displayName.includes('ambient');
    case 'choir-pads':
      return name.includes('choir') || displayName.includes('choir');
    case 'string-pads':
      return name.includes('string') || displayName.includes('string');
    case 'warm-pads':
      return name.includes('warm') || displayName.includes('warm');
    
    // String sub-categories
    case 'violins':
      return name.includes('violin') || displayName.includes('violin');
    case 'violas':
      return name.includes('viola') || displayName.includes('viola');
    case 'cellos':
      return name.includes('cello') || displayName.includes('cello');
    case 'string-sections':
      return (name.includes('string') || displayName.includes('string')) &&
             (name.includes('section') || displayName.includes('section'));
    
    // Woodwind sub-categories
    case 'flutes':
      return name.includes('flute') || displayName.includes('flute');
    case 'clarinets':
      return name.includes('clarinet') || displayName.includes('clarinet');
    case 'saxophones':
      return name.includes('sax') || displayName.includes('sax');
    case 'oboes':
      return name.includes('oboe') || displayName.includes('oboe');
    
    // Misc sub-categories
    case 'percussion':
      return name.includes('perc') || displayName.includes('perc') ||
             name.includes('drum') || displayName.includes('drum') ||
             name.includes('timpani') || displayName.includes('timpani') ||
             name.includes('glock') || displayName.includes('glock') ||
             name.includes('xylophone') || displayName.includes('xylophone');
    case 'mallets':
      return name.includes('vibraphone') || displayName.includes('vibraphone') ||
             name.includes('marimba') || displayName.includes('marimba') ||
             name.includes('celesta') || displayName.includes('celesta') ||
             name.includes('glockenspiel') || displayName.includes('glockenspiel');
    case 'ethnic':
      return name.includes('sitar') || displayName.includes('sitar') ||
             name.includes('erhu') || displayName.includes('erhu') ||
             name.includes('didgeridoo') || displayName.includes('didgeridoo') ||
             name.includes('tabla') || displayName.includes('tabla');
    case 'sound-effects':
      return name.includes('fx') || displayName.includes('fx') ||
             name.includes('effect') || displayName.includes('effect') ||
             name.includes('sfx') || displayName.includes('sfx');
    case 'misc-other':
      return true; // Show all misc instruments that don't fit in other subcategories
    
    default:
      return false;
  }
};

export interface VirtualInstrumentsBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (instrumentId: string, displayName: string, storageKey?: string) => void;
  isAIAssistantOpen?: boolean;
  isOtherBottomSheetOpen?: boolean;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
}

export const VirtualInstrumentsBottomSheet = ({ isOpen, onClose, onSelect, isOtherBottomSheetOpen = false, isMinimized = false, onToggleMinimize }: VirtualInstrumentsBottomSheetProps) => {
  // Initialize with keyboards category as it's more likely to have instruments
  const [selectedCategory, setSelectedCategory] = useState('keyboards');
  const [selectedSubCategory, setSelectedSubCategory] = useState('grand-pianos');
  const [isSubCategoriesExpanded, setIsSubCategoriesExpanded] = useState(true);
  const [soundfonts, setSoundfonts] = useState<InstrumentFileRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Handle search mode
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
        setSelectedCategory('keyboards');
        setSelectedSubCategory('grand-pianos');
        setIsSubCategoriesExpanded(true);
      }
    }
  }, [searchQuery, selectedCategory]);

  // Fetch available soundfonts when the modal opens
  useEffect(() => {
    if (isOpen) {
      fetchSoundfonts();
    }
  }, [isOpen]);

  const fetchSoundfonts = async () => {
    try {
      setLoading(true);
      
      console.log('Fetching soundfonts...');
      const data = await getPublicSoundfonts();
      setSoundfonts(data);
      console.log('Fetched soundfonts:', data);
      console.log(`Total soundfonts loaded: ${data.length}`);
      
      // Log category breakdown
      const categoryBreakdown = data.reduce((acc: Record<string, number>, sf) => {
        acc[sf.category] = (acc[sf.category] || 0) + 1;
        return acc;
      }, {});
      console.log('Soundfonts by category:', categoryBreakdown);
      
      // Debug: Show how instruments are being categorized
      const displayCategoryBreakdown = data.reduce((acc: Record<string, number>, sf) => {
        const displayCat = getDisplayCategory(sf);
        acc[displayCat] = (acc[displayCat] || 0) + 1;
        return acc;
      }, {});
      console.log('Soundfonts by display category:', displayCategoryBreakdown);
      
      // Show samples that end up in misc
      const miscInstruments = data.filter(sf => getDisplayCategory(sf) === 'misc');
      if (miscInstruments.length > 0) {
        console.log('Instruments in misc category:', miscInstruments.slice(0, 10).map(sf => ({
          name: sf.display_name,
          category: sf.category,
          fileName: sf.file_name
        })));
      }
    } catch (err: unknown) {
      console.error('Error fetching soundfonts:', err);
      // Still set an empty array so the UI can show mock data
      setSoundfonts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInstrumentSelect = async (instrument: InstrumentFileRead) => {
    try {
      setDownloading(instrument.id);
      
      // If selecting from search results, navigate to the instrument's category
      if (selectedCategory === 'search-results') {
        const instrumentCategory = getDisplayCategory(instrument);
        setSelectedCategory(instrumentCategory);
        
        // Find matching subcategory
        const category = instrumentCategories.find(cat => cat.id === instrumentCategory);
        if (category?.subCategories) {
          // Check each subcategory to find a match
          let foundSubcategory = false;
          for (const subCat of category.subCategories) {
            if (!subCat.id.endsWith('-misc') && matchesSubcategory(instrument, subCat.id)) {
              setSelectedSubCategory(subCat.id);
              foundSubcategory = true;
              break;
            }
          }
          
          // If no specific subcategory matches, use misc
          if (!foundSubcategory) {
            setSelectedSubCategory(`${instrumentCategory}-misc`);
          }
        }
        
        // Clear search and show subcategories
        setSearchQuery('');
        setIsSearching(false);
        setIsSubCategoriesExpanded(true);
      }
      
      // If it's a real soundfont from the API
      if (instrument.storage_key) {
        const soundfontManager = SoundfontManager.getInstance(db);
        const isCached = await soundfontManager.isSoundfontCached(instrument.id);
        
        if (!isCached) {
          const displayName = getInstrumentDisplayName(instrument);
          console.log(`Downloading soundfont: ${displayName}`);
          await soundfontManager.getSoundfont(instrument.id);
          console.log(`Soundfont ${displayName} successfully stored`);
        } else {
          const displayName = getInstrumentDisplayName(instrument);
          console.log(`Soundfont ${displayName} already in cache`);
        }
        
        onSelect(instrument.id, getInstrumentDisplayName(instrument), instrument.storage_key);
      } else {
        // Mock instrument selection
        onSelect(instrument.id, getInstrumentDisplayName(instrument));
      }
      
      // Don't close the modal after selection - keep it open for more selections
    } catch (err: unknown) {
      console.error('Error processing soundfont:', err);
    } finally {
      setDownloading(null);
    }
  };

  const toggleSubCategories = () => {
    setIsSubCategoriesExpanded(!isSubCategoriesExpanded);
  };

  const toggleFavorite = (instrumentId: string) => {
    setFavorites(prev => {
      const newFavorites = new Set(prev);
      if (newFavorites.has(instrumentId)) {
        newFavorites.delete(instrumentId);
        // TODO: API call to remove from favorites
        console.log('Removed from favorites:', instrumentId);
      } else {
        newFavorites.add(instrumentId);
        // TODO: API call to add to favorites
        console.log('Added to favorites:', instrumentId);
      }
      return newFavorites;
    });
  };

  const getCurrentInstruments = () => {
    console.log('getCurrentInstruments called:', {
      selectedCategory,
      selectedSubCategory,
      totalSoundfonts: soundfonts.length,
      isSearching,
      searchQuery
    });

    // If we're in search mode, return search results
    if (selectedCategory === 'search-results' && searchQuery) {
      const query = searchQuery.toLowerCase();
      
      // Search through real soundfonts
      const matchingRealInstruments = soundfonts.filter(sf => 
        getInstrumentDisplayName(sf).toLowerCase().includes(query)
      );
      
      // Search through all mock instruments
      const allMockInstruments = Object.values(mockInstruments).flat() as MockInstrument[];
      const matchingMockInstruments = allMockInstruments.filter(instrument =>
        getInstrumentDisplayName(instrument).toLowerCase().includes(query)
      );
      
      const result = [...matchingRealInstruments, ...matchingMockInstruments];
      console.log('Search results:', result.length);
      return result;
    }

    // Handle favorites category
    if (selectedCategory === 'favorites') {
      // Filter both real soundfonts and mock data for favorites
      const favoritedRealInstruments = soundfonts.filter(sf => favorites.has(sf.id));
      const favoritedMockInstruments = Object.values(mockInstruments)
        .flat()
        .filter(instrument => favorites.has(instrument.id));
      
      const result = [...favoritedRealInstruments, ...favoritedMockInstruments];
      console.log('Favorites result:', result.length);
      return result;
    }

    // First try to get real soundfonts filtered by category
    const realInstruments = soundfonts.filter(sf => {
      const instrumentCategory = getDisplayCategory(sf);
      return instrumentCategory === selectedCategory;
    });
    
    console.log(`Real instruments for category '${selectedCategory}':`, realInstruments.length);
    
    if (realInstruments.length > 0) {
      // Filter by sub-category based on instrument name/properties
      const filteredBySubCategory = realInstruments.filter(instrument => {
        const displayName = getInstrumentDisplayName(instrument).toLowerCase();
        const name = displayName; // For real instruments, use display name
        
        switch(selectedSubCategory) {
          // Bass sub-categories
          case 'electric-bass':
            return (name.includes('bass') || displayName.includes('bass')) && 
                   (name.includes('electric') || displayName.includes('electric'));
          case 'sub-bass':
            return (name.includes('sub') || displayName.includes('sub')) ||
                   (name.includes('808') || displayName.includes('808'));
          case 'synth-bass':
            return (name.includes('synth') || displayName.includes('synth')) && 
                   (name.includes('bass') || displayName.includes('bass'));
          case 'upright-bass':
            return (name.includes('upright') || displayName.includes('upright')) ||
                   ((name.includes('acoustic') || displayName.includes('acoustic')) && 
                    (name.includes('bass') || displayName.includes('bass')));
          
          // Keyboard sub-categories
          case 'grand-pianos':
            return name.includes('grand') || displayName.includes('grand');
          case 'upright-pianos':
            return (name.includes('upright') || displayName.includes('upright')) ||
                   ((name.includes('piano') || displayName.includes('piano')) && 
                    !name.includes('electric') && !displayName.includes('electric') && 
                    !name.includes('grand') && !displayName.includes('grand'));
          case 'electric-pianos':
            return (name.includes('electric') || displayName.includes('electric')) && 
                   (name.includes('piano') || displayName.includes('piano'));
          case 'rhodes':
            return name.includes('rhodes') || displayName.includes('rhodes') ||
                   name.includes('whirly') || displayName.includes('whirly');
          case 'wurlitzer':
            return name.includes('wurlitzer') || displayName.includes('wurlitzer');
          case 'clavinet':
            return name.includes('clav') || displayName.includes('clav');
          
          // Guitar sub-categories
          case 'acoustic-guitars':
            return (name.includes('acoustic') || displayName.includes('acoustic')) && 
                   (name.includes('guitar') || displayName.includes('guitar')) &&
                   !name.includes('bass') && !displayName.includes('bass');
          case 'electric-guitars':
            return (name.includes('electric') || displayName.includes('electric')) && 
                   (name.includes('guitar') || displayName.includes('guitar')) &&
                   !name.includes('bass') && !displayName.includes('bass');
          case 'classical-guitars':
            return (name.includes('classical') || displayName.includes('classical')) ||
                   (name.includes('nylon') || displayName.includes('nylon'));
          case 'bass-guitars':
            return (name.includes('bass') || displayName.includes('bass')) &&
                   (name.includes('guitar') || displayName.includes('guitar'));
          
          // Brass sub-categories
          case 'trumpets':
            return name.includes('trumpet') || displayName.includes('trumpet');
          case 'trombones':
            return name.includes('trombone') || displayName.includes('trombone');
          case 'french-horns':
            return name.includes('horn') || displayName.includes('horn');
          case 'tubas':
            return name.includes('tuba') || displayName.includes('tuba');
          
          // Lead sub-categories
          case 'analog-leads':
            return name.includes('analog') || displayName.includes('analog');
          case 'digital-leads':
            return name.includes('digital') || displayName.includes('digital');
          case 'pluck-leads':
            return name.includes('pluck') || displayName.includes('pluck');
          case 'sequence-leads':
            return name.includes('sequence') || displayName.includes('sequence');
          
          // Organ sub-categories
          case 'hammond-organs':
            return name.includes('hammond') || displayName.includes('hammond');
          case 'church-organs':
            return name.includes('church') || displayName.includes('church');
          case 'electric-organs':
            return (name.includes('electric') || displayName.includes('electric')) && 
                   (name.includes('organ') || displayName.includes('organ'));
          
          // Pad sub-categories
          case 'ambient-pads':
            return name.includes('ambient') || displayName.includes('ambient');
          case 'choir-pads':
            return name.includes('choir') || displayName.includes('choir');
          case 'string-pads':
            return name.includes('string') || displayName.includes('string');
          case 'warm-pads':
            return name.includes('warm') || displayName.includes('warm');
          
          // String sub-categories
          case 'violins':
            return name.includes('violin') || displayName.includes('violin');
          case 'violas':
            return name.includes('viola') || displayName.includes('viola');
          case 'cellos':
            return name.includes('cello') || displayName.includes('cello');
          case 'string-sections':
            return (name.includes('string') || displayName.includes('string')) &&
                   (name.includes('section') || displayName.includes('section'));
          
          // Woodwind sub-categories
          case 'flutes':
            return name.includes('flute') || displayName.includes('flute');
          case 'clarinets':
            return name.includes('clarinet') || displayName.includes('clarinet');
          case 'saxophones':
            return name.includes('sax') || displayName.includes('sax');
          case 'oboes':
            return name.includes('oboe') || displayName.includes('oboe');
          
          // Misc sub-categories
          case 'percussion':
            return name.includes('perc') || displayName.includes('perc') ||
                   name.includes('drum') || displayName.includes('drum') ||
                   name.includes('timpani') || displayName.includes('timpani') ||
                   name.includes('glock') || displayName.includes('glock') ||
                   name.includes('xylophone') || displayName.includes('xylophone');
          case 'mallets':
            return name.includes('vibraphone') || displayName.includes('vibraphone') ||
                   name.includes('marimba') || displayName.includes('marimba') ||
                   name.includes('celesta') || displayName.includes('celesta') ||
                   name.includes('glockenspiel') || displayName.includes('glockenspiel');
          case 'ethnic':
            return name.includes('sitar') || displayName.includes('sitar') ||
                   name.includes('erhu') || displayName.includes('erhu') ||
                   name.includes('didgeridoo') || displayName.includes('didgeridoo') ||
                   name.includes('tabla') || displayName.includes('tabla');
          case 'sound-effects':
            return name.includes('fx') || displayName.includes('fx') ||
                   name.includes('effect') || displayName.includes('effect') ||
                   name.includes('sfx') || displayName.includes('sfx');
          case 'misc-other':
            return true; // Show all misc instruments that don't fit in other subcategories
          
          // Misc sub-categories for other main categories - show instruments that don't match any specific filters
          case 'bass-misc':
            return !(
              ((name.includes('bass') || displayName.includes('bass')) && (name.includes('electric') || displayName.includes('electric'))) ||
              ((name.includes('sub') || displayName.includes('sub')) || (name.includes('808') || displayName.includes('808'))) ||
              ((name.includes('synth') || displayName.includes('synth')) && (name.includes('bass') || displayName.includes('bass'))) ||
              ((name.includes('upright') || displayName.includes('upright')) || ((name.includes('acoustic') || displayName.includes('acoustic')) && (name.includes('bass') || displayName.includes('bass'))))
            );
          case 'brass-misc':
            return !(
              (name.includes('trumpet') || displayName.includes('trumpet')) ||
              (name.includes('trombone') || displayName.includes('trombone')) ||
              (name.includes('horn') || displayName.includes('horn')) ||
              (name.includes('tuba') || displayName.includes('tuba'))
            );
          case 'guitars-misc':
            return !(
              ((name.includes('acoustic') || displayName.includes('acoustic')) && (name.includes('guitar') || displayName.includes('guitar')) && !name.includes('bass') && !displayName.includes('bass')) ||
              ((name.includes('electric') || displayName.includes('electric')) && (name.includes('guitar') || displayName.includes('guitar')) && !name.includes('bass') && !displayName.includes('bass')) ||
              ((name.includes('classical') || displayName.includes('classical')) || (name.includes('nylon') || displayName.includes('nylon'))) ||
              ((name.includes('bass') || displayName.includes('bass')) && (name.includes('guitar') || displayName.includes('guitar')))
            );
          case 'keyboards-misc':
            return !(
              (name.includes('clav') || displayName.includes('clav')) ||
              ((name.includes('electric') || displayName.includes('electric')) && (name.includes('piano') || displayName.includes('piano'))) ||
              (name.includes('grand') || displayName.includes('grand')) ||
              (name.includes('rhodes') || displayName.includes('rhodes') || name.includes('whirly') || displayName.includes('whirly')) ||
              ((name.includes('upright') || displayName.includes('upright')) || ((name.includes('piano') || displayName.includes('piano')) && !name.includes('electric') && !displayName.includes('electric') && !name.includes('grand') && !displayName.includes('grand'))) ||
              (name.includes('wurlitzer') || displayName.includes('wurlitzer'))
            );
          case 'leads-misc':
            return !(
              (name.includes('analog') || displayName.includes('analog')) ||
              (name.includes('digital') || displayName.includes('digital')) ||
              (name.includes('pluck') || displayName.includes('pluck')) ||
              (name.includes('sequence') || displayName.includes('sequence'))
            );
          case 'organs-misc':
            return !(
              (name.includes('hammond') || displayName.includes('hammond')) ||
              (name.includes('church') || displayName.includes('church')) ||
              ((name.includes('electric') || displayName.includes('electric')) && (name.includes('organ') || displayName.includes('organ')))
            );
          case 'pads-misc':
            return !(
              (name.includes('ambient') || displayName.includes('ambient')) ||
              (name.includes('choir') || displayName.includes('choir')) ||
              (name.includes('string') || displayName.includes('string')) ||
              (name.includes('warm') || displayName.includes('warm'))
            );
          case 'strings-misc':
            return !(
              (name.includes('violin') || displayName.includes('violin')) ||
              (name.includes('viola') || displayName.includes('viola')) ||
              (name.includes('cello') || displayName.includes('cello')) ||
              ((name.includes('string') || displayName.includes('string')) && (name.includes('section') || displayName.includes('section')))
            );
          case 'woodwinds-misc':
            return !(
              (name.includes('flute') || displayName.includes('flute')) ||
              (name.includes('clarinet') || displayName.includes('clarinet')) ||
              (name.includes('sax') || displayName.includes('sax')) ||
              (name.includes('oboe') || displayName.includes('oboe'))
            );
          
          default:
            return true; // Show all if no specific filter
        }
      });
      
      // Return filtered results if any, otherwise return all real instruments for the category
      const finalResult = filteredBySubCategory.length > 0 ? filteredBySubCategory : realInstruments;
      
      console.log(`Filtered by subcategory '${selectedSubCategory}':`, filteredBySubCategory.length);
      console.log('Returning real instruments:', finalResult.length);
      return finalResult;
    }
    
    // Special handling for 'misc' category - include uncategorized instruments
    if (selectedCategory === 'misc') {
      const uncategorizedInstruments = soundfonts.filter(sf => 
        getDisplayCategory(sf) === 'misc'
      );
      console.log('Misc category instruments:', uncategorizedInstruments.length);
      return uncategorizedInstruments;
    }
    
    // Fallback to mock data - now organized by sub-category
    const mockResult = mockInstruments[selectedSubCategory as keyof typeof mockInstruments] || 
           mockInstruments[selectedCategory as keyof typeof mockInstruments] || [];
    
    console.log('No real instruments found, using mock data:', mockResult.length);
    return mockResult;
  };

  const selectedCategoryData = instrumentCategories.find(cat => cat.id === selectedCategory);
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
            <h2 className="text-lg font-semibold text-white whitespace-nowrap">Choose Virtual Instrument</h2>
            {selectedCategory === 'search-results' ? (
              <div className="flex items-center space-x-2 text-sm">
                <span className="text-gray-500">•</span>
                <span className="text-gray-300 font-medium">Search Results</span>
              </div>
            ) : selectedCategoryData && (
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
            )}
          </div>
          <div className="flex items-center space-x-3 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
              <Input
                type="text"
                placeholder="Search instruments..."
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
                  {instrumentCategories.map((category) => {
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
                            // If clicking the already selected category, toggle sub-categories
                            if (category.id !== 'favorites') {
                              toggleSubCategories();
                            }
                          } else {
                            // If selecting a new category, select it and expand sub-categories
                            // Clear search if it's active
                            if (searchQuery) {
                              setSearchQuery('');
                              setIsSearching(false);
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
            
            {/* Right Panel - Instruments */}
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
                      <div className="text-gray-400">Loading instruments...</div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                      {getCurrentInstruments().map((instrument: InstrumentFileRead) => {
                        const isDownloading = downloading === instrument.id;
                        
                        return (
                          <div
                            key={instrument.id}
                            className="group relative bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-750 transition-all duration-200 hover:border-gray-500"
                            title={instrument.description || `${instrument.category} instrument`}
                          >
                            <div className="p-3">
                              <div className="flex items-center justify-between mb-2">
                                {/* Instrument Name */}
                                <div className="flex-1 mr-2 min-w-0">
                                  <h4 className="font-medium text-white text-sm truncate w-full">
                                    {getInstrumentDisplayName(instrument)}
                                  </h4>
                                  {selectedCategory === 'search-results' && (
                                    <div className="text-xs text-gray-500 truncate w-full">
                                      {getDisplayCategory(instrument)}
                                    </div>
                                  )}
                                </div>
                                
                                <div className="flex items-center gap-1">
                                  {/* Favorite Heart Button */}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs px-1 py-1 h-6 w-6 hover:bg-gray-600 flex-shrink-0"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleFavorite(instrument.id);
                                    }}
                                  >
                                    <Heart 
                                      className={cn(
                                        "h-3 w-3 transition-colors",
                                        favorites.has(instrument.id) 
                                          ? "fill-red-500 text-red-500" 
                                          : "text-gray-400 hover:text-red-400"
                                      )} 
                                    />
                                  </Button>
                                  
                                  {/* Add Button */}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs px-2 py-1 h-6 bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-gray-500 text-gray-300 hover:text-white flex-shrink-0 min-w-[40px]"
                                    onClick={() => !isDownloading && handleInstrumentSelect(instrument)}
                                    disabled={isDownloading}
                                  >
                                    {isDownloading ? (
                                      <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                      '+'
                                    )}
                                  </Button>
                                </div>
                              </div>
                              
                              {/* Play Button */}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full h-8 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  console.log('Preview:', instrument.name);
                                }}
                              >
                                <Play className="h-3 w-3 mr-2" />
                                Preview
                              </Button>
                            </div>
                            
                            {/* Hover Tooltip */}
                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 whitespace-nowrap border border-gray-600">
                              {instrument.description || `${instrument.category} instrument`}
                              <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                            </div>
                          </div>
                        );
                      })}
                      
                      {getCurrentInstruments().length === 0 && !loading && (
                        <div className="col-span-full text-center py-8 text-gray-400">
                          No instruments found in this category
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