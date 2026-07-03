# Python to JavaScript Migration Map

This document tracks the migration of legacy Python scripts to their JavaScript module equivalents in `@stock/api`.

| Registry ref (dead Python) | Target JS module (exists) |
|---|---|
| `fetchers/fetch_documents.py` | `src/fetchers/documentsFetcher.js` |
| `fetchers/fetch_announcements.py` | `src/fetchers/announcementsFetcher.js` |
| `fetchers/fetch_and_extract.py` | `src/fetchers/announcementScanner.js` |
| `generators/generate_concall_pdf.py` | `src/generators/generateConcallPdf.js` |
| `generators/generate_forensic_pdf.py` | `src/generators/generateForensicPdf.js` |
| `generators/generate_report.py` | `src/generators/generateReport.js` |
| `generators/generate_pdf.py` | `src/generators/generateGrowthTriggersPdf.js` |
| `generators/generate_credibility_widget.py` | `src/generators/generateCredibilityWidget.js` |
| `generators/generate_peer_pdf.py` | `src/generators/generatePeerPdf.js` |
| `generators/generate_market_share_html.py` | `src/generators/generateMarketShareHtml.js` |
| `generators/generate_sector_report.py` | `src/generators/generateSectorReport.js` |
| `generators/generate_drhp_pdf.py` | `src/generators/generateDrhpPdf.js` |
| `analyzers/compute_concentration.py` | `src/analyzers/computeConcentration.js` |
| `analyzers/run_scan.py` | `src/analyzers/runScan.js` |
| `analyzers/scan_catalysts.py` | `src/analyzers/scanCatalysts.js` |
| `analyzers/catalyst_rules.py` | `src/analyzers/catalystRules.js` |
| `analyzers/parse_tweet_dump.py` | `src/analyzers/parseTweetDump.js` |
| `utils/pdf_utils.py` | `src/utils/pdfUtils.js` |
| `utils/doc_generator.py` | `src/utils/docGenerator.js` |
| `stockscans_client.py` | `src/clients/StockscansClient.js` |

*Note: `orchestration/orchestrate.py` and `skill_manager/*.py` remain in Python until Phase 5 porting.*
