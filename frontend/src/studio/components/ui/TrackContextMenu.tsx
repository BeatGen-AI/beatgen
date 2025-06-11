import React from 'react';
import { Menu, MenuItem, ListItemIcon, ListItemText, Divider } from '@mui/material';
import { ContentCopy, ContentPaste, Delete, Edit } from '@mui/icons-material';
import { useStudioStore } from '../../stores/studioStore';

interface TrackContextMenuProps {
  open: boolean;
  anchorPosition: { x: number; y: number } | null;
  trackId: string | null;
  onClose: () => void;
}

export const TrackContextMenu: React.FC<TrackContextMenuProps> = ({
  open,
  anchorPosition,
  trackId,
  onClose
}) => {
  const selectedTracks = useStudioStore(state => state.selectedTracks);
  const copySelectedTracks = useStudioStore(state => state.copySelectedTracks);
  const pasteTracksAtPosition = useStudioStore(state => state.pasteTracksAtPosition);
  const canPaste = useStudioStore(state => state.canPaste());
  const handleTrackDelete = useStudioStore(state => state.handleTrackDelete);

  const handleCopy = () => {
    copySelectedTracks();
    onClose();
  };

  const handlePaste = async () => {
    if (anchorPosition) {
      // Convert screen coordinates to timeline coordinates
      // For now, paste at a default offset from the original position
      await pasteTracksAtPosition(anchorPosition.x, anchorPosition.y);
    }
    onClose();
  };

  const handleDelete = async () => {
    if (selectedTracks.size === 1 && trackId) {
      await handleTrackDelete(trackId);
    } else {
      // Delete all selected tracks
      for (const selectedTrackId of selectedTracks) {
        await handleTrackDelete(selectedTrackId);
      }
    }
    onClose();
  };

  const selectedCount = selectedTracks.size;
  const hasSelection = selectedCount > 0;

  return (
    <Menu
      open={open}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={
        anchorPosition ? { top: anchorPosition.y, left: anchorPosition.x } : undefined
      }
      MenuListProps={{
        'aria-labelledby': 'track-context-menu',
      }}
    >
      <MenuItem onClick={handleCopy} disabled={!hasSelection}>
        <ListItemIcon>
          <ContentCopy fontSize="small" />
        </ListItemIcon>
        <ListItemText>
          Copy {selectedCount > 1 ? `${selectedCount} tracks` : 'track'}
        </ListItemText>
      </MenuItem>
      
      <MenuItem onClick={handlePaste} disabled={!canPaste}>
        <ListItemIcon>
          <ContentPaste fontSize="small" />
        </ListItemIcon>
        <ListItemText>
          Paste track instance{selectedCount > 1 ? 's' : ''}
        </ListItemText>
      </MenuItem>
      
      <Divider />
      
      <MenuItem onClick={handleDelete} disabled={!hasSelection}>
        <ListItemIcon>
          <Delete fontSize="small" />
        </ListItemIcon>
        <ListItemText>
          Delete {selectedCount > 1 ? `${selectedCount} tracks` : 'track'}
        </ListItemText>
      </MenuItem>
    </Menu>
  );
};

export default TrackContextMenu;