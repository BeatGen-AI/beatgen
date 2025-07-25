import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  X, Play, ChevronUp, ChevronDown, ChevronRight, Heart, Search,
  Zap, Waves, Music2, Home, Cog, Mic, Guitar, Globe, VolumeX, Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DrumSamplePublicRead } from '../../../../platform/types/dto/public_models/drum_samples';

import { prettyPrint } from '../../../../utils/pretty_print';

// Genre-based categories with nested structure
const genreCategories = [
  { 
    id: 'favorites', 
    name: 'Favorites', 
    icon: Heart,
    isExpandable: false,
    subCategories: []
  },
  {
    id: 'trap-hiphop',
    name: 'Trap & Hip-Hop',
    icon: Zap,
    isExpandable: true,
    subCategories: [
      { id: 'trap-hiphop-kits', name: 'Kits' },
      { id: 'trap-hiphop-oneshots', name: 'One Shots' }
    ]
  },
  {
    id: 'lofi-chill',
    name: 'Lo-Fi & Chill',
    icon: Waves,
    isExpandable: true,
    subCategories: [
      { id: 'lofi-chill-kits', name: 'Kits' },
      { id: 'lofi-chill-oneshots', name: 'One Shots' }
    ]
  },
  {
    id: 'edm',
    name: 'EDM',
    icon: Music2,
    isExpandable: true,
    subCategories: [
      { id: 'edm-kits', name: 'Kits' },
      { id: 'edm-oneshots', name: 'One Shots' }
    ]
  },
  {
    id: 'house-dance',
    name: 'House & Dance',
    icon: Home,
    isExpandable: true,
    subCategories: [
      { id: 'house-dance-kits', name: 'Kits' },
      { id: 'house-dance-oneshots', name: 'One Shots' }
    ]
  },
  {
    id: 'techno-industrial',
    name: 'Techno & Industrial',
    icon: Cog,
    isExpandable: true,
    subCategories: [
      { id: 'techno-industrial-kits', name: 'Kits' },
      { id: 'techno-industrial-oneshots', name: 'One Shots' }
    ]
  },
  {
    id: 'pop-indie',
    name: 'Pop & Indie',
    icon: Mic,
    isExpandable: true,
    subCategories: [
      { id: 'pop-indie-kits', name: 'Kits' },
      { id: 'pop-indie-oneshots', name: 'One Shots' }
    ]
  },
  {
    id: 'rock-live',
    name: 'Rock & Live',
    icon: Guitar,
    isExpandable: true,
    subCategories: [
      { id: 'rock-live-kits', name: 'Kits' },
      { id: 'rock-live-oneshots', name: 'One Shots' }
    ]
  },
  {
    id: 'latin-afrobeat',
    name: 'Latin & Afrobeat',
    icon: Globe,
    isExpandable: true,
    subCategories: [
      { id: 'latin-afrobeat-kits', name: 'Kits' },
      { id: 'latin-afrobeat-oneshots', name: 'One Shots' }
    ]
  }
];

// Drum types for one-shots
const drumTypes = [
  { id: 'kicks', name: 'Kicks' },
  { id: 'snares', name: 'Snares' },
  { id: 'closed-hats', name: 'Closed Hat' },
  { id: 'open-hats', name: 'Open Hat' },
  { id: 'cymbals', name: 'Cymbals' },
  { id: 'percs', name: 'Percs' },
  { id: 'misc', name: 'Misc' },
  { id: 'fx', name: 'FX' }
];

