// import React, { useCallback, useMemo } from 'react';
// import { Box } from '@mui/material';
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
//     <Box
//       sx={{
//         position: 'relative',
//         '&:hover': isSelected ? {} : {
//           '& .selectable-track-overlay': {
//             opacity: selectedTool === 'select' ? 1 : 0
//           }
//         }
//       }}
//       onMouseDown={handleMouseDown}
//       onDoubleClick={handleDoubleClick}
//     >
//       {/* Selection indicators */}
//       {isSelected && (
//         <>
//           {/* Selection background */}
//           <Box
//             sx={{
//               position: 'absolute',
//               top: -4,
//               left: -4,
//               right: -4,
//               bottom: -4,
//               backgroundColor: isPrimaryDrag 
//                 ? 'rgba(33, 150, 243, 0.25)' 
//                 : 'rgba(33, 150, 243, 0.15)',
//               borderRadius: '8px',
//               pointerEvents: 'none',
//               zIndex: -1,
//               border: isPrimaryDrag ? '2px solid #2196f3' : 'none'
//             }}
//           />
          
//           {/* Selection badge */}
//           <Box
//             sx={{
//               position: 'absolute',
//               top: 4,
//               right: 4,
//               width: 18,
//               height: 18,
//               backgroundColor: isPrimaryDrag ? '#ff9800' : '#2196f3',
//               color: 'white',
//               borderRadius: '50%',
//               display: 'flex',
//               alignItems: 'center',
//               justifyContent: 'center',
//               fontSize: isPrimaryDrag ? '8px' : '10px',
//               fontWeight: 'bold',
//               zIndex: 1002,
//               pointerEvents: 'none',
//               boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
//             }}
//           >
//             {isPrimaryDrag ? '◉' : '✓'}
//           </Box>
//         </>
//       )}

//       {/* Hover overlay for selection mode */}
//       {!isSelected && selectedTool === 'select' && (
//         <Box
//           className="selectable-track-overlay"
//           sx={{
//             position: 'absolute',
//             top: 0,
//             left: 0,
//             right: 0,
//             bottom: 0,
//             outline: '2px dashed rgba(33, 150, 243, 0.7)',
//             borderRadius: '6px',
//             backgroundColor: 'rgba(33, 150, 243, 0.05)',
//             opacity: 0,
//             transition: 'opacity 0.2s ease-in-out',
//             pointerEvents: 'none',
//             zIndex: 999
//           }}
//         />
//       )}

//       {/* Base track preview with selection styles */}
//       <BaseTrackPreview
//         {...baseProps}
//         track={track}
//         trackStyleOverrides={selectionStyles}
//       />
//     </Box>
//   );
// };

// export default SelectableTrackPreview;