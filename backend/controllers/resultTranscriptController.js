const { getResultAnnoucement } = require('../api/bseIndiaApi');
const { geminiResultAnalysis } = require('../api/geminiApi');

const getResultTranscript = async (req, res, next) => {
    try {
        const { symbol } = req.params;
        const announcement = await getResultAnnoucement(symbol);
        res.json({
            success: true,
            data: announcement,
        });
    } catch (error) {
        next(error);
    }
};

const analyzeTranscript = async (req, res, next) => {
    try {
        const { symbol } = req.params;
        const { attachmentName } = req.body;

        if (!attachmentName) {
            return res.status(400).json({
                success: false,
                error: 'Attachment name is required',
            });
        }

        const response = await geminiResultAnalysis(attachmentName);
        data = JSON.parse(response);
        data.url = `https://www.bseindia.com/xml-data/corpfiling/AttachHis/${attachmentName}`;

        res.json({
            success: true,
            data: data
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getResultTranscript,
    analyzeTranscript
};