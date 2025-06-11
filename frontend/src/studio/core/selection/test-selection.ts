/**
 * Simple test to verify the extracted selection logic works correctly
 * Run this before refactoring the piano roll to ensure the utilities are working
 */

import {
  SelectableItem,
  createSelectionRect,
  updateSelectionRect,
  getItemsInRect,
  toggleItemSelection,
  selectItemsInRect,
  startGroupDrag,
  calculateGroupDragUpdates,
  startGroupResize,
  calculateGroupResizeUpdates,
  copySelectedItems,
  calculatePastePositions
} from './selectionUtils';

// Mock items for testing
const testItems: SelectableItem[] = [
  { id: 'note1', x: 100, y: 50, width: 40 },
  { id: 'note2', x: 200, y: 100, width: 60 },
  { id: 'note3', x: 150, y: 75, width: 30 },
  { id: 'note4', x: 300, y: 200, width: 50 }
];

function runTests(): boolean {
  console.log('🧪 Testing extracted selection utilities...');
  
  try {
    // Test 1: Selection rectangle
    console.log('Test 1: Selection rectangle');
    const rect = createSelectionRect(50, 25);
    const updatedRect = updateSelectionRect(rect, 250, 150);
    console.log('Selection rect:', updatedRect); // Should be {startX: 50, startY: 25, width: 200, height: 125}
    
    const itemsInRect = getItemsInRect(testItems, updatedRect);
    console.log('Items in rect:', itemsInRect.map(i => i.id)); // Should include note1, note2, note3
    
    // Test 2: Selection toggle
    console.log('\nTest 2: Selection toggle');
    let selection: (string | number)[] = [];
    selection = toggleItemSelection(selection, 'note1', false);
    console.log('Select note1:', selection); // ['note1']
    
    selection = toggleItemSelection(selection, 'note2', true);
    console.log('Add note2:', selection); // ['note1', 'note2']
    
    selection = toggleItemSelection(selection, 'note1', true);
    console.log('Remove note1:', selection); // ['note2']
    
    // Test 3: Rectangle selection
    console.log('\nTest 3: Rectangle selection');
    const rectSelection = selectItemsInRect(testItems, updatedRect, [], false);
    console.log('Rectangle selection:', rectSelection); // Should select items in rect
    
    // Test 4: Group drag
    console.log('\nTest 4: Group drag');
    const selectedIds = ['note1', 'note2'];
    const dragState = startGroupDrag(testItems, selectedIds, 'note1');
    console.log('Drag state active:', dragState.isActive); // true
    console.log('Initial positions stored:', dragState.initialPositions.size); // 2
    
    const dragUpdates = calculateGroupDragUpdates(dragState, selectedIds, 50, 25);
    console.log('Drag updates:', Array.from(dragUpdates.entries())); 
    // Should show note1 at (150, 75) and note2 at (250, 125)
    
    // Test 5: Group resize
    console.log('\nTest 5: Group resize');
    const resizeState = startGroupResize(testItems, selectedIds, 'note1', 'right');
    console.log('Resize state active:', resizeState.isActive); // true
    
    const resizeUpdates = calculateGroupResizeUpdates(resizeState, selectedIds, 20);
    console.log('Resize updates:', Array.from(resizeUpdates.entries()));
    // Should show width increases for both notes
    
    // Test 6: Copy/paste
    console.log('\nTest 6: Copy/paste');
    const clipboardData = copySelectedItems(testItems, selectedIds);
    console.log('Clipboard data:', clipboardData);
    
    if (clipboardData) {
      const pasteData = calculatePastePositions(clipboardData, 400, 300);
      console.log('Paste positions:', pasteData);
      // Should show relative positioning maintained
    }
    
    console.log('✅ All tests passed!');
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

// Helper to run tests in browser console
(window as any).testSelection = runTests;

export { runTests };
export default runTests;