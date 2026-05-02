# Contributing Guide

> **Document Type**: Contribution Guidelines  
> **Last Updated**: 2024-12-31

## Overview

This guide outlines the standards and practices for contributing to the Stock Screener project.

## Development Workflow

### 1. Setup Development Environment

```bash
# Clone repository
git clone <repository-url>
cd stockmarket

# Install dependencies (Yarn 3 workspaces — single install at root)
corepack enable
yarn install
```

### 2. Create Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 3. Make Changes

Follow the coding standards below and ensure:
- Code is formatted with Prettier
- All tests pass
- New features have tests
- Documentation is updated

### 4. Submit Pull Request

- Write clear PR description
- Reference any related issues
- Ensure CI checks pass

## Coding Standards

### General

- Use ES6+ JavaScript features
- Prefer `const` over `let`, avoid `var`
- Use async/await over callbacks
- Add JSDoc comments to functions

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Variables | camelCase | `stockData` |
| Functions | camelCase | `fetchStockData()` |
| Constants | UPPER_SNAKE_CASE | `API_BASE_URL` |
| Components | PascalCase | `SearchBar` |
| Files | camelCase.js | `stockController.js` |
| Test files | *.test.js | `stockController.test.js` |

### Code Formatting

This project uses Prettier with the following configuration:

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

Format code before committing:

```bash
yarn format
```

## Documentation Requirements

### Every New Feature Must Include:

1. **JSDoc Comments** in code
2. **README updates** if API changes
3. **Test documentation** for new tests

### JSDoc Example

```javascript
/**
 * Calculate Simple Moving Average for a price series
 * 
 * @param {number[]} prices - Array of closing prices
 * @param {number} period - Number of periods for SMA calculation
 * @returns {number[]} Array of SMA values
 * 
 * @example
 * const prices = [10, 20, 30, 40, 50];
 * const sma = calculateSMA(prices, 3);
 * // Returns: [20, 30, 40]
 * 
 * @see {@link docs/backend/utils/technicalIndicators.md} for detailed documentation
 */
function calculateSMA(prices, period) {
  // Implementation
}
```

## Testing Requirements

### All Changes Must:

1. Have passing tests
2. Maintain or improve coverage
3. Include tests for new functionality

### Test Structure

```javascript
describe('ModuleName', () => {
  describe('functionName', () => {
    beforeEach(() => {
      // Setup
    });

    it('should do expected behavior', () => {
      // Arrange
      // Act
      // Assert
    });

    it('should handle edge case', () => {
      // Test edge cases
    });

    it('should handle errors gracefully', () => {
      // Test error handling
    });
  });
});
```

## Commit Messages

Use conventional commits:

```
type(scope): description

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Formatting, no code change |
| `refactor` | Code refactoring |
| `test` | Adding tests |
| `chore` | Maintenance tasks |

### Examples

```
feat(api): add quarterly results endpoint

- Add GET /api/stocks/:symbol/quarterly
- Parse XBRL data from NSE
- Cache results in MongoDB

Closes #123
```

```
fix(search): handle empty search results

The search bar now properly displays "No results found"
when the API returns an empty array.
```

## Pull Request Checklist

Before submitting a PR, ensure:

- [ ] Code follows the style guide
- [ ] Code is formatted with Prettier (`yarn format` from repo root)
- [ ] All tests pass (`yarn test` from repo root)
- [ ] New tests added for new features
- [ ] Documentation is updated
- [ ] No console.log statements (except for debugging during development)
- [ ] No commented-out code
- [ ] PR description explains the changes

## File Organization

### Adding New Backend Feature

```
backend/
├── routes/newFeature.js           # Route definitions
├── controllers/newFeatureController.js  # Business logic
├── models/NewModel.js             # Data model (if needed)
├── tests/newFeature.test.js       # Tests
└── utils/newHelper.js             # Helper functions (if needed)
```

### Adding New Frontend Component

```
frontend/
├── components/
│   └── newFeature/
│       ├── NewComponent.js        # Component
│       └── __tests__/
│           └── NewComponent.test.js  # Tests
└── lib/
    └── hooks/
        └── useNewFeature.js       # Custom hook (if needed)
```

## Code Review Guidelines

### As a Reviewer

- Check for code correctness
- Verify tests are adequate
- Ensure documentation is updated
- Provide constructive feedback
- Approve only when all standards are met

### As an Author

- Respond to all comments
- Make requested changes or explain why not
- Keep PRs focused and reasonably sized
- Be open to feedback

## Questions?

If you have questions about contributing:

1. Check existing documentation
2. Look at similar code in the codebase
3. Open a discussion issue

## AI Agent Guidelines

When using AI agents to contribute:

1. **Always check cursor rules** in `.cursor/rules/` before making changes
2. **Run tests** after making changes
3. **Update documentation** for any new features
4. **Follow existing patterns** in the codebase
5. **Reference code locations** in documentation for easy navigation

