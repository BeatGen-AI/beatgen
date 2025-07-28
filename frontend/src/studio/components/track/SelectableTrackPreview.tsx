// import React, { useCallback, useMemo } from 'react';
// import BaseTrackPreview, { BaseTrackPreviewProps } from './base/BaseTrackPreview';
// import { Tool } from '../../shared/interactions';

// interface SelectableTrackPreviewProps extends Omit<BaseTrackPreviewProps, 'trackStyleOverrides'> {
//   /** Whether this track is selected */
//   isSelected?: boolean;
  
//   /** Current tool being used */
//   selectedTool?: Tool;
  
//   /** Whether the track is being dragged as part of a group */
//   isGroupDrag?: boolean;
  
//   /** Whether this is the primary track in a group drag */
//   isPrimaryDrag?: boolean;
  
//   /** Callback when track is clicked for selection */
//   onTrackClick?: (trackId: string, event: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => void;
  
//   /** Callback when track is double-clicked */
//   onTrackDoubleClick?: (trackId: string) => void;
  
//   /** Additional style overrides */
//   additionalStyles?: React.CSSProperties;
// }

// export const SelectableTrackPreview: React.FC<SelectableTrackPreviewProps> = ({
//   track,
//   isSelected = false,
//   selectedTool = 'select',
//   isGroupDrag = false,
//   isPrimaryDrag = false,
//   onTrackClick,
//   onTrackDoubleClick,
//   additionalStyles = {},
//   ...baseProps
// }) => {
  
//   // Calculate selection styles
//   const selectionStyles = useMemo(() => {
//     const baseStyles: React.CSSProperties = {
//       ...additionalStyles
//     };

//     if (isSelected) {
//       baseStyles.outline = '3px solid #2196f3';
//       baseStyles.outlineOffset = '-2px';
//       baseStyles.borderRadius = '6px';
//       baseStyles.zIndex = 1001;
      
//       if (isGroupDrag) {
//         baseStyles.transform = 'scale(1.02)';
//         baseStyles.opacity = 0.9;
//         baseStyles.transition = 'none';
//         baseStyles.cursor = 'grabbing';
        
//         if (isPrimaryDrag) {
//           baseStyles.boxShadow = '0 8px 32px rgba(33, 150, 243, 0.4)';
//         }
//       } else {
//         baseStyles.transition = 'all 0.2s ease-in-out';
//         baseStyles.cursor = 'grab';
//       }
//     } else {
//       // Not selected styles
//       if (selectedTool === 'select') {
//         baseStyles.cursor = 'pointer';
        
//         // Add hover effect for selectable tracks
//         baseStyles[':hover'] = {
//           outline: '2px dashed rgba(33, 150, 243, 0.7)',
//           backgroundColor: 'rgba(33, 150, 243, 0.05)'
//         };
//       } else {
//         // Other tools have their own cursors
//         switch (selectedTool) {
//           case 'eraser':
//             baseStyles.cursor = 'crosshair';
//             break;
//           case 'pen':
//             baseStyles.cursor = 'copy';
//             break;
//           case 'highlighter':
//             baseStyles.cursor = 'cell';
//             break;
//           default:
//             baseStyles.cursor = 'default';
//         }
//       }
//     }

//     return baseStyles;
//   }, [isSelected, selectedTool, isGroupDrag, isPrimaryDrag, additionalStyles]);

//   // Handle mouse events for selection
//   const handleMouseDown = useCallback((e: React.MouseEvent) => {
//     // Only handle selection interactions, let BaseTrackPreview handle drag/resize
//     if (selectedTool === 'select' && onTrackClick) {
//       e.stopPropagation();
//       onTrackClick(track.id, {
//         shiftKey: e.shiftKey,
//         ctrlKey: e.ctrlKey,
//         metaKey: e.metaKey
//       });
//     }
//   }, [selectedTool, onTrackClick, track.id]);

//   const handleDoubleClick = useCallback((e: React.MouseEvent) => {
//     if (onTrackDoubleClick) {
//       e.stopPropagation();
//       onTrackDoubleClick(track.id);
//     }
//   }, [onTrackDoubleClick, track.id]);

//   return (
//     <div
//       className="relative"
//       onMouseDown={handleMouseDown}
//       onDoubleClick={handleDoubleClick}
//     >
//       {/* Selection indicators */}
//       {isSelected && (
//         <>
//           {/* Selection background */}
//           <div
//             className={`absolute -top-1 -left-1 -right-1 -bottom-1 rounded-lg pointer-events-none -z-10 ${
//               isPrimaryDrag ? 'border-2 border-blue-500' : ''
//             }`}
//             style={{
//               backgroundColor: isPrimaryDrag 
//                 ? 'rgba(33, 150, 243, 0.25)' 
//                 : 'rgba(33, 150, 243, 0.15)'
//             }}
//           />
          
//           {/* Selection badge */}
//           <div
//             className="absolute top-1 right-1 w-[18px] h-[18px] text-white rounded-full flex items-center justify-center font-bold pointer-events-none shadow-sm"
//             style={{
//               backgroundColor: isPrimaryDrag ? '#ff9800' : '#2196f3',
//               fontSize: isPrimaryDrag ? '8px' : '10px',
//               zIndex: 1002,
//               boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
//             }}
//           >
//             {isPrimaryDrag ? '◉' : '✓'}
//           </div>
//         </>
//       )}

//       {/* Hover overlay for selection mode */}
//       {!isSelected && selectedTool === 'select' && (
//         <div
//           className="selectable-track-overlay absolute top-0 left-0 right-0 bottom-0 outline-2 outline-dashed outline-blue-500/70 rounded-md bg-blue-500/5 opacity-0 transition-opacity duration-200 pointer-events-none z-[999]"
//         />
//       )}

//       {/* Base track preview with selection styles */}
//       <BaseTrackPreview
//         {...baseProps}
//         track={track}
//         trackStyleOverrides={selectionStyles}
//       />
//     </div>
//   );
// };

// export default SelectableTrackPreview;