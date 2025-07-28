import React, { useState } from 'react';
import { Link as RouterLink } from '@tanstack/react-router';
import { useAuth } from '../auth/auth-context';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  Home,
  Music,
  User,
  LogOut,
  Settings,
  Menu,
} from 'lucide-react';

const Navbar = () => {
  const { user, profile, signOut } = useAuth();
  
  // Menu state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Handlers
  const handleLogout = async () => {
    await signOut();
    window.location.href = '/';
  };

  return (
    <nav className="bg-background border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <RouterLink 
              to="/" 
              className="flex items-center space-x-2 text-foreground hover:text-primary transition-colors font-bold text-xl"
            >
              <Music className="h-6 w-6" />
              <span>BeatGen</span>
            </RouterLink>
          </div>
        
          {/* Desktop Navigation */}
          <div className="hidden sm:flex sm:items-center sm:space-x-4">
            {user ? (
              <>
                <Button variant="ghost" asChild>
                  <RouterLink to="/home" className="flex items-center space-x-2">
                    <Home className="h-4 w-4" />
                    <span>Projects</span>
                  </RouterLink>
                </Button>
                
                <Button variant="ghost" asChild>
                  <RouterLink to="/studio" className="flex items-center space-x-2">
                    <Music className="h-4 w-4" />
                    <span>Studio</span>
                  </RouterLink>
                </Button>
                
                {/* User Menu */}
                <TooltipProvider>
                  <Tooltip>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                            <Avatar className="h-8 w-8">
                              <AvatarImage 
                                src={profile?.avatar_url} 
                                alt={profile?.display_name || user.email} 
                              />
                              <AvatarFallback>
                                {user.email.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          </Button>
                        </TooltipTrigger>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-56" align="end" forceMount>
                        <div className="flex flex-col space-y-1 p-2">
                          <p className="text-sm font-medium leading-none">
                            {profile?.display_name || user?.email}
                          </p>
                          <p className="text-xs leading-none text-muted-foreground">
                            {user?.email}
                          </p>
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <RouterLink to="/profile" className="flex items-center space-x-2 cursor-pointer">
                            <User className="h-4 w-4" />
                            <span>Profile</span>
                          </RouterLink>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <RouterLink to="/settings" className="flex items-center space-x-2 cursor-pointer">
                            <Settings className="h-4 w-4" />
                            <span>Settings</span>
                          </RouterLink>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600 cursor-pointer">
                          <LogOut className="h-4 w-4 mr-2" />
                          <span>Logout</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <TooltipContent>
                      <p>Account Settings</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <RouterLink to="/login">Log In</RouterLink>
                </Button>
                
                <Button asChild>
                  <RouterLink to="/register">Sign Up</RouterLink>
                </Button>
              </>
            )}
          </div>
        
          {/* Mobile Menu Button */}
          <div className="sm:hidden flex items-center">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-6 w-6" />
                  <span className="sr-only">Open main menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px]">
                <SheetHeader>
                  <SheetTitle className="flex items-center space-x-2">
                    <Music className="h-5 w-5" />
                    <span>BeatGen</span>
                  </SheetTitle>
                </SheetHeader>
                <div className="flex flex-col space-y-4 mt-8">
                  {user ? (
                    <>
                      <Button variant="ghost" asChild className="justify-start">
                        <RouterLink to="/home" onClick={() => setMobileMenuOpen(false)}>
                          <Home className="h-4 w-4 mr-2" />
                          Projects
                        </RouterLink>
                      </Button>
                      
                      <Button variant="ghost" asChild className="justify-start">
                        <RouterLink to="/studio" onClick={() => setMobileMenuOpen(false)}>
                          <Music className="h-4 w-4 mr-2" />
                          Studio
                        </RouterLink>
                      </Button>
                      
                      <div className="border-t pt-4">
                        <div className="flex items-center space-x-3 mb-4">
                          <Avatar className="h-10 w-10">
                            <AvatarImage 
                              src={profile?.avatar_url} 
                              alt={profile?.display_name || user.email} 
                            />
                            <AvatarFallback>
                              {user.email.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">
                              {profile?.display_name || user?.email}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {user?.email}
                            </span>
                          </div>
                        </div>
                        
                        <Button variant="ghost" asChild className="justify-start w-full">
                          <RouterLink to="/profile" onClick={() => setMobileMenuOpen(false)}>
                            <User className="h-4 w-4 mr-2" />
                            Profile
                          </RouterLink>
                        </Button>
                        
                        <Button variant="ghost" asChild className="justify-start w-full">
                          <RouterLink to="/settings" onClick={() => setMobileMenuOpen(false)}>
                            <Settings className="h-4 w-4 mr-2" />
                            Settings
                          </RouterLink>
                        </Button>
                        
                        <Button 
                          variant="ghost" 
                          onClick={handleLogout} 
                          className="justify-start w-full text-red-600 hover:text-red-600"
                        >
                          <LogOut className="h-4 w-4 mr-2" />
                          Logout
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" asChild className="justify-start">
                        <RouterLink to="/login" onClick={() => setMobileMenuOpen(false)}>
                          Log In
                        </RouterLink>
                      </Button>
                      
                      <Button asChild className="justify-start">
                        <RouterLink to="/register" onClick={() => setMobileMenuOpen(false)}>
                          Sign Up
                        </RouterLink>
                      </Button>
                    </>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;