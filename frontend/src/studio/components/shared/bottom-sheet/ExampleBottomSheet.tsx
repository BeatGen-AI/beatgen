import React, { useState } from 'react';
import { Piano, Guitar, Music } from 'lucide-react';
import {
  BottomSheetContainer,
  BottomSheetPanel,
  CategoryNavigationPanel,
  ItemGrid,
  type Category,
  type BaseItem,
  type PanelState
} from './index';

// Example data structures
const exampleCategories: Category[] = [
  {
    id: 'keyboards',
    name: 'Keyboards',
    icon: Piano,
    color: '#2ECC71',
    subCategories: [
      { id: 'grand-pianos', name: 'Grand Pianos' },
      { id: 'electric-pianos', name: 'Electric Pianos' },
    ]
  },
  {
    id: 'guitars',
    name: 'Guitars',
    icon: Guitar,
    color: '#E67E22',
    subCategories: [
      { id: 'acoustic', name: 'Acoustic' },
      { id: 'electric', name: 'Electric' },
    ]
  },
  {
    id: 'synths',
    name: 'Synthesizers',
    icon: Music,
    color: '#3498DB',
    subCategories: [
      { id: 'leads', name: 'Leads' },
      { id: 'pads', name: 'Pads' },
    ]
  }
];

interface ExampleItem extends BaseItem {
  storageKey?: string;
  previewUrl?: string;
}

const exampleItems: ExampleItem[] = [
  {
    id: '1',
    name: 'Grand Piano',
    display_name: 'Concert Grand Piano',
    description: 'High-quality concert grand piano',
    category: 'keyboards',
    storageKey: 'piano.sf2'
  },
  {
    id: '2',
    name: 'Electric Guitar',
    display_name: 'Stratocaster Clean',
    description: 'Clean electric guitar sound',
    category: 'guitars',
    storageKey: 'guitar.sf2'
  }
];

interface ExampleBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  isAIAssistantOpen?: boolean;
  onItemSelect?: (item: ExampleItem) => void;
}

export const ExampleBottomSheet: React.FC<ExampleBottomSheetProps> = ({
  isOpen,
  onClose,
  isAIAssistantOpen = false,
  onItemSelect
}) => {
  // Panel states
  const [panels] = useState<PanelState[]>([
    { id: 'main', isExpanded: isOpen, position: 'full' }
  ]);

  // Navigation state
  const [selectedCategory, setSelectedCategory] = useState('keyboards');
  const [selectedSubCategory, setSelectedSubCategory] = useState('grand-pianos');
  const [isSubCategoriesExpanded, setIsSubCategoriesExpanded] = useState(true);

  // Item management state
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [favoriteItems, setFavoriteItems] = useState<Set<string>>(new Set());
  const [downloadingItems, setDownloadingItems] = useState<Set<string>>(new Set());

  // Handlers
  const handleItemSelect = (item: ExampleItem) => {
    console.log('Item selected:', item);
    onItemSelect?.(item);
  };

  const handleItemToggle = (item: ExampleItem) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(item.id)) {
        newSet.delete(item.id);
      } else {
        newSet.add(item.id);
      }
      return newSet;
    });
  };

  const handleToggleFavorite = (itemId: string) => {
    setFavoriteItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const handleItemPreview = (item: ExampleItem) => {
    console.log('Preview item:', item);
  };

  // Filter items based on selected category/subcategory
  const filteredItems = exampleItems.filter(item => 
    item.category === selectedCategory
  );

  return (
    <BottomSheetContainer
      panels={panels}
      isAIAssistantOpen={isAIAssistantOpen}
    >
      <BottomSheetPanel
        title="Choose Instrument"
        isExpanded={isOpen}
        onToggleExpand={() => {}} // Not used in single panel
        onClose={onClose}
        position="full"
      >
        <div className="flex h-full">
          {/* Category Navigation */}
          <CategoryNavigationPanel
            categories={exampleCategories}
            selectedCategory={selectedCategory}
            selectedSubCategory={selectedSubCategory}
            onCategorySelect={setSelectedCategory}
            onSubCategorySelect={setSelectedSubCategory}
            isSubCategoriesExpanded={isSubCategoriesExpanded}
            onToggleSubCategories={() => setIsSubCategoriesExpanded(!isSubCategoriesExpanded)}
            width={200}
          />

          {/* Item Grid */}
          <ItemGrid
            items={filteredItems}
            onItemSelect={handleItemSelect}
            onItemToggle={handleItemToggle}
            onItemPreview={handleItemPreview}
            selectedItems={selectedItems}
            favoriteItems={favoriteItems}
            onToggleFavorite={handleToggleFavorite}
            downloadingItems={downloadingItems}
            searchPlaceholder="Search instruments..."
            emptyMessage="No instruments found in this category"
            showSearch={true}
            showFavorites={true}
            showPreview={true}
            gridCols={6}
          />
        </div>
      </BottomSheetPanel>
    </BottomSheetContainer>
  );
};

export default ExampleBottomSheet;