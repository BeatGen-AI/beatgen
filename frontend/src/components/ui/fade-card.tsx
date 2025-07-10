import * as React from "react"
import { cn } from "@/lib/utils"

const FadeCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative overflow-hidden rounded-xl shadow-xl",
      className
    )}
    {...props}
  >
    {/* Main card background */}
    <div className="absolute inset-0 bg-card" />
    
    {/* Fade to transparent overlay at the top - Light mode */}
    <div 
      className="absolute inset-x-0 top-0 h-24 pointer-events-none dark:hidden"
      style={{
        background: `linear-gradient(to bottom, 
          transparent 0px,
          transparent 4px,
          rgb(var(--card-rgb)) 40px
        )`
      }}
    />
    
    {/* Fade to black overlay at the top - Dark mode (stronger) */}
    <div 
      className="absolute inset-x-0 top-0 h-32 pointer-events-none hidden dark:block"
      style={{
        background: `linear-gradient(to bottom, 
          rgba(0, 0, 0, 0.8) 0px,
          rgba(0, 0, 0, 0.4) 20px,
          rgba(0, 0, 0, 0.1) 50px,
          transparent 80px
        )`
      }}
    />
    
    {/* Content */}
    <div className="relative">
      {children}
    </div>
  </div>
))
FadeCard.displayName = "FadeCard"

const FadeCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
FadeCardHeader.displayName = "FadeCardHeader"

const FadeCardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
FadeCardTitle.displayName = "FadeCardTitle"

const FadeCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
FadeCardDescription.displayName = "FadeCardDescription"

const FadeCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
FadeCardContent.displayName = "FadeCardContent"

const FadeCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
FadeCardFooter.displayName = "FadeCardFooter"

export { FadeCard, FadeCardHeader, FadeCardFooter, FadeCardTitle, FadeCardDescription, FadeCardContent }