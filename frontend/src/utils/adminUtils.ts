// Admin user IDs - only these users can access admin routes
const ADMIN_USER_IDS = [
  // Add admin user IDs here
  // Example: '123e4567-e89b-12d3-a456-426614174000'
  'b9c0588e-cd7c-4a3f-9bd9-a6f6dcc321ff',
];

export function isAdminUser(userId: string | undefined): boolean {
  if (!userId) return false;
  return ADMIN_USER_IDS.includes(userId);
}

export function requireAdmin(userId: string | undefined): boolean {
  if (!isAdminUser(userId)) {
    throw new Error('Unauthorized: Admin access required');
  }
  return true;
}