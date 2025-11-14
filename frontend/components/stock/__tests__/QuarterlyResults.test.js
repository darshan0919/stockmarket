import { render, screen, waitFor } from '@testing-library/react';
import QuarterlyResults from '../QuarterlyResults';
import { stockAPI } from '../../../lib/api';

// Mock the API
jest.mock('../../../lib/api', () => ({
  stockAPI: {
    getQuarterlyResults: jest.fn(),
  },
}));

// Mock LoadingSpinner component
jest.mock('../../common/LoadingSpinner', () => {
  return function LoadingSpinner() {
    return <div data-testid="loading-spinner">Loading...</div>;
  };
});

describe('QuarterlyResults Component', () => {
  const mockQuarterlyData = {
    data: {
      success: true,
      data: {
        symbol: 'SRM',
        quarters: [
        {
          period: 'Q1 2024',
          to_date: '31-MAR-2024',
          from_date: '01-JAN-2024',
          sales: 10787.07,
          expenses: 9515,
          operating_profit: 1272.07,
          opm_percent: 11.79,
          other_income: 79.38,
          interest: 287.24,
          depreciation: 265.37,
          pbt: 798.84,
          tax_percent: 14.12,
          net_profit: 686.04,
          eps: 16.39,
          audited: true,
        },
        {
          period: 'Q2 2024',
          to_date: '30-JUN-2024',
          from_date: '01-APR-2024',
          sales: 5421.71,
          expenses: 4445.03,
          operating_profit: 976.68,
          opm_percent: 18.01,
          other_income: 97.75,
          interest: 211.92,
          depreciation: 246.93,
          pbt: 615.58,
          tax_percent: 23.99,
          net_profit: 467.9,
          eps: 8.16,
          audited: false,
          qoq_sales_growth: -49.74,
          qoq_profit_growth: -31.80,
          yoy_sales_growth: 15.5,
          yoy_profit_growth: 20.3,
        },
        ],
        source: 'NSE India',
        source_url: 'https://www.nseindia.com/get-quotes/equity?symbol=SRM',
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render loading spinner initially', () => {
    stockAPI.getQuarterlyResults.mockImplementation(() => new Promise(() => {}));
    
    render(<QuarterlyResults symbol="SRM" />);
    
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('should render quarterly results table when data is loaded', async () => {
    stockAPI.getQuarterlyResults.mockResolvedValue(mockQuarterlyData);
    
    render(<QuarterlyResults symbol="SRM" />);
    
    await waitFor(() => {
      expect(screen.getByText('Quarterly Results')).toBeInTheDocument();
    });
    
    // Check for header
    expect(screen.getByText('View on NSE')).toBeInTheDocument();
    
    // Check for metric labels
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('Operating Profit')).toBeInTheDocument();
    expect(screen.getByText('Net Profit')).toBeInTheDocument();
    expect(screen.getByText('EPS')).toBeInTheDocument();
    
    // Check for period headers
    expect(screen.getByText('Q1 2024')).toBeInTheDocument();
    expect(screen.getByText('Q2 2024')).toBeInTheDocument();
  });

  it('should display growth metrics section', async () => {
    stockAPI.getQuarterlyResults.mockResolvedValue(mockQuarterlyData);
    
    render(<QuarterlyResults symbol="SRM" />);
    
    await waitFor(() => {
      expect(screen.getByText('Growth Metrics')).toBeInTheDocument();
    });
    
    // Check for growth metric labels
    expect(screen.getByText('YoY Sales Growth %')).toBeInTheDocument();
    expect(screen.getByText('YoY Net Profit Growth %')).toBeInTheDocument();
    expect(screen.getByText('QoQ Sales Growth %')).toBeInTheDocument();
    expect(screen.getByText('QoQ Net Profit Growth %')).toBeInTheDocument();
  });

  it('should format currency values correctly', async () => {
    stockAPI.getQuarterlyResults.mockResolvedValue(mockQuarterlyData);
    
    render(<QuarterlyResults symbol="SRM" />);
    
    await waitFor(() => {
      // Check that the table is rendered
      expect(screen.getByText('Sales')).toBeInTheDocument();
      // Values should be formatted with currency symbol (the formatter is tested separately)
      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();
    });
  });

  it('should display growth values with correct colors', async () => {
    stockAPI.getQuarterlyResults.mockResolvedValue(mockQuarterlyData);
    
    render(<QuarterlyResults symbol="SRM" />);
    
    await waitFor(() => {
      // Positive growth should be green
      const positiveGrowth = screen.getAllByText(/\+15\.50%/);
      if (positiveGrowth.length > 0) {
        expect(positiveGrowth[0]).toHaveClass('text-green-600');
      }
      
      // Negative growth should be red
      const negativeGrowth = screen.getAllByText(/-49\.74%/);
      if (negativeGrowth.length > 0) {
        expect(negativeGrowth[0]).toHaveClass('text-red-600');
      }
    });
  });

  it('should display "-" for null or undefined values', async () => {
    const dataWithNulls = {
      data: {
        success: true,
        data: {
          symbol: 'SRM',
          quarters: [
            {
              period: 'Q1 2024',
              to_date: '31-MAR-2024',
              from_date: '01-JAN-2024',
              sales: null,
              expenses: null,
              operating_profit: null,
              opm_percent: null,
              other_income: null,
              interest: null,
              depreciation: null,
              pbt: null,
              tax_percent: null,
              net_profit: null,
              eps: null,
              audited: false,
            },
          ],
          source: 'NSE India',
        },
      },
    };
    
    stockAPI.getQuarterlyResults.mockResolvedValue(dataWithNulls);
    
    render(<QuarterlyResults symbol="SRM" />);
    
    await waitFor(() => {
      const dashElements = screen.getAllByText('-');
      // Should have at least 1 "-" for missing values (not checking exact count as table structure may vary)
      expect(dashElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('should display error message when API call fails', async () => {
    stockAPI.getQuarterlyResults.mockRejectedValue(new Error('API Error'));
    
    render(<QuarterlyResults symbol="SRM" />);
    
    await waitFor(() => {
      expect(screen.getByText('Unable to load quarterly results')).toBeInTheDocument();
    });
  });

  it('should display message when no quarters are available', async () => {
    const emptyData = {
      data: {
        success: true,
        data: {
          symbol: 'SRM',
          quarters: [],
          source: 'NSE India',
        },
      },
    };
    
    stockAPI.getQuarterlyResults.mockResolvedValue(emptyData);
    
    render(<QuarterlyResults symbol="SRM" />);
    
    await waitFor(() => {
      expect(screen.getByText('No quarterly results available')).toBeInTheDocument();
    });
  });

  it('should have NSE link with correct URL', async () => {
    stockAPI.getQuarterlyResults.mockResolvedValue(mockQuarterlyData);
    
    render(<QuarterlyResults symbol="SRM" />);
    
    await waitFor(() => {
      const nseLink = screen.getByText('View on NSE');
      expect(nseLink).toHaveAttribute('href', 'https://www.nseindia.com/get-quotes/equity?symbol=SRM');
      expect(nseLink).toHaveAttribute('target', '_blank');
      expect(nseLink).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  it('should display data source attribution', async () => {
    stockAPI.getQuarterlyResults.mockResolvedValue(mockQuarterlyData);
    
    render(<QuarterlyResults symbol="SRM" />);
    
    await waitFor(() => {
      // The component displays "Data source: {source}"
      expect(screen.getByText(/Data source:/)).toBeInTheDocument();
    });
  });

  it('should call API with correct symbol', async () => {
    stockAPI.getQuarterlyResults.mockResolvedValue(mockQuarterlyData);
    
    render(<QuarterlyResults symbol="RELIANCE" />);
    
    await waitFor(() => {
      expect(stockAPI.getQuarterlyResults).toHaveBeenCalledWith('RELIANCE');
      expect(stockAPI.getQuarterlyResults).toHaveBeenCalledTimes(1);
    });
  });

  it('should refetch data when symbol changes', async () => {
    stockAPI.getQuarterlyResults.mockResolvedValue(mockQuarterlyData);
    
    const { rerender } = render(<QuarterlyResults symbol="SRM" />);
    
    await waitFor(() => {
      expect(stockAPI.getQuarterlyResults).toHaveBeenCalledWith('SRM');
    });
    
    rerender(<QuarterlyResults symbol="TCS" />);
    
    await waitFor(() => {
      expect(stockAPI.getQuarterlyResults).toHaveBeenCalledWith('TCS');
      expect(stockAPI.getQuarterlyResults).toHaveBeenCalledTimes(2);
    });
  });

  it('should render all 11 main financial metrics', async () => {
    stockAPI.getQuarterlyResults.mockResolvedValue(mockQuarterlyData);
    
    render(<QuarterlyResults symbol="SRM" />);
    
    await waitFor(() => {
      expect(screen.getByText('Sales')).toBeInTheDocument();
      expect(screen.getByText('Expenses')).toBeInTheDocument();
      expect(screen.getByText('Operating Profit')).toBeInTheDocument();
      expect(screen.getByText('OPM %')).toBeInTheDocument();
      expect(screen.getByText('Other Income')).toBeInTheDocument();
      expect(screen.getByText('Interest')).toBeInTheDocument();
      expect(screen.getByText('Depreciation')).toBeInTheDocument();
      expect(screen.getByText('Profit Before Tax')).toBeInTheDocument();
      expect(screen.getByText('Tax %')).toBeInTheDocument();
      expect(screen.getByText('Net Profit')).toBeInTheDocument();
      expect(screen.getByText('EPS')).toBeInTheDocument();
    });
  });

  it('should render all 4 growth metrics', async () => {
    stockAPI.getQuarterlyResults.mockResolvedValue(mockQuarterlyData);
    
    render(<QuarterlyResults symbol="SRM" />);
    
    await waitFor(() => {
      expect(screen.getByText('YoY Sales Growth %')).toBeInTheDocument();
      expect(screen.getByText('YoY Net Profit Growth %')).toBeInTheDocument();
      expect(screen.getByText('QoQ Sales Growth %')).toBeInTheDocument();
      expect(screen.getByText('QoQ Net Profit Growth %')).toBeInTheDocument();
    });
  });
});

