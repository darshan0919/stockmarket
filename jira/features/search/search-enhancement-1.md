## Search API and Search Bar Requirements (StockScans API Integration)

### **Backend (Node.js/Express):**

1. **API Source Restriction:**

   - For `/api/stocks/search`, send all queries and pagination requests directly to `https://www.stockscans.in/api/company/search`.
   - **Do not use or cache any other data sources** for company search, pricing, or metric enrichment.

2. **How to Query:**

   - Issue HTTP requests to the StockScans API with the search term and pagination parameters as provided by the frontend.
   - For pagination, forward `page` and `limit` parameters in the request body as per StockScans API requirements.

3. **API Response Handling:**

   - Forward the essential fields from the StockScans API response directly to the frontend.
   - Standardize the backend response as:
     - `results`: an array of matching company objects containing (at minimum): name, symbol, exchange, current price, price change (+%), and any fields StockScans supplies for dropdown display
     - `total`: total matches (if provided by StockScans)
     - `page`, `limit`: echo back for frontend reference

4. **Example Implementation (in Express):**
   ```js
   app.get("/api/stocks/search", async (req, res) => {
     const { q, page = 1, limit = 10 } = req.query;
     // Call StockScans API
     const apiRes = await axios.post(
       "https://www.stockscans.in/api/company/search",
       { search: q, page, limit }
     );
     // Forward structure
     res.json({
       results: apiRes.data.results, // or relevant prop
       total: apiRes.data.total,
       page: Number(page),
       limit: Number(limit),
     });
   });
   ```
   - **Note:** Adjust based on the exact API spec and error handling.

---

### **Frontend (Next.js/React):**

1. **Paginated Search Consumption:**

   - Update your `SearchBar` to consume paginated results (results, page, total) from the `/api/stocks/search` endpoint.
   - Support in-dropdown pagination (“Show next 10”, etc.).
   - Display a loading indicator during API calls; show “No results found” if empty.

2. **Dropdown Display (Model after StockScans):**
   - Each result: show company name (highlighted), symbol/exchange, current price, and percent change (colored green/red).
   - Keyboard navigation, highlight selection, see more/cycle page if results exceed dropdown.
   - Add “Powered by StockScans” attribution at the bottom.

---

**End of Prompt – All search and dropdown data must use StockScans API as sole backend source for company lookup and pricing.**
