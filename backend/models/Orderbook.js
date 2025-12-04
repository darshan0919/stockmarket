// order_book_combined.js
// Single-script Order Book Calculator (JavaScript version)
// Example: WAAREERTL

// =========================
// Data structures
// =========================

const OrderEventType = {
  ORDER_INFLOW: "order_inflow",
  ORDER_COMPLETION: "order_completion",
  ORDER_CANCELLATION: "order_cancellation",
  ORDER_UPDATE: "order_update",
};

class OrderBookEntry {
  constructor({
    date,
    valueCr,
    source,
    period,
    segment = null,
    notes = null,
    confidence = 1.0,
  }) {
    this.date = date;
    this.valueCr = valueCr;
    this.source = source;
    this.period = period;
    this.segment = segment;
    this.notes = notes;
    this.confidence = confidence;
  }
}

class OrderEvent {
  constructor({
    date,
    eventType,
    amountCr,
    description,
    customer = null,
    segment = null,
    executionTimelineMonths = null,
    source = "corporate_announcement",
    confidence = 0.9,
  }) {
    this.date = date; // "YYYY-MM-DD"
    this.eventType = eventType;
    this.amountCr = amountCr;
    this.description = description;
    this.customer = customer;
    this.segment = segment;
    this.executionTimelineMonths = executionTimelineMonths;
    this.source = source;
    this.confidence = confidence;
  }
}

// =========================
// Core extractor class
// =========================

class OrderBookExtractor {
  constructor(ticker, bseCode = null) {
    this.ticker = ticker;
    this.bseCode = bseCode;
    this.latestOrderBook = null; // OrderBookEntry
    this.orderEvents = []; // OrderEvent[]
  }

  // ----- STUBS: replace with real fetch/parsing -----

  fetchLatestReports() {
    // Implement: scrape or call APIs for IR documents
    return [];
  }

  fetchCorporateAnnouncements(daysBack = 365) {
    // Implement: scrape or call APIs for BSE/NSE announcements
    return [];
  }

  extractTextFromPdf(pdfPath) {
    // Implement: use pdf-parse, pdfjs, etc.
    return "";
  }

  // ----- Parsing helpers -----

  parseOrderBookFromText(text, documentDate) {
    const entries = [];

    // Direct order book statement
    const patternOb =
      /order\s+book\s+(?:as\s+of)?\s*([0-9]{1,2}[^\dA-Za-z]{0,3}\s*\w+\s*[0-9]{4})[:\s]+[₹Rs\.]*\s*([\d,]+(?:\.\d+)?)\s*(Cr|Crore|cr|crore|Lakh|lakh)/gi;
    let m;
    while ((m = patternOb.exec(text)) !== null) {
      const dateStr = m[1].trim();
      let amount = parseFloat(m[2].replace(/,/g, ""));
      const unit = m[3].toLowerCase();
      if (unit.includes("lakh")) amount = amount / 100.0;
      entries.push(
        new OrderBookEntry({
          date: dateStr,
          valueCr: amount,
          source: "document_text",
          period: "as_reported",
          confidence: 0.95,
        })
      );
    }

    // Pending/backlog
    const patternPending =
      /(pending|backlog|outstanding)\s+(orders?|backlog)\s+(of|valued\s+at)\s*[₹Rs\.]*\s*([\d,]+(?:\.\d+)?)\s*(Cr|Crore|cr|crore|Lakh|lakh)/gi;
    while ((m = patternPending.exec(text)) !== null) {
      let amount = parseFloat(m[4].replace(/,/g, ""));
      const unit = m[5].toLowerCase();
      if (unit.includes("lakh")) amount = amount / 100.0;
      entries.push(
        new OrderBookEntry({
          date: documentDate,
          valueCr: amount,
          source: "document_text",
          period: "pending",
          confidence: 0.9,
        })
      );
    }

    // Inflow mention inside report
    const patternInflow =
      /order\s+(inflow|received|won)\s*[:\s]+[₹Rs\.]*\s*([\d,]+(?:\.\d+)?)\s*(Cr|Crore|cr|crore|Lakh|lakh)/gi;
    while ((m = patternInflow.exec(text)) !== null) {
      let amount = parseFloat(m[2].replace(/,/g, ""));
      const unit = m[3].toLowerCase();
      if (unit.includes("lakh")) amount = amount / 100.0;
      entries.push(
        new OrderBookEntry({
          date: documentDate,
          valueCr: amount,
          source: "document_text",
          period: "inflow",
          confidence: 0.9,
        })
      );
    }

    return entries;
  }

