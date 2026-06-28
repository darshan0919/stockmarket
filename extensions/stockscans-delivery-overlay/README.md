# StockScans Delivery Volume Overlay

Chrome MV3 extension for `https://www.stockscans.in/charts/*`.

It listens to the StockScans chart page, captures the page's own `1D` OHLCV response and rendered volume-bar geometry, then overlays solid NSE delivery-volume bars on top of the existing light volume bars.

## Requirements

- The chart symbol must be an NSE symbol, for example `NSE:STLTECH`.

## Install

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder:
   `extensions/stockscans-delivery-overlay`

## Behavior

- Activates automatically on StockScans chart pages.
- Draws the overlay only when the selected candle size is `1D`.
- Fetches NSE historical price-volume-deliverable data directly from the bundled extension API modules.

If NSE rejects or times out on a request, the extension shows a small error badge inside the chart pane and leaves the StockScans chart untouched.
