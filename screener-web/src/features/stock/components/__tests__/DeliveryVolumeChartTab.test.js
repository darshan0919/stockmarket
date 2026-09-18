import { render, screen, waitFor } from '@testing-library/react';
import DeliveryVolumeChartTab from '../DeliveryVolumeChartTab';
import { stockAPI } from '../../../../core/lib/api';

jest.mock('../../../../core/lib/api', () => ({
  stockAPI: {
    getDeliveryVolume: jest.fn(),
  },
}));

// Mock lightweight-charts
jest.mock('lightweight-charts', () => ({
  createChart: jest.fn(() => ({
    addCandlestickSeries: jest.fn(() => ({
      applyOptions: jest.fn(),
      setData: jest.fn(),
    })),
    addHistogramSeries: jest.fn(() => ({
      applyOptions: jest.fn(),
      setData: jest.fn(),
    })),
    priceScale: jest.fn(() => ({
      applyOptions: jest.fn(),
    })),
    subscribeCrosshairMove: jest.fn(),
    timeScale: jest.fn(() => ({
      fitContent: jest.fn(),
    })),
    remove: jest.fn(),
  })),
  CrosshairMode: { Normal: 0 },
}));

describe('DeliveryVolumeChartTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders Candle and Range headers and displays last candle details when not hovering', async () => {
    stockAPI.getDeliveryVolume.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          candles: [
            {
              time: '2026-09-17',
              open: 2200,
              high: 2250,
              low: 2190,
              close: 2230,
              volume: 100000,
              deliveryVolume: 50000,
              deliveryPercent: 50.0,
            },
            {
              time: '2026-09-18',
              open: 2236.2,
              high: 2618,
              low: 2218.3,
              close: 2537.7,
              volume: 4310981,
              deliveryVolume: 1369122,
              deliveryPercent: 31.76,
            },
          ],
        },
      },
    });

    render(<DeliveryVolumeChartTab symbol="AVALON" />);

    // Header labels present
    expect(screen.getByText('Candle:')).toBeInTheDocument();
    expect(screen.getByText('Range:')).toBeInTheDocument();

    // Verify last candle details rendered when not hovering
    await waitFor(() => {
      expect(screen.getByText('2026-09-18')).toBeInTheDocument();
      expect(screen.getByText('2537.7')).toBeInTheDocument();
      expect(screen.getByText('31.76')).toBeInTheDocument();
    });
  });
});
