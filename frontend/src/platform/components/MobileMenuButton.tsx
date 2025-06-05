import React from 'react';
import { IconMenu2 } from '@tabler/icons-react';
import { Button } from "../../components/ui/button";

interface MobileMenuButtonProps {
  onClick: () => void;
}

const MobileMenuButton: React.FC<MobileMenuButtonProps> = ({ onClick }) => {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="md:hidden fixed top-4 left-4 z-50 bg-white border border-gray-200 shadow-sm"
    >
      <IconMenu2 className="w-5 h-5" />
    </Button>
  );
};

export default MobileMenuButton;