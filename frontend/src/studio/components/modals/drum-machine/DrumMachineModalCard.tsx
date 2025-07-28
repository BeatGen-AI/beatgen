import React from 'react';
import { Loader2 } from 'lucide-react';
import { DrumSamplePublicRead } from 'src/platform/types/dto/public_models/drum_samples';
import { prettyPrint } from '../../../../utils/pretty_print';
import { Checkbox } from '../../../../components/ui/checkbox';
import { cn } from '../../../../lib/utils';

export interface DrumSampleCardProps {
    sample: DrumSamplePublicRead;
    onToggleSelect: (sample: DrumSamplePublicRead) => void;
    isLoading: boolean;
    isSelected: boolean;
}

export const DrumSampleCard: React.FC<DrumSampleCardProps> = ({
    sample,
    onToggleSelect,
    isLoading,
    isSelected
}) => {
    const handleToggle = (event?: React.MouseEvent) => {
        event?.stopPropagation();
        if (!isLoading) {
            onToggleSelect(sample);
        }
    };

    return (
        <div
            onClick={() => handleToggle()}
            className={cn(
                "relative bg-card border rounded-xl p-6 transition-all duration-250 flex flex-col items-center justify-between gap-6 min-h-[160px]",
                isLoading ? "cursor-wait" : "cursor-pointer",
                isSelected ? "border-primary shadow-[0_0_8px_rgba(59,130,246,0.3)] opacity-100" : "border-transparent opacity-80 hover:opacity-100",
                !isLoading && "hover:-translate-y-0.5",
                isSelected ? "hover:shadow-[0_0_12px_rgba(59,130,246,0.4)]" : "hover:shadow-[0_4px_8px_rgba(0,0,0,0.2)]"
            )}
        >
            <Checkbox
                checked={isSelected}
                onCheckedChange={() => handleToggle()}
                disabled={isLoading}
                onClick={(e) => e.stopPropagation()}
                className="absolute top-3 right-3 z-20"
            />
            
            {isLoading && (
                <Loader2 
                    className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 animate-spin z-10" 
                />
            )}

            <div className={cn(
                "text-center flex-grow w-full mt-2",
                isLoading && "opacity-50"
            )}>
                <h4 className="font-bold break-words mb-2">
                    {prettyPrint(sample.display_name)}
                </h4>
                <p className="text-sm text-muted-foreground block mb-1">
                    Kit: {prettyPrint(sample.kit_name)}
                </p>
                <p className="text-sm text-muted-foreground block mb-1">
                    Genre: {prettyPrint(sample.genre)}
                </p>
                <p className="text-sm text-muted-foreground block">
                    Type: {prettyPrint(sample.category)}
                </p>
            </div>
        </div>
    );
};