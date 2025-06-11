# Testing Authentication Solutions

This document explains the authentication issues with testing and provides three solutions.

## The Problem

The backend authentication system uses Supabase JWT tokens that are validated server-side. Mock tokens with fake signatures are rejected because:

1. **Token Validation Flow:**
   - `get_current_user` dependency extracts token from Authorization header
   - Calls `auth_service.get_current_user(token)`
   - Which calls `supabase.verify_token(token)`
   - Supabase validates the JWT against its secret keys
   - Mock tokens fail validation and return 401 Unauthorized

2. **All Protected Routes Require Authentication:**
   - Every API endpoint uses `current_user: Dict[str, Any] = Depends(get_current_user)`
   - This includes project creation, auto-save, and all CRUD operations
   - Tests fail because the frontend can't communicate with the backend

## Solution 1: API Mocking (Recommended)

**Pros:** Complete isolation, fast, reliable, no backend changes needed
**Cons:** Doesn't test real API integration

Use Playwright's route mocking to intercept all backend API calls:

```typescript
// File: e2e/mocks/auth-mock.ts
import { Page } from '@playwright/test';

export async function setupAuthMock(page: Page) {
  // Mock auth endpoints
  await page.route('**/auth/**', async route => {
    // Return mock auth responses
  });
  
  // Mock project endpoints  
  await page.route('**/projects**', async route => {
    // Return mock project responses
  });
}
```

**Usage in tests:**
```typescript
test.beforeEach(async ({ page }) => {
  await setupAuthMock(page);
  // Continue with test setup...
});
```

## Solution 2: Backend Test Mode

**Pros:** Tests real backend logic, easy to implement
**Cons:** Requires backend changes, bypasses auth entirely

Create test-specific dependencies that bypass authentication:

```python
# File: backend/app2/api/test_dependencies.py
async def get_test_user() -> Dict[str, Any]:
    if settings.app.APP_ENV == "prod":
        raise RuntimeError("Test auth bypass cannot be used in production!")
    
    return {
        "id": "b9c0588e-cd7c-4a3f-9bd9-a6f6dcc321ff",
        "email": "test@example.com",
        "name": "Test User"
    }
```

**To implement:**
1. Set environment variable: `APP_ENV=test`
2. Override auth dependencies in FastAPI for test mode
3. Use dependency injection to replace `get_current_user` with `get_test_user`

## Solution 3: Real Test Tokens

**Pros:** Tests complete auth flow, most realistic
**Cons:** Complex setup, requires Supabase test environment

Create real Supabase test users and tokens:

1. Set up Supabase test project
2. Create test users programmatically
3. Generate real JWT tokens for tests
4. Use tokens in test requests

## Recommendation

**Use Solution 1 (API Mocking)** for most tests because:

1. **Fast and Reliable:** No network calls, no external dependencies
2. **Isolated:** Tests only frontend logic
3. **Maintainable:** Easy to update mock responses
4. **CI/CD Friendly:** No backend setup required

**Use Solution 2 (Backend Test Mode)** when you need to test:
- Real database operations
- Complex backend business logic
- Integration between frontend and backend

## Implementation Files

### Created Files:
- `e2e/mocks/auth-mock.ts` - API mocking setup
- `e2e/copy-paste-with-backend-mock.spec.ts` - Test using mocking
- `backend/app2/api/test_dependencies.py` - Test auth bypass
- `backend/app2/api/routes/test_auth.py` - Test token endpoints

### Modified Files:
- `backend/app2/main.py` - Conditionally include test routes

## Environment Variables

For backend test mode, set:
```bash
APP_ENV=test  # Enables test auth endpoints
DEBUG=true    # Enhanced logging
```

## Security Note

Test authentication bypasses should NEVER be available in production. All test-specific code includes environment checks to prevent production usage.