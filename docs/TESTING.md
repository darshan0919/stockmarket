# Testing Guide

> **Document Type**: Testing Documentation  
> **Last Updated**: 2024-12-31

## Overview

This project uses Jest as the testing framework for both backend and frontend code.

## Test Structure

```
stockmarket/
├── backend/
│   ├── tests/                          # Backend tests
│   │   └── stockController.test.js
│   ├── api/__tests__/                  # API module tests
│   ├── utils/__tests__/                # Utility tests
│   └── jest.config.js
└── frontend/
    ├── components/
    │   └── stock/__tests__/            # Component tests
    │       └── QuarterlyResults.test.js
    ├── lib/__tests__/                  # Hook and utility tests
    ├── jest.config.js
    └── jest.setup.js
```

## Running Tests

### Backend

```bash
# From repository root (recommended)
yarn workspace stock-screener-backend test
yarn workspace stock-screener-backend test:watch

# Or from backend/
cd backend && yarn test
cd backend && yarn test:watch
```

### Frontend

```bash
# From repository root (recommended)
yarn workspace stock-screener-frontend test
yarn workspace stock-screener-frontend test:watch

# Or from frontend/
cd frontend && yarn test
cd frontend && yarn test:watch
```

### All workspaces (root)

```bash
yarn test
```

## Backend Testing

### Configuration (`backend/jest.config.js`)

```javascript
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js', '**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'controllers/**/*.js',
    'utils/**/*.js',
    'api/**/*.js',
    '!**/node_modules/**',
  ],
  testTimeout: 20000,
  verbose: true,
};
```

### Writing Controller Tests

```javascript
// backend/tests/exampleController.test.js

const request = require('supertest');
const express = require('express');
const router = require('../routes/example');

// Mock dependencies
jest.mock('../models/Example');
jest.mock('axios');

// Create test app
const app = express();
app.use(express.json());
app.use('/api/example', router);
app.use((err, req, res, next) => {
  res.status(500).json({ success: false, error: err.message });
});

describe('Example Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/example', () => {
    it('should return data successfully', async () => {
      // Arrange
      ExampleModel.find = jest.fn().mockResolvedValue([{ id: 1 }]);

      // Act
      const response = await request(app)
        .get('/api/example')
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });

    it('should handle errors gracefully', async () => {
      ExampleModel.find = jest.fn().mockRejectedValue(new Error('DB error'));

      const response = await request(app)
        .get('/api/example')
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });
});
```

### Writing Utility Tests

```javascript
// backend/utils/__tests__/technicalIndicators.test.js

const { calculateSMA, calculateEMA, calculateRSI } = require('../technicalIndicators');

describe('Technical Indicators', () => {
  describe('calculateSMA', () => {
    it('should calculate SMA correctly', () => {
      const prices = [10, 20, 30, 40, 50];
      const result = calculateSMA(prices, 3);
      
      expect(result).toEqual([20, 30, 40]);
    });

    it('should return empty array for insufficient data', () => {
      const result = calculateSMA([10, 20], 5);
      
      expect(result).toEqual([]);
    });

    it('should handle null input', () => {
      const result = calculateSMA(null, 5);
      
      expect(result).toEqual([]);
    });
  });
});
```

### Writing API Integration Tests

```javascript
// backend/api/__tests__/nseIndiaApi.test.js

const axios = require('axios');
const { upcomingResults, formatDate, getNseCookies } = require('../nseIndiaApi');

jest.mock('axios');

describe('NSE India API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('formatDate', () => {
    it('should format date correctly', () => {
      const date = new Date('2024-01-15');
      const result = formatDate(date);
      
      expect(result).toBe('15-01-2024');
    });
  });

  describe('getNseCookies', () => {
    it('should fetch and cache cookies', async () => {
      axios.get.mockResolvedValueOnce({
        headers: { 'set-cookie': ['cookie1=value1; path=/', 'cookie2=value2'] }
      });

      const cookies = await getNseCookies();

      expect(cookies).toContain('cookie1=value1');
      expect(axios.get).toHaveBeenCalledWith(
        'https://www.nseindia.com/',
        expect.any(Object)
      );
    });
  });
});
```

## Frontend Testing

### Configuration (`frontend/jest.config.js`)

```javascript
const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/components/(.*)$': '<rootDir>/components/$1',
    '^@/lib/(.*)$': '<rootDir>/lib/$1',
  },
  collectCoverageFrom: [
    'components/**/*.{js,jsx}',
    'lib/**/*.{js,jsx}',
  ],
  testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
};

module.exports = createJestConfig(customJestConfig);
```

### Writing Component Tests

