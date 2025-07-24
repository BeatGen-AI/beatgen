import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Search, Heart, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BaseItem {
  id: string;
  name: string;
  display_name?: string;
  description?: string;
  category?: string;
}

export interface ItemGridProps<T extends BaseItem> {
  items: T[];
  onItemSelect?: (item: T) => void;
  onItemToggle?: (item: T) => void;
  onItemPreview?: (item: T) => void;
  renderItem?: (item: T, actions: ItemActions<T>) => React.ReactNode;
  selectedItems?: Set<string>;
  favoriteItems?: Set<string>;
  onToggleFavorite?: (itemId: string) => void;
  loading?: boolean;
  error?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  showSearch?: boolean;
  showFavorites?: boolean;
  showPreview?: boolean;
  gridCols?: number;
  className?: string;
  downloadingItems?: Set<string>;
}

export interface ItemActions<T extends BaseItem> {
  onSelect?: (item: T) => void;
  onToggle?: (item: T) => void;
  onPreview?: (item: T) => void;
  onToggleFavorite?: (itemId: string) => void;
  isSelected?: boolean;
  isFavorite?: boolean;
  isDownloading?: boolean;
}

export function ItemGrid<T extends BaseItem>({
  items,
  onItemSelect,
  onItemToggle,
  onItemPreview,
  renderItem,
  selectedItems = new Set(),
  favoriteItems = new Set(),
  onToggleFavorite,
  loading = false,
  error,
  searchPlaceholder = "Search items...",
  emptyMessage = "No items found",
  showSearch = true,
  showFavorites = true,
  showPreview = true,
  gridCols = 6,
  className,
  downloadingItems = new Set(),
}: ItemGridProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter items based on search query
  const filteredItems = items.filter(item => {
    if (!searchQuery) return true;
    
    const lowerQuery = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(lowerQuery) ||
      (item.display_name && item.display_name.toLowerCase().includes(lowerQuery)) ||
      (item.description && item.description.toLowerCase().includes(lowerQuery)) ||
      (item.category && item.category.toLowerCase().includes(lowerQuery))
    );
  });

  const defaultRenderItem = (item: T, actions: ItemActions<T>) => (
    <div
      key={item.id}
      className="group relative bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-750 transition-all duration-200 hover:border-gray-500"
      title={item.description || item.display_name || item.name}
    >
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-medium text-white text-sm truncate flex-1 mr-2">
            {item.display_name || item.name}
          </h4>
          
          <div className="flex items-center gap-1">
            {/* Favorite Button */}
            {showFavorites && onToggleFavorite && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs px-1 py-1 h-6 w-6 hover:bg-gray-600 flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(item.id);
                }}
              >
                <Heart 
                  className={cn(
                    "h-3 w-3 transition-colors",
                    actions.isFavorite 
                      ? "fill-red-500 text-red-500" 
                      : "text-gray-400 hover:text-red-400"
                  )} 
                />
              </Button>
            )}
            
            {/* Select/Toggle Button */}
            {(onItemSelect || onItemToggle) && (
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "text-xs px-2 py-1 h-6 border flex-shrink-0 min-w-[40px]",
                  actions.isSelected 
                    ? "bg-blue-600 hover:bg-blue-700 border-blue-500 text-white" 
                    : "bg-gray-700 hover:bg-gray-600 border-gray-600 hover:border-gray-500 text-gray-300 hover:text-white"
                )}
                onClick={() => {
                  if (onItemToggle) {
                    onItemToggle(item);
                  } else if (onItemSelect) {
                    onItemSelect(item);
                  }
                }}
                disabled={actions.isDownloading}
              >
                {actions.isDownloading ? (
                  <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                ) : actions.isSelected ? (
                  '✓'
                ) : (
                  '+'
                )}
              </Button>
            )}
          </div>
        </div>
        
        {/* Category info */}
        {item.category && (
          <div className="mb-2 text-xs text-gray-400">
            {item.category}
          </div>
        )}
        
        {/* Preview Button */}
        {showPreview && onItemPreview && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-8 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onItemPreview(item);
            }}
          >
            <Play className="h-3 w-3 mr-2" />
            Preview
          </Button>
        )}
      </div>
      
      {/* Hover Tooltip */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 whitespace-nowrap border border-gray-600">
        {item.description || item.display_name || item.name}
        {item.category && (
          <div className="text-gray-400 mt-1">
            Category: {item.category}
          </div>
        )}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
      </div>
    </div>
  );

  const gridColsClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3 md:grid-cols-3',
    4: 'grid-cols-2 md:grid-cols-4',
    5: 'grid-cols-2 md:grid-cols-5',
    6: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
    8: 'grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8',
  }[gridCols] || 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6';

  return (
    <div className={cn("flex-1 flex flex-col min-w-0", className)}>
      {/* Header with Search */}
      {showSearch && (
        <div className="p-4 border-b border-gray-700 bg-gray-900">
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full"
              />
            </div>
          </div>
        </div>
      )}
      
      {/* Content Area */}
      <div 
        className="flex-1 overflow-y-auto bg-gray-900 min-h-0 pl-4 pr-0 pt-4"
        style={{ 
          scrollbarWidth: 'thin', 
          scrollbarColor: '#6B7280 #374151'
        }}
      >
        <div className="pr-4 pb-3">
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
              {error}
            </div>
          )}
          
          {/* Loading State */}
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-gray-400">Loading...</div>
            </div>
          ) : (
            <>
              {/* Items Grid */}
              {filteredItems.length > 0 ? (
                <div className={cn("grid gap-2", gridColsClass)}>
                  {filteredItems.map((item) => {
                    const actions: ItemActions<T> = {
                      onSelect: onItemSelect,
                      onToggle: onItemToggle,
                      onPreview: onItemPreview,
                      onToggleFavorite,
                      isSelected: selectedItems.has(item.id),
                      isFavorite: favoriteItems.has(item.id),
                      isDownloading: downloadingItems.has(item.id),
                    };

                    return renderItem ? renderItem(item, actions) : defaultRenderItem(item, actions);
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  {emptyMessage}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ItemGrid;