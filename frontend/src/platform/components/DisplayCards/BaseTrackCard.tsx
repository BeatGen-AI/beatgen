import React from 'react';
import {
  Card,
  CardFooter,
  CardHeader,
  CardTitle
} from "../../../components/ui/card";
import {
  FadeCard,
  FadeCardFooter,
  FadeCardHeader,
  FadeCardTitle
} from "../../../components/ui/fade-card";
import { cn } from "../../../lib/utils";
import { CARD_HEIGHTS } from "../../constants/cardDimensions";

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
    <FadeCard 
      className={cn(
        "base-track-card w-full flex flex-col rounded-lg hover-shadow-card",
        className
      )}
      reverseFade={true}
      style={{ 
        '--hover-shadow-color': sectionColor,
        height: `${CARD_HEIGHTS.DISPLAY_CARD}px`
      } as React.CSSProperties}
    >
      {/* Fixed height header */}
      <FadeCardHeader 
        className="flex flex-row items-center justify-between p-2 flex-shrink-0"
        style={{ height: `${CARD_HEIGHTS.DISPLAY_CARD_HEADER}px` }}
      >
        <div className="flex items-center min-w-0 flex-1">
          {icon}
          <FadeCardTitle className="text-sm font-medium truncate ml-2">{title}</FadeCardTitle>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          {headerActions}
        </div>
      </FadeCardHeader>
      
      {/* Fixed height preview area */}
      <div className="flex-1 flex items-center justify-center px-3 py-1 overflow-hidden">
        <div className={cn(
          "w-full h-full flex flex-col items-center justify-center",
          `max-h-[${CARD_HEIGHTS.DISPLAY_CARD_CONTENT}px]`
        )}>
          {previewContent}
        </div>
      </div>
      
      {/* Fixed height footer */}
      <FadeCardFooter 
        className="p-2 flex justify-between items-center flex-shrink-0 overflow-hidden"
        style={{ height: `${CARD_HEIGHTS.DISPLAY_CARD_FOOTER}px` }}
      >
        <div className="text-xs text-muted-foreground truncate flex-1 overflow-hidden">
          {footerLeft}
        </div>
        <div className="text-xs text-muted-foreground text-right flex-shrink-0 ml-2 overflow-hidden truncate max-w-[50%]">
          {footerRight}
        </div>
      </FadeCardFooter>
    </FadeCard>
  );
};

export default BaseTrackCard;