import React from 'react';
import {
  Card,
  CardFooter,
  CardHeader,
  CardTitle
} from "../../../components/ui/card";
import { cn } from "../../../lib/utils";

interface BaseTrackCardProps {
  title: string;
  icon: React.ReactNode;
  sectionColor: string;
  headerActions: React.ReactNode;
  previewContent: React.ReactNode;
  footerLeft?: React.ReactNode;
  footerRight?: React.ReactNode;
  className?: string;
}

const BaseTrackCard: React.FC<BaseTrackCardProps> = ({
  title,
  icon,
  sectionColor,
  headerActions,
  previewContent,
  footerLeft,
  footerRight,
  className
}) => {
  return (
    <Card 
      className={cn(
        "base-track-card w-full h-[200px] flex flex-col rounded-lg hover-shadow-card",
        className
      )}
      style={{ '--hover-shadow-color': sectionColor } as React.CSSProperties}
    >
      {/* Fixed height header */}
      <CardHeader className="flex flex-row items-center justify-between p-2 h-[40px] flex-shrink-0">
        <div className="flex items-center min-w-0 flex-1">
          {icon}
          <CardTitle className="text-sm font-medium truncate ml-2">{title}</CardTitle>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          {headerActions}
        </div>
      </CardHeader>
      
      {/* Fixed height preview area */}
      <div className="flex-1 flex items-center justify-center px-3 py-1 overflow-hidden">
        <div className="w-full h-full max-h-[80px] flex flex-col items-center justify-center">
          {previewContent}
        </div>
      </div>
      
      {/* Fixed height footer */}
      <CardFooter className="p-2 h-[40px] flex justify-between items-center flex-shrink-0 overflow-hidden">
        <div className="text-xs text-muted-foreground truncate flex-1 overflow-hidden">
          {footerLeft}
        </div>
        <div className="text-xs text-muted-foreground text-right flex-shrink-0 ml-2 overflow-hidden truncate max-w-[50%]">
          {footerRight}
        </div>
      </CardFooter>
    </Card>
  );
};

export default BaseTrackCard;