# Development Guides & References

Comprehensive guides for development, optimization, and troubleshooting.

## Quick Links

- **[Performance Optimization](PERFORMANCE_OPTIMIZATION_COMPLETE.md)** - Performance optimization guide
- **[Batch Creation Modal](BATCH_CREATION_MODAL.md)** - Batch creation modal implementation
- **[Role-Based Notifications](ROLE_BASED_NOTIFICATIONS.md)** - Role-based notification filtering
- **[Quick Reference](QUICK_REFERENCE.md)** - Quick reference guide
- **[TypeScript Errors Fixed](TYPESCRIPT_ERRORS_FIXED.md)** - TypeScript error solutions
- **[Installation Fix Guide](INSTALLATION_FIX_GUIDE.md)** - Installation troubleshooting

## Performance Optimization

### Key Metrics
- **First Load**: 2-3 seconds with skeleton loaders
- **Repeat Navigation**: <100ms from cache
- **API Call Reduction**: 66% with caching
- **Bundle Size**: Optimized with code splitting
- **Lighthouse Score**: 90+ (target)
- **Time to Interactive**: <3s
- **First Contentful Paint**: <1.5s

### Techniques
- Request caching with TTL
- Skeleton loaders for smooth UX
- Smart loading indicators (100ms threshold)
- React.memo for component optimization
- Code splitting and lazy loading

## Code Style Guidelines

### File Naming
- Components: PascalCase (e.g., `UserProfile.tsx`)
- Services: camelCase (e.g., `userService.ts`)
- Types: PascalCase (e.g., `User.ts`)
- Constants: UPPER_SNAKE_CASE (e.g., `API_ENDPOINTS.ts`)

### Code Standards
- Use TypeScript for type safety
- Follow ESLint configuration
- Use Prettier for code formatting
- Component-based architecture
- Functional components with hooks

## Git Workflow

1. Create feature branches from `develop`
2. Use descriptive commit messages
3. Create pull requests for code review
4. Merge to `main` for production

## Testing

- Unit tests for services
- Integration tests for APIs
- E2E tests for critical flows
- Test coverage: >80%

## Common Patterns

### Import Paths
- JWT guard: `src/common/guards/jwt-auth.guard.ts`
- Services: Use relative paths from component location
- Always check import paths after file moves

### Modal Auto-Opening
- Use URL parameters: `?action=mark`, `?action=leave`
- Check searchParams on mount with `useSearchParams()`
- Auto-open modals based on action parameter

### Sidebar Navigation
- Links use URL parameters to trigger modals
- Allows direct access to modals from sidebar
- Pattern: `/path?action=<action_name>`

## Troubleshooting

### Build Errors
```bash
# Clear .next folder
rm -rf .next

# Reinstall dependencies
rm -rf node_modules && npm install

# Check TypeScript errors
npm run type-check
```

### Import Path Issues
- JWT guard: `src/common/guards/jwt-auth.guard.ts`
- Both attendance and leave controllers need correct import paths
- Use relative paths from component location

### Socket.io Issues
- Verify `NEXT_PUBLIC_SOCKET_URL` points to API
- Check `SOCKET_CORS_ORIGINS` in backend `.env`
- Check browser console for connection errors
