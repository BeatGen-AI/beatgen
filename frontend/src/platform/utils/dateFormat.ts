/**
 * Format a date string into a human-readable format
 * @param dateString - ISO date string
 * @returns Formatted date string
 */
export function formatDate(dateString: string | undefined): string {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  const now = new Date();
  const diffInMilliseconds = now.getTime() - date.getTime();
  const diffInSeconds = Math.floor(diffInMilliseconds / 1000);
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);
  
  // Less than a minute ago
  if (diffInSeconds < 60) {
    return 'Just now';
  }
  
  // Less than an hour ago
  if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  }
  
  // Less than a day ago
  if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  }
  
  // Less than a week ago
  if (diffInDays < 7) {
    return `${diffInDays}d ago`;
  }
  
  // More than a week ago - show date
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  };
  
  return date.toLocaleDateString(undefined, options);
}