// Genre patterns for detection
const GENRE_PATTERNS: Record<string, RegExp[]> = {
  'trap-hiphop': [
    /\b(trap|hip[\s-]*hop|rap|drill|bounce|phonk|memphis)\b/i,
    /\b(808|sub|bass|boom|bap)\b/i
  ],
  'lofi-chill': [
    /\b(lo[\s-]*fi|lofi|chill|ambient|downtempo|study|relax)\b/i,
    /\b(vinyl|tape|analog|warm|soft)\b/i
  ],
  'edm': [
    /\b(edm|electronic|dance|festival|big[\s-]*room|progressive)\b/i,
    /\b(drop|build|synth|laser|sweep)\b/i
  ],
  'house-dance': [
    /\b(house|deep[\s-]*house|tech[\s-]*house|garage|disco|funk)\b/i,
    /\b(four[\s-]*on[\s-]*floor|groove|shuffle|swing)\b/i
  ],
  'techno-industrial': [
    /\b(techno|industrial|minimal|acid|hardcore|gabber)\b/i,
    /\b(dark|heavy|hard|distort|noise)\b/i
  ],
  'pop-indie': [
    /\b(pop|indie|alternative|singer[\s-]*songwriter|acoustic)\b/i,
    /\b(clean|bright|crisp|modern|radio)\b/i
  ],
  'rock-live': [
    /\b(rock|live|band|acoustic|organic|natural)\b/i,
    /\b(studio|room|overhead|ambient|mic)\b/i
  ],
  'latin-afrobeat': [
    /\b(latin|afro|samba|bossa|reggae|caribbean|world)\b/i,
    /\b(conga|bongo|shaker|perc|ethnic|tribal)\b/i
  ]
};

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
  'kick drum': 'kicks',
  'base_drum': 'kicks',
  'base drum': 'kicks',
  'bass_kick': 'kicks',
  'bass kick': 'kicks',
  '808_kick': 'kicks',
  '808 kick': 'kicks',
  'trap_kick': 'kicks',
  'trap kick': 'kicks',
  'heavy_kick': 'kicks',
  'heavy kick': 'kicks',
  'deep_kick': 'kicks',
  'deep kick': 'kicks',
  'punch_kick': 'kicks',
  'punch kick': 'kicks',
  'hard_kick': 'kicks',
  'hard kick': 'kicks',
  'soft_kick': 'kicks',
  'soft kick': 'kicks',
  'light_kick': 'kicks',
  'light kick': 'kicks',
  
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
  '808_bass': 'kicks',
  'sub': '808s',
  'sub_bass': '808s',
  
  // Generic mappings (removed 'perc' to allow pattern matching)
  'percussion': 'percussion-misc',
  'misc': 'drums-misc',
  'fx': 'electronic-misc',
  'effect': 'electronic-misc',
  'sfx': 'electronic-misc',
};




// Enhanced categorization with genre and type detection
interface SampleCategorization {
  genre: string;
  isKit: boolean;
  drumType: string;
}