```javascript
// frontend/components/__tests__/SearchBar.test.js

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/router';
import SearchBar from '../common/SearchBar';
import { stockAPI } from '../../lib/api';

// Mock dependencies
jest.mock('next/router', () => ({
  useRouter: jest.fn(),
}));

jest.mock('../../lib/api', () => ({
  stockAPI: {
    search: jest.fn(),
  },
}));

describe('SearchBar', () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useRouter.mockReturnValue({ push: mockPush });
  });

  it('renders search input', () => {
    render(<SearchBar />);
    
    expect(screen.getByPlaceholderText('Search stocks...')).toBeInTheDocument();
  });

  it('shows loading state during search', async () => {
    stockAPI.search.mockReturnValue(new Promise(() => {})); // Never resolves
    
    render(<SearchBar />);
    const input = screen.getByPlaceholderText('Search stocks...');
    
    await userEvent.type(input, 'REL');
    
    await waitFor(() => {
      expect(screen.getByText('Searching...')).toBeInTheDocument();
    });
  });

  it('displays search results', async () => {
    stockAPI.search.mockResolvedValue({
      data: {
        success: true,
        results: [{ symbol: 'RELIANCE', name: 'Reliance Industries' }],
        total: 1,
      },
    });
    
    render(<SearchBar />);
    await userEvent.type(screen.getByPlaceholderText('Search stocks...'), 'REL');
    
    await waitFor(() => {
      expect(screen.getByText(/Reliance Industries/)).toBeInTheDocument();
    });
  });

  it('navigates to stock page on selection', async () => {
    stockAPI.search.mockResolvedValue({
      data: {
        success: true,
        results: [{ symbol: 'RELIANCE', name: 'Reliance Industries' }],
        total: 1,
      },
    });
    
    render(<SearchBar />);
    await userEvent.type(screen.getByPlaceholderText('Search stocks...'), 'REL');
    
    await waitFor(() => {
      fireEvent.click(screen.getByText(/Reliance Industries/));
    });
    
    expect(mockPush).toHaveBeenCalledWith('/stock/RELIANCE');
  });
});
```

### Writing Hook Tests

```javascript
// frontend/lib/hooks/__tests__/useMarket.test.js

import { renderHook, waitFor } from '@testing-library/react';
import { useMarket } from '../useMarket';
import { marketAPI } from '../../api';

jest.mock('../../api', () => ({
  marketAPI: {
    getIndices: jest.fn(),
  },
}));

describe('useMarket', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch market data on mount', async () => {
    const mockData = {
      nifty50: { current: 19000, change: 100 },
    };
    marketAPI.getIndices.mockResolvedValue({
      data: { success: true, data: mockData },
    });

    const { result } = renderHook(() => useMarket());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.marketData).toEqual(mockData);
    });
  });

  it('should handle errors', async () => {
    marketAPI.getIndices.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useMarket());

    await waitFor(() => {
      expect(result.current.error).toBe('Network error');
    });
  });
});
```

### Writing Utility Tests

```javascript
// frontend/lib/utils/__tests__/formatters.test.js

import {
  formatCurrency,
  formatLargeNumber,
  formatPercent,
  formatPercentage,
  formatDate,
  getChangeColor,
} from '../formatters';

describe('Formatters', () => {
  describe('formatCurrency', () => {
    it('should format currency in Indian format', () => {
      expect(formatCurrency(1234.56)).toBe('₹1,234.56');
    });

    it('should return N/A for null', () => {
      expect(formatCurrency(null)).toBe('N/A');
    });

    it('should return N/A for undefined', () => {
      expect(formatCurrency(undefined)).toBe('N/A');
    });
  });

  describe('formatLargeNumber', () => {
    it('should format billions', () => {
      expect(formatLargeNumber(1500000000)).toBe('₹1.50B');
    });

    it('should format crores', () => {
      expect(formatLargeNumber(15000000)).toBe('₹1.50Cr');
    });

    it('should format lakhs', () => {
      expect(formatLargeNumber(150000)).toBe('₹1.50L');
    });
  });

  describe('formatPercentage', () => {
    it('should add positive sign', () => {
      expect(formatPercentage(12.5)).toBe('+12.50%');
    });

    it('should show negative sign', () => {
      expect(formatPercentage(-5.5)).toBe('-5.50%');
    });
  });

  describe('getChangeColor', () => {
    it('should return positive class for positive value', () => {
      expect(getChangeColor(10)).toBe('text-positive');
    });

    it('should return negative class for negative value', () => {
      expect(getChangeColor(-10)).toBe('text-negative');
    });

    it('should return gray class for zero', () => {
      expect(getChangeColor(0)).toBe('text-gray-600');
    });
  });
});
```

## Mocking Patterns

### Mocking Axios

```javascript
jest.mock('axios');

axios.get.mockResolvedValue({ data: { ... } });
axios.post.mockRejectedValue(new Error('Network error'));
```

### Mocking Mongoose Models

```javascript
jest.mock('../models/Stock');

Stock.find = jest.fn().mockReturnValue({
  lean: jest.fn().mockResolvedValue([]),
});

Stock.findOne = jest.fn().mockReturnValue({
  lean: jest.fn().mockResolvedValue(null),
});
```

### Mocking Next.js Router

```javascript
jest.mock('next/router', () => ({
  useRouter: jest.fn().mockReturnValue({
    push: jest.fn(),
    query: { symbol: 'TEST' },
  }),
}));
```

## Test Coverage

### Viewing Coverage Reports

```bash
# Backend
yarn workspace stock-screener-backend test
open backend/coverage/lcov-report/index.html

# Frontend
yarn workspace stock-screener-frontend test
open frontend/coverage/lcov-report/index.html
```

### Coverage Thresholds

Recommended minimum coverage:
- Statements: 80%
- Branches: 75%
- Functions: 80%
- Lines: 80%

## Best Practices

1. **Test file naming**: `*.test.js` or `*.spec.js`
2. **Test location**: In `__tests__/` folder next to source files
3. **Clear mocks**: Always `jest.clearAllMocks()` in `beforeEach`
4. **Async testing**: Use `await` and `waitFor` for async operations
5. **Descriptive names**: Use clear `describe` and `it` blocks
6. **Arrange-Act-Assert**: Structure tests clearly
7. **Test edge cases**: Null, undefined, empty arrays, errors
8. **Isolate tests**: Each test should be independent

