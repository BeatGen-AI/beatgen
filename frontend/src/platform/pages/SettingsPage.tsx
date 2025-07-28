import React from 'react';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeSwitcher } from '../../components/ui/ThemeSwitcher';
import { IconArrowLeft, IconSettings, IconMoon } from '@tabler/icons-react';
import { useAppTheme, useTheme } from '../../lib/theme-provider';
import { useRouter } from '@tanstack/react-router';

const SettingsPage: React.FC = () => {
    const { mode: uiMode, studioMode } = useAppTheme();
    const { homepageTheme, studioTheme, setHomepageTheme, setStudioTheme } = useTheme();
    const router = useRouter();

    const handleGoBack = () => {
        router.history.back();
    };

    return (
        <div className="container mx-auto max-w-2xl py-4 px-4 md:px-8">
            <Card className="relative">
                <CardHeader>
                    <div className="flex items-center mb-3">
                        <Button variant="ghost" size="icon" onClick={handleGoBack} aria-label="go back" className="mr-2">
                            <IconArrowLeft />
                        </Button>
                        <CardTitle className="text-2xl">Application Settings</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* UI Theme Settings */}
                    <div className="mb-6">
                        <h3 className="text-lg font-semibold mb-2">UI Theme</h3>
                        <Separator className="mb-4" />
                        <div className="flex items-center justify-between p-3 rounded-md border">
                            <div className="flex items-center">
                                <IconMoon className="mr-3 text-muted-foreground" />
                                <Label className="text-base">
                                    Theme
                                </Label>
                            </div>
                            <ThemeSwitcher
                                value={homepageTheme}
                                onValueChange={setHomepageTheme}
                                useStudioTheme={false}
                            />
                        </div>
                    </div>

                    {/* Studio Theme Settings */}
                    <div>
                        <h3 className="text-lg font-semibold mb-2">Studio Theme</h3>
                        <Separator className="mb-4" />
                        <div className="flex items-center justify-between p-3 rounded-md border">
                            <div className="flex items-center">
                                <IconSettings className="mr-3 text-muted-foreground" />
                                <Label className="text-base">
                                    Theme
                                </Label>
                            </div>
                            <ThemeSwitcher
                                value={studioTheme}
                                onValueChange={setStudioTheme}
                                useStudioTheme={false}
                            />
                        </div>
                    </div>

                    {/* Future settings can be added here */}
                    {/* e.g., Assistant Model, etc. */}
                </CardContent>
            </Card>
        </div>
    );
};

export default SettingsPage; 