  classifyAnnouncementTitle(title) {
    const t = title.toLowerCase();
    if (
      ["received", "receipt of", "order from", "award", "won", "inflow"].some(
        (k) => t.includes(k)
      )
    )
      return OrderEventType.ORDER_INFLOW;
    if (
      ["completion", "completed", "executed", "execution of"].some((k) =>
        t.includes(k)
      )
    )
      return OrderEventType.ORDER_COMPLETION;
    if (["cancel", "cancellation", "terminated"].some((k) => t.includes(k)))
      return OrderEventType.ORDER_CANCELLATION;
    return OrderEventType.ORDER_UPDATE;
  }

  parseAmountFromText(text) {
    const pattern =
      /[₹Rs\.]*\s*([\d,]+(?:\.\d+)?)\s*(Cr|Crore|cr|crore|Lakh|lakh)/i;
    const m = text.match(pattern);
    if (!m) return 0.0;
    let amt = parseFloat(m[1].replace(/,/g, ""));
    const unit = m[2].toLowerCase();
    if (unit.includes("lakh")) amt = amt / 100.0;
    return amt;
  }

  extractOrderEventsFromAnnouncements(announcements) {
    const events = [];
    for (const ann of announcements) {
      const title = ann.title || "";
      const dateStr = ann.date || "";
      const ttype = this.classifyAnnouncementTitle(title);
      let amount = ann.amountCr;
      if (amount == null) amount = this.parseAmountFromText(title);
      if (!amount || amount <= 0) continue;

      events.push(
        new OrderEvent({
          date: dateStr,
          eventType: ttype,
          amountCr: amount,
          description: title,
          source: "corporate_announcement",
          confidence: 0.9,
        })
      );
    }
    events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return events;
  }

  // ----- Core accumulation and confidence -----

  setLatestOrderBook(valueCr, dateStr, source) {
    this.latestOrderBook = new OrderBookEntry({
      date: dateStr, // "YYYY-MM-DD"
      valueCr,
      source,
      period: "latest_reported",
      confidence: 0.99,
    });
  }

  recencyConfidence(reportDate, today) {
    const msPerDay = 24 * 60 * 60 * 1000;
    const days = Math.round((today - reportDate) / msPerDay);
    if (days <= 30) return 1.0;
    if (days <= 90) return 0.95;
    if (days <= 180) return 0.85;
    if (days <= 365) return 0.75;
    return 0.5;
  }

  accumulate(todayStr = null) {
    if (!this.latestOrderBook) return [0.0, [], 0.0];

    const today = todayStr ? new Date(todayStr) : new Date(); // YYYY-MM-DD or now
    const reportDate = new Date(this.latestOrderBook.date);
    let running = this.latestOrderBook.valueCr;
    const accumulatedEvents = [];

    const sorted = [...this.orderEvents].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0
    );

    for (const ev of sorted) {
      const evDate = new Date(ev.date);
      if (evDate <= reportDate) continue;
      if (ev.eventType === OrderEventType.ORDER_INFLOW) {
        running += ev.amountCr;
      } else if (
        ev.eventType === OrderEventType.ORDER_COMPLETION ||
        ev.eventType === OrderEventType.ORDER_CANCELLATION
      ) {
        running -= ev.amountCr;
      }
      accumulatedEvents.push({
        date: ev.date,
        type: ev.eventType,
        amountCr: ev.amountCr,
        description: ev.description,
        runningTotalCr: running,
      });
    }

    const recConf = this.recencyConfidence(reportDate, today);
    const completeness = 0.9; // placeholder
    const sourceDiversity = this.orderEvents.length ? 1.0 : 0.5;
    const conf = recConf * 0.4 + completeness * 0.3 + sourceDiversity * 0.3;

    return [running, accumulatedEvents, conf];
  }

  // ----- Report generation -----

  generateReport(todayStr = null) {
    if (!this.latestOrderBook)
      throw new Error("latestOrderBook not set before calling generateReport");

    const [calculated, accumulatedEvents, conf] = this.accumulate(todayStr);

    const inflow = accumulatedEvents
      .filter((e) => e.type === OrderEventType.ORDER_INFLOW)
      .reduce((sum, e) => sum + e.amountCr, 0);

    const completed = accumulatedEvents
      .filter(
        (e) =>
          e.type === OrderEventType.ORDER_COMPLETION ||
          e.type === OrderEventType.ORDER_CANCELLATION
      )
      .reduce((sum, e) => sum + e.amountCr, 0);

    const todayIso = todayStr || new Date().toISOString().substring(0, 10); // "YYYY-MM-DD"

    const base = this.latestOrderBook.valueCr;
    const growth = calculated - base;
    const growthPct = base > 0 ? (growth / base) * 100.0 : 0.0;

    return {
      company: {
        ticker: this.ticker,
        bseCode: this.bseCode,
      },
      reportMetadata: {
        generatedDate: todayIso,
        dataAsOf: todayIso,
      },
      orderBookSummary: {
        latestReportedOrderBookCr: base,
        latestReportDate: this.latestOrderBook.date,
        latestReportSource: this.latestOrderBook.source,
        inflowSinceReportCr: inflow,
        completionSinceReportCr: completed,
        calculatedPendingOrderBookCr: calculated,
        orderBookGrowthCr: growth,
        orderBookGrowthPercentage: growthPct,
      },
      recentEvents: accumulatedEvents.slice(-10),
      qualityMetrics: {
        overallConfidenceScore: conf,
        eventsAnalyzed: accumulatedEvents.length,
      },
    };
  }

  printReport(todayStr = null) {
    const report = this.generateReport(todayStr);
    const s = report.orderBookSummary;
    const q = report.qualityMetrics;

    console.log("=".repeat(80));
    console.log(`ORDER BOOK REPORT: ${this.ticker}`);
    console.log("=".repeat(80));
    console.log();
    console.log(
      `Latest reported order book: ₹${s.latestReportedOrderBookCr.toLocaleString(
        "en-IN",
        { maximumFractionDigits: 0 }
      )} Cr (as of ${s.latestReportDate}, source: ${s.latestReportSource})`
    );
    console.log();
    console.log(
      `Inflow since report:      +₹${s.inflowSinceReportCr.toLocaleString(
        "en-IN",
        { maximumFractionDigits: 0 }
      )} Cr`
    );
    console.log(
      `Completion/cancellation: -₹${s.completionSinceReportCr.toLocaleString(
        "en-IN",
        { maximumFractionDigits: 0 }
      )} Cr`
    );
    console.log();
    console.log(
      `CALCULATED PENDING ORDER BOOK: ₹${s.calculatedPendingOrderBookCr.toLocaleString(
        "en-IN",
        { maximumFractionDigits: 0 }
      )} Cr (growth: ${
        s.orderBookGrowthCr >= 0 ? "+" : ""
      }${s.orderBookGrowthCr.toFixed(
        0
      )} Cr, ${s.orderBookGrowthPercentage.toFixed(1)}%)`
    );
    console.log();
    console.log(
      `Overall confidence score: ${(q.overallConfidenceScore * 100).toFixed(
        1
      )}%`
    );
    console.log(`Events analyzed:          ${q.eventsAnalyzed}`);
    console.log();
    console.log("Recent events:");
    for (const ev of report.recentEvents) {
      const sign = ev.type === OrderEventType.ORDER_INFLOW ? "+" : "-";
      console.log(
        `  ${ev.date}  ${sign}₹${ev.amountCr.toLocaleString("en-IN", {
          maximumFractionDigits: 0,
        })} Cr | ${ev.description.slice(
          0,
          70
        )}  (running: ₹${ev.runningTotalCr.toLocaleString("en-IN", {
          maximumFractionDigits: 0,
        })} Cr)`
      );
    }
    console.log("=".repeat(80));
  }

  toJson(todayStr = null) {
    return JSON.stringify(this.generateReport(todayStr), null, 2);
  }
}

// =========================
// Example usage (WAAREERTL)
// =========================

function exampleWaaree() {
  const extractor = new OrderBookExtractor("WAAREERTL", "542693");

  // In real use, set from parsed annual/quarterly report
  extractor.setLatestOrderBook(
    5000.0, // ₹ Cr
    "2025-03-31",
    "Annual_Report_FY24-25"
  );

  // In real use, build from BSE/NSE announcements
  extractor.orderEvents = [
    new OrderEvent({
      date: "2025-09-10",
      eventType: OrderEventType.ORDER_INFLOW,
      amountCr: 300.0,
      description: "Received order for 100 MW Solar EPC from SECI",
    }),
    new OrderEvent({
      date: "2025-10-15",
      eventType: OrderEventType.ORDER_COMPLETION,
      amountCr: 150.0,
      description: "Completion of 50 MW Solar Project for Adani",
    }),
    new OrderEvent({
      date: "2025-11-20",
      eventType: OrderEventType.ORDER_INFLOW,
      amountCr: 250.0,
      description: "Receipt of order from NTPC for 50 MW Solar EPC",
    }),
  ];

  extractor.printReport("2025-12-04");
  // console.log(extractor.toJson("2025-12-04"));
}

// Run example if called directly
if (require.main === module) {
  exampleWaaree();
}

module.exports = {
  OrderBookExtractor,
  OrderEventType,
  OrderEvent,
  OrderBookEntry,
};
