import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface Category {
  id: string;
  name: string;
  icon: LucideIcon;
  subCategories?: SubCategory[];
  color?: string;
}

export interface SubCategory {
  id: string;
  name: string;
}

export interface CategoryNavigationProps {
  categories: Category[];
  selectedCategory: string;
  selectedSubCategory?: string;
  onCategorySelect: (id: string) => void;
  onSubCategorySelect?: (id: string) => void;
  showSubCategories?: boolean;
  isSubCategoriesExpanded?: boolean;
  onToggleSubCategories?: () => void;
  width?: number;
  className?: string;
}

export const CategoryNavigationPanel: React.FC<CategoryNavigationProps> = ({
  categories,
  selectedCategory,
  selectedSubCategory,
  onCategorySelect,
  onSubCategorySelect,
  showSubCategories = true,
  isSubCategoriesExpanded = true,
  onToggleSubCategories,
  width = 200,
  className
}) => {
  const selectedCategoryData = categories.find(cat => cat.id === selectedCategory);
  const hasSubCategories = selectedCategoryData?.subCategories && selectedCategoryData.subCategories.length > 0;

  const handleCategoryClick = (category: Category) => {
    const isCategorySelected = selectedCategory === category.id;
    
    if (isCategorySelected && hasSubCategories && onToggleSubCategories) {
      // If clicking the already selected category, toggle sub-categories
      onToggleSubCategories();
    } else {
      // Select new category
      onCategorySelect(category.id);
      
      // Auto-select first sub-category if available
      if (category.subCategories && category.subCategories.length > 0 && onSubCategorySelect) {
        onSubCategorySelect(category.subCategories[0].id);
      }
    }
  };

  return (
    <div className="flex h-full">
      {/* Main Categories Panel */}
      <div 
        className={cn("border-r border-gray-700 flex-shrink-0 bg-gray-900 flex flex-col", className)}
        style={{ width: `${width}px` }}
      >
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
            {categories.map((category) => {
              const IconComponent = category.icon;
              const isCategorySelected = selectedCategory === category.id;
              const showChevron = category.subCategories && category.subCategories.length > 0;
              
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
                  onClick={() => handleCategoryClick(category)}
                >
                  <div className="flex items-center flex-1">
                    <IconComponent 
                      className="h-4 w-4 mr-3" 
                      style={{ color: category.color }}
                    />
                    {category.name}
                  </div>
                  {showChevron && (
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
      
      {/* Sub Categories Panel */}
      {showSubCategories && isSubCategoriesExpanded && hasSubCategories && (
        <div className="w-52 border-r border-gray-700 p-3 flex-shrink-0 bg-gray-850 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              {selectedCategoryData?.name} Types
            </div>
            {onToggleSubCategories && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleSubCategories}
                className="p-1 h-6 w-6 text-gray-400 hover:text-white"
              >
                <ChevronRight className="h-4 w-4 rotate-90" />
              </Button>
            )}
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
                    onClick={() => onSubCategorySelect?.(subCategory.id)}
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
    </div>
  );
};

export default CategoryNavigationPanel;