function categorizeSample(sample: DrumSamplePublicRead): SampleCategorization {
  // Build search text from all available fields
  const fileName = (sample.file_name || '').toLowerCase();
  const displayName = (sample.display_name || '').toLowerCase();
  const category = (sample.category || '').toLowerCase();
  const kitName = (sample.kit_name || '').toLowerCase();
  const description = (sample.description || '').toLowerCase();
  const genre = (sample.genre || '').toLowerCase();
  
  const searchText = `${fileName} ${displayName} ${category} ${kitName} ${description} ${genre}`;
  
  // Detect if it's a kit or one-shot - be more restrictive for kits
  // Only mark as kit if explicitly mentioned as a full kit/loop/pattern
  const isKit = /\b(kit|full[\s-]*kit|drum[\s-]*kit|drumkit|loop|pattern|sequence|beat|rhythm|full[\s-]*drum)\b/i.test(searchText) &&
    !/\b(one[\s-]*shot|oneshot|single|hit|sample)\b/i.test(searchText);
  
  // Most individual drum samples are one-shots by default
  const actualIsKit = isKit;
  
  // Detect genre using patterns
  let detectedGenre = 'trap-hiphop'; // default
  let maxScore = 0;
  
  for (const [genreId, patterns] of Object.entries(GENRE_PATTERNS)) {
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(searchText)) {
        score += 1;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      detectedGenre = genreId;
    }
  }
  
  // Detect drum type (for one-shots) - improved mapping
  let drumType = 'misc';
  
  // Enhanced drum type detection with better patterns
  if (/\b(kick|kicks|bd|bass[\s-]*drum|bassdrum|kik|kck|bdrum|base[\s-]*drum)\b/i.test(searchText)) {
    drumType = 'kicks';
  }
  else if (/\b(snare|snares|snr|sd|rim|rimshot|side[\s-]*stick)\b/i.test(searchText)) {
    drumType = 'snares';
  }
  else if (/\b(open[\s-]*hat|open[\s-]*hihat|oh|oph)\b/i.test(searchText) || (/\bopen\b/i.test(searchText) && /\b(hat|hihat|hh)\b/i.test(searchText))) {
    drumType = 'open-hats';
  }
  else if (/\b(hihat|hi[\s-]*hat|hh|hat|hats|closed[\s-]*hat|ch|clh)\b/i.test(searchText)) {
    drumType = 'closed-hats';
  }
  else if (/\b(crash|ride|cymbal|cymbals|cym|splash|china|bell)\b/i.test(searchText)) {
    drumType = 'cymbals';
  }
  else if (/\b(clap|handclap|claps|snap|finger[\s-]*snap|snaps|shak|shaker|maraca|tamb|tambourine|jingle|perc|percussion)\b/i.test(searchText)) {
    drumType = 'percs';
  }
  else if (/\b(fx|effect|effects|sweep|noise|reverse|vocal|stab|riser|impact|transition)\b/i.test(searchText)) {
    drumType = 'fx';
  }
  else if (/\b(tom|toms|floor[\s-]*tom|rack[\s-]*tom|high[\s-]*tom|mid[\s-]*tom|low[\s-]*tom)\b/i.test(searchText)) {
    drumType = 'misc'; // toms go to misc
  }
  
  // Try API category mapping as fallback
  if (drumType === 'misc') {
    const normalizedCategory = category.trim().replace(/[\s_-]+/g, '_');
    if (API_CATEGORY_MAP[normalizedCategory]) {
      const mapped = API_CATEGORY_MAP[normalizedCategory];
      if (mapped === 'kicks') drumType = 'kicks';
      else if (mapped === 'snares') drumType = 'snares';
      else if (mapped === 'hi-hats') {
        // Check if it's specifically open or closed
        if (/\bopen/i.test(searchText)) drumType = 'open-hats';
        else drumType = 'closed-hats'; // default to closed
      }
      else if (mapped === 'cymbals') drumType = 'cymbals';
      else if (['claps', 'snaps', 'shakers', 'tambourines'].includes(mapped)) drumType = 'percs';
    }
  }
  
  return {
    genre: detectedGenre,
    isKit: actualIsKit,
    drumType
  };
}




export interface DrumMachineBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSelection: (selectedSamples: DrumSamplePublicRead[]) => void;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
  height?: number;
  onHeightChange?: (height: number) => void;
  drumSamples?: DrumSamplePublicRead[];
  drumSamplesLoading?: boolean;
  isAIAssistantOpen?: boolean;
}

export const DrumMachineBottomSheet = ({ isOpen, onClose, onConfirmSelection, isMinimized = false, onToggleMinimize, height = 400, onHeightChange, drumSamples = [], drumSamplesLoading = false, isAIAssistantOpen = false }: DrumMachineBottomSheetProps) => {
  const [selectedGenre, setSelectedGenre] = useState('trap-hiphop');
  const [selectedType, setSelectedType] = useState('trap-hiphop-oneshots'); // kits or oneshots
  const [selectedDrumType, setSelectedDrumType] = useState('kicks'); // for oneshots only
  const [expandedGenres, setExpandedGenres] = useState<Set<string>>(new Set(['trap-hiphop']));
  
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [selectedSampleIds, setSelectedSampleIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  
  // Handle resize functionality
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    
    const startY = e.clientY;
    const startHeight = height;
    let currentHeight = startHeight;
    
    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = startY - e.clientY; // Negative because we're dragging up
      const newHeight = Math.max(60, Math.min(window.innerHeight * 0.9, startHeight + deltaY));
      currentHeight = newHeight;
      onHeightChange?.(newHeight);
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // Auto-collapse if dragged down to minimum height
      if (currentHeight <= 60) {
        onToggleMinimize?.();
        // Reset to default height for next expand
        onHeightChange?.(window.innerHeight * 0.4); // 40vh
      }
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Handle search state
  useEffect(() => {
    if (searchQuery.trim()) {
      setIsSearching(true);
      setSelectedGenre('search-results');
      setSelectedType('');
      setSelectedDrumType('');
    } else {
      setIsSearching(false);
      // Return to default when search is cleared
      if (selectedGenre === 'search-results') {
        setSelectedGenre('trap-hiphop');
        setSelectedType('trap-hiphop-oneshots');
        setSelectedDrumType('kicks');
      }
    }
  }, [searchQuery, selectedGenre]);

  // Debug drum samples when they change
  useEffect(() => {
    if (drumSamples.length > 0) {
      
      // Debug: Show what categories the API actually returns
      const apiCategories = new Set<string>();
      drumSamples.forEach(sample => {
        if (sample.category) {
          apiCategories.add(sample.category);
        }
      });
      
      // Analyze categorization with new structure
      const genreCounts = new Map<string, number>();
      const kitCounts = new Map<string, number>();
      const drumTypeCounts = new Map<string, number>();
      
      drumSamples.forEach(sample => {
        const categorization = categorizeSample(sample);
        genreCounts.set(categorization.genre, (genreCounts.get(categorization.genre) || 0) + 1);
        kitCounts.set(categorization.isKit ? 'kits' : 'oneshots', (kitCounts.get(categorization.isKit ? 'kits' : 'oneshots') || 0) + 1);
        drumTypeCounts.set(categorization.drumType, (drumTypeCounts.get(categorization.drumType) || 0) + 1);
      });
      
    }
  }, [drumSamples]);

  const handleToggleSelect = (sample: DrumSamplePublicRead) => {
    // If selecting from search results, navigate to the sample's category
    if (selectedGenre === 'search-results') {
      const categorization = categorizeSample(sample);
      setSelectedGenre(categorization.genre);
      setSelectedType(categorization.isKit ? `${categorization.genre}-kits` : `${categorization.genre}-oneshots`);
      if (!categorization.isKit) {
        setSelectedDrumType(categorization.drumType);
      }
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
    // Get selected real samples only
    const selectedRealSamples = drumSamples.filter(sample => selectedSampleIds.has(sample.id));
    
    if (selectedRealSamples.length > 0) {
      onConfirmSelection(selectedRealSamples);
      onClose();
    }
  };


  const toggleFavorite = (sampleId: string) => {
    setFavorites(prev => {
      const newFavorites = new Set(prev);
      if (newFavorites.has(sampleId)) {
        newFavorites.delete(sampleId);
      } else {
        newFavorites.add(sampleId);
      }
      return newFavorites;
    });
  };


  const getCurrentSamples = useMemo(() => {

    // If we're in search mode, return all matching samples
    if (selectedGenre === 'search-results' && searchQuery) {
      const query = searchQuery.toLowerCase();
      
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
      
      return matchingRealSamples;
    }

    // Handle favorites
    if (selectedGenre === 'favorites') {
      const favoritedRealSamples = drumSamples.filter(sample => favorites.has(sample.id));
      return favoritedRealSamples;
    }

    // Filter samples based on the current selection
    
    let filteredSamples = drumSamples.filter(sample => {
      const categorization = categorizeSample(sample);
      
      // Check genre match
      if (categorization.genre !== selectedGenre) {
        return false;
      }
      
      // Check kit/oneshot type match
      if (selectedType) {
        const isKitSelection = selectedType.endsWith('-kits');
        if (isKitSelection !== categorization.isKit) {
          return false;
        }
      }
      
      // For oneshot selections, also check drum type
      if (selectedType?.endsWith('-oneshots') && selectedDrumType) {
        if (categorization.drumType !== selectedDrumType) {
          return false;
        }
      }
      
      return true;
    });

    
    return filteredSamples;
  }, [drumSamples, selectedGenre, selectedType, selectedDrumType, favorites, searchQuery, isSearching]);

  // Responsive grid columns based on AI Assistant state and item count
  const gridColumns = useMemo(() => {
    const itemCount = getCurrentSamples.length;
    
    if (isAIAssistantOpen) {
      // When AI Assistant is open (350px less width), adjust based on item count
      if (itemCount === 1) {
        return "grid-cols-1";
      } else if (itemCount === 2) {
        return "grid-cols-2";
      } else if (itemCount === 3) {
        return "grid-cols-3";
      }
      // For more items, use responsive breakpoints with fewer columns
      return "grid-cols-2 sm:grid-cols-2 md:grid-cols-3";
    }
    
    // When AI Assistant is closed, use full responsive grid
    if (itemCount === 1) {
      return "grid-cols-1";
    } else if (itemCount === 2) {
      return "grid-cols-2";
    } else if (itemCount === 3) {
      return "grid-cols-3";
    } else if (itemCount <= 4) {
      return "grid-cols-2 sm:grid-cols-3 md:grid-cols-4";
    } else if (itemCount <= 5) {
      return "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";
    }
    // For many items, use full responsive grid
    return "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
  }, [isAIAssistantOpen, getCurrentSamples]);

  const selectedGenreData = genreCategories.find(genre => genre.id === selectedGenre);
  const selectedTypeData = selectedGenreData?.subCategories?.find(sub => sub.id === selectedType);
  const selectedDrumTypeData = drumTypes.find(type => type.id === selectedDrumType);

  if (!isOpen) return null;

  return (
    <div 
      className={cn(
        "flex flex-col rounded-2xl overflow-hidden",
        isMinimized ? "flex-shrink-0" : "flex-1"
      )}
      style={{ 
        backgroundColor: '#1f1f1f',
        border: '1px solid #9cc8f5',
        height: isMinimized ? '60px' : '100%',
        minHeight: '60px'
      }}
    >
        {/* Resize Handle */}
        {!isMinimized && (
          <div 
            className="h-1 cursor-ns-resize transition-colors"
            style={{
              backgroundColor: isResizing ? '#9cc8f5' : '#3a3a3a',
            }}
            onMouseDown={handleMouseDown}
            onMouseEnter={(e) => {
              if (!isResizing) e.currentTarget.style.backgroundColor = '#9cc8f5';
            }}
            onMouseLeave={(e) => {
              if (!isResizing) e.currentTarget.style.backgroundColor = '#3a3a3a';
            }}
            title="Drag to resize"
          />
        )}
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderBottomColor: '#1f1f1f', backgroundColor: '#1f1f1f' }}>
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            <h2 className="text-lg font-semibold whitespace-nowrap" style={{ color: '#ffffff' }}>Drum Samples</h2>
            <div className="flex items-center space-x-1 text-xs min-w-0">
              <span style={{ color: '#ffffff' }}>•</span>
              {selectedGenre === 'search-results' ? (
                <span className="font-medium truncate" style={{ color: '#ffffff' }}>Search</span>
              ) : selectedGenre === 'favorites' ? (
                <span className="font-medium truncate" style={{ color: '#ffffff' }}>Favorites</span>
              ) : (
                <div className="flex items-center space-x-1 min-w-0">
                  <span className="font-medium truncate" style={{ color: '#ffffff' }}>
                    {selectedGenreData?.name || 'Samples'}
                  </span>
                  {selectedTypeData && (
                    <>
                      <span style={{ color: '#ffffff' }}>{'>'}</span>
                      <span className="truncate" style={{ color: '#ffffff' }}>{selectedTypeData.name}</span>
                    </>
                  )}
                  {selectedDrumTypeData && selectedType?.endsWith('-oneshots') && (
                    <>
                      <span style={{ color: '#ffffff' }}>{'>'}</span>
                      <span className="truncate" style={{ color: '#ffffff' }}>{selectedDrumTypeData.name}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 z-10" style={{ color: '#ffffff' }} />
              <Input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => {
                  const newQuery = e.target.value;
                  setSearchQuery(newQuery);
                  
                  // Auto-expand if minimized and starting to search
                  if (newQuery && isMinimized) {
                    onToggleMinimize?.();
                  }
                }}
                className="pl-10 pr-8 py-2 w-48 text-sm rounded-lg shadow-sm transition-all duration-200"
                style={{
                  backgroundColor: '#262626',
                  borderColor: '#262626',
                  color: '#ffffff',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#9cc8f5';
                  e.currentTarget.style.boxShadow = '0 0 0 1px rgba(156, 200, 245, 0.2)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#1f1f1f';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                onMouseEnter={(e) => {
                  if (e.currentTarget !== document.activeElement) {
                    e.currentTarget.style.borderColor = '#9cc8f580';
                    e.currentTarget.style.backgroundColor = '#060606';
                  }
                }}
                onMouseLeave={(e) => {
                  if (e.currentTarget !== document.activeElement) {
                    e.currentTarget.style.borderColor = '#262626';
                    e.currentTarget.style.backgroundColor = '#262626';
                  }
                }}
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 rounded-md"
                  style={{ color: '#ffffff' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#9cc8f5';
                    e.currentTarget.style.backgroundColor = '#2a2a2a';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#ffffff';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
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
                className="text-white text-xs px-2 py-1 whitespace-nowrap"
                style={{
                  backgroundColor: '#9cc8f5',
                  borderColor: '#9cc8f5'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#060606';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#9cc8f5';
                }}
              >
                Confirm ({selectedSampleIds.size})
              </Button>
            )}
            
            <Button
                variant="ghost"
                size="sm"
                onClick={() => onToggleMinimize?.()}
                className="px-2 py-1"
                style={{ color: '#ffffff' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#9cc8f5';
                  e.currentTarget.style.backgroundColor = '#060606';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#ffffff';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
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
              className="px-1 py-1"
              style={{ color: '#ffffff' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#ef4444';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#ffffff';
              }}
              title="Close panel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content - Hidden when minimized */}
        {!isMinimized && (
          <div className="flex flex-1 min-h-0 px-2 pb-3 pt-1 gap-2">
            {/* Left Panel - Genres */}
            <div className="w-52 flex-shrink-0 flex flex-col rounded-lg overflow-hidden" style={{ border: '1px solid #9cc8f5', backgroundColor: '#262626' }}>
              <div className="text-xs font-medium mb-3 uppercase tracking-wider p-3 pb-0" style={{ color: '#ffffff', backgroundColor: '#262626' }}>
                Genres
              </div>
              
              <div 
                className="flex-1 overflow-y-auto px-3"
                style={{ 
                  backgroundColor: '#262626',
                  scrollbarWidth: 'thin', 
                  scrollbarColor: '#6B7280 #374151' 
                }}
              >
                <div className="space-y-1">
                  {genreCategories.map((genre) => {
                    const IconComponent = genre.icon;
                    const isGenreSelected = selectedGenre === genre.id;
                    const isExpanded = expandedGenres.has(genre.id);
                    
                    return (
                      <div key={genre.id}>
                        <Button
                          variant="ghost"
                          style={{
                            backgroundColor: isGenreSelected ? '#9cc8f5' : 'transparent',
                            color: isGenreSelected ? '#060606' : '#ffffff',
                            justifyContent: 'space-between',
                            display: 'flex'
                          }}
                          className="w-full text-left px-3 py-2 h-auto font-normal"
                          onMouseEnter={(e) => {
                            if (!isGenreSelected) {
                              e.currentTarget.style.color = '#9cc8f5';
                              e.currentTarget.style.backgroundColor = '#262626';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isGenreSelected) {
                              e.currentTarget.style.color = '#ffffff';
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }
                          }}
                          onClick={() => {
                            // Clear search if it's active
                            if (searchQuery) {
                              setSearchQuery('');
                            }
                            
                            if (genre.id === 'favorites') {
                              setSelectedGenre('favorites');
                              setSelectedType('');
                              setSelectedDrumType('');
                            } else {
                              // Toggle expansion
                              const newExpanded = new Set(expandedGenres);
                              if (isExpanded) {
                                newExpanded.delete(genre.id);
                              } else {
                                newExpanded.add(genre.id);
                              }
                              setExpandedGenres(newExpanded);
                              
                              // Set as selected genre
                              setSelectedGenre(genre.id);
                              // Default to oneshots if expanding
                              if (!isExpanded && genre.subCategories.length > 0) {
                                const oneshotsType = genre.subCategories.find(sub => sub.id.endsWith('-oneshots'));
                                setSelectedType(oneshotsType?.id || genre.subCategories[0].id);
                                setSelectedDrumType('kicks'); // Default drum type
                              }
                            }
                          }}
                        >
                          <div className="flex items-center flex-1 min-w-0">
                            <IconComponent className="h-4 w-4 mr-3 flex-shrink-0" />
                            <span className="truncate">{genre.name}</span>
                          </div>
                          {genre.isExpandable && (
                            <ChevronRight 
                              className={cn(
                                "h-4 w-4 transition-transform flex-shrink-0 ml-2",
                                isExpanded ? "rotate-90" : "",
                                isGenreSelected ? "text-white" : "text-gray-400"
                              )}
                            />
                          )}
                        </Button>
                        
                        {/* Sub-items (Kits/One Shots) */}
                        {genre.isExpandable && isExpanded && (
                          <div className="ml-6 space-y-1 mt-1">
                            {genre.subCategories.map((subItem) => {
                              const isSubSelected = selectedType === subItem.id;
                              
                              return (
                                <Button
                                  key={subItem.id}
                                  variant="ghost"
                                  style={{
                                    backgroundColor: isSubSelected ? '#9cc8f5' : 'transparent',
                                    color: isSubSelected ? '#060606' : '#ffffff'
                                  }}
                                  className="w-full justify-start text-left p-2 h-auto font-normal text-sm"
                                  onMouseEnter={(e) => {
                                    if (!isSubSelected) {
                                      e.currentTarget.style.backgroundColor = '#262626';
                                      e.currentTarget.style.color = '#9cc8f5';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!isSubSelected) {
                                      e.currentTarget.style.backgroundColor = 'transparent';
                                      e.currentTarget.style.color = '#ffffff';
                                    }
                                  }}
                                  onClick={() => {
                                    setSelectedType(subItem.id);
                                    if (subItem.id.endsWith('-oneshots')) {
                                      setSelectedDrumType('kicks'); // Default to kicks for oneshots
                                    } else {
                                      setSelectedDrumType(''); // Clear drum type for kits
                                    }
                                  }}
                                >
                                  {subItem.name}
                                </Button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            
            {/* Middle Panel - Drum Types (for One Shots only) */}
            {selectedType?.endsWith('-oneshots') && selectedGenre !== 'favorites' && selectedGenre !== 'search-results' && (
              <div className="w-52 flex-shrink-0 flex flex-col rounded-lg overflow-hidden" style={{ border: '1px solid #9cc8f5', backgroundColor: '#262626' }}>
                <div className="text-xs font-medium mb-3 uppercase tracking-wider p-3 pb-0" style={{ color: '#ffffff', backgroundColor: '#262626' }}>
                  Drum Types
                </div>
                
                <div 
                  className="flex-1 overflow-y-auto px-3"
                  style={{ 
                    scrollbarWidth: 'thin', 
                    scrollbarColor: '#6B7280 #374151' 
                  }}
                >
                  <div className="space-y-1">
                    {drumTypes.map((drumType) => {
                      const isDrumTypeSelected = selectedDrumType === drumType.id;
                      
                      return (
                        <Button
                          key={drumType.id}
                          variant="ghost"
                          style={{
                            backgroundColor: isDrumTypeSelected ? '#9cc8f5' : 'transparent',
                            color: isDrumTypeSelected ? '#060606' : '#ffffff'
                          }}
                          className="w-full justify-start text-left p-2 h-auto font-normal text-sm"
                          onMouseEnter={(e) => {
                            if (!isDrumTypeSelected) {
                              e.currentTarget.style.backgroundColor = '#262626';
                              e.currentTarget.style.color = '#9cc8f5';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isDrumTypeSelected) {
                              e.currentTarget.style.backgroundColor = 'transparent';
                              e.currentTarget.style.color = '#ffffff';
                            }
                          }}
                          onClick={() => setSelectedDrumType(drumType.id)}
                        >
                          {drumType.name}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            
            {/* Right Panel - Samples */}
            <div className="flex-1 flex flex-col min-w-0 rounded-lg overflow-hidden" style={{ border: '1px solid #9cc8f5', backgroundColor: '#262626' }}>
              
              <div 
                className="flex-1 overflow-y-auto min-h-0 pl-4 pr-0 pt-4"
                style={{ 
                  backgroundColor: '#262626',
                  scrollbarWidth: 'thin', 
                  scrollbarColor: '#9cc8f5 #262626'
                }}
              >
                <div className="pr-4 pb-3">
                  {drumSamplesLoading ? (
                    <div className="flex items-center justify-center h-32">
                      <div style={{ color: '#ffffff' }}>Loading samples...</div>
                    </div>
                  ) : (
                    <div className={`grid ${gridColumns} gap-2`}>
                      {getCurrentSamples.map((sample: DrumSamplePublicRead) => {
                        const isSelected = selectedSampleIds.has(sample.id);
                        const isFavorite = favorites.has(sample.id);
                        
                        return (
                          <div
                            key={sample.id}
                            className="group relative border rounded-lg transition-all duration-200 cursor-pointer"
                            style={{
                              backgroundColor: isSelected ? 'rgba(156, 200, 245, 0.2)' : '#1f1f1f',
                              borderColor: isSelected ? '#9cc8f5' : '#262626'
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.backgroundColor = '#060606';
                                e.currentTarget.style.borderColor = '#9cc8f5';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.backgroundColor = '#1f1f1f';
                                e.currentTarget.style.borderColor = '#262626';
                              }
                            }}
                            title={sample.display_name}
                          >
                            <div className="p-3">
                              {/* Top Row: Sample Name */}
                              <div className="mb-3">
                                <h4 className="font-medium text-sm truncate w-full text-center leading-tight" style={{ color: '#ffffff' }}>
                                  {sample.display_name}
                                </h4>
                                {selectedGenre === 'search-results' && (
                                  <div className="text-xs truncate w-full mt-1" style={{ color: '#ffffff', opacity: 0.7 }}>
                                    {(() => {
                                      const categorization = categorizeSample(sample);
                                      return `${categorization.genre} | ${categorization.isKit ? 'Kit' : 'One Shot'} | ${categorization.drumType}`;
                                    })()}
                                  </div>
                                )}
                              </div>
                              
                              {/* Second Row: Three Icon Buttons */}
                              <div className="flex items-center justify-center gap-2">
                                {/* Heart Button - Favorite */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 border flex-shrink-0 rounded-md"
                                  style={{
                                    backgroundColor: '#060606',
                                    borderColor: '#1f1f1f',
                                    color: isFavorite ? '#ef4444' : '#ffffff'
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isFavorite) {
                                      e.currentTarget.style.color = '#ef4444';
                                    }
                                    e.currentTarget.style.backgroundColor = '#262626';
                                    e.currentTarget.style.borderColor = '#9cc8f5';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.color = isFavorite ? '#ef4444' : '#ffffff';
                                    e.currentTarget.style.backgroundColor = '#060606';
                                    e.currentTarget.style.borderColor = '#1f1f1f';
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFavorite(sample.id);
                                  }}
                                  title="Add to favorites"
                                >
                                  <Heart 
                                    className="h-4 w-4"
                                    style={{
                                      fill: isFavorite ? '#ef4444' : 'none'
                                    }}
                                  />
                                </Button>
                                
                                {/* Mute Button - Preview (Coming Soon) */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled
                                  className="h-8 w-8 p-0 border flex-shrink-0 rounded-md cursor-not-allowed"
                                  style={{
                                    backgroundColor: '#060606',
                                    borderColor: '#1f1f1f',
                                    color: '#ffffff',
                                    opacity: 0.5
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                  }}
                                  title="Preview coming soon"
                                >
                                  <VolumeX className="h-4 w-4" />
                                </Button>
                                
                                {/* Plus Button - Add to Track */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 border flex-shrink-0 rounded-md"
                                  style={{
                                    backgroundColor: '#060606',
                                    borderColor: '#1f1f1f',
                                    color: '#ffffff'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#262626';
                                    e.currentTarget.style.borderColor = '#9cc8f5';
                                    e.currentTarget.style.color = '#9cc8f5';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = '#2a2a2a';
                                    e.currentTarget.style.borderColor = '#3a3a3a';
                                    e.currentTarget.style.color = '#ffffff';
                                  }}
                                  onClick={() => handleToggleSelect(sample)}
                                  title="Add to track"
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            
                            {/* Hover Tooltip */}
                            <div 
                              className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 whitespace-nowrap border"
                              style={{
                                backgroundColor: '#3a3a3a',
                                borderColor: '#2a2a2a',
                                color: '#ffffff'
                              }}
                            >
                              {sample.display_name}
                              {sample.kit_name && (
                                <div className="mt-1" style={{ color: '#ffffff', opacity: 0.7 }}>
                                  Kit: {prettyPrint(sample.kit_name)}
                                </div>
                              )}
                              <div 
                                className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent"
                                style={{
                                  borderTopColor: '#262626'
                                }}
                              ></div>
                            </div>
                          </div>
                        );
                      })}
                      
                      {getCurrentSamples.length === 0 && !drumSamplesLoading && (
                        <div className="col-span-full text-center py-8" style={{ color: '#ffffff', opacity: 0.7 }}>
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