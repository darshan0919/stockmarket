const { upcomingResults } = require('../api/bseIndiaApi');
const { fetchStockDetails } = require('../scripts/stockDetailsFetcher');

const getUpcomingResults = async (req, res, next) => {
    try {
        const page = Number.parseInt(req.query.page || 1);
        const limit = Number.parseInt(req.query.limit || 10);
        const results = await upcomingResults();
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedResults = results.slice(startIndex, endIndex);
        console.log("paginatedResults", paginatedResults);
        const formattedResults = paginatedResults.map(result => ({
            symbol: result.short_name,
            name: result.Long_Name,
            date: result.meeting_date,  
            scrip_code: result.scrip_Code
        }));
        console.log("formattedResults", formattedResults);
        const promises = formattedResults.map(async (result) => {   
            const stockDetails = await fetchStockDetails(result.symbol, result.scrip_code);
            return {
                ...result,
                stockDetails: stockDetails,
            };
        });
        const parsedResults = await Promise.all(promises);



        res.json({
            success: true,
            data: parsedResults,
            hasNext: endIndex < results.length,
            total: results.length,
        });

    } catch (error) {
        next(error);
    }
};

module.exports = {
    getUpcomingResults
};