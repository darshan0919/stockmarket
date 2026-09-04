const { getResultAnnoucement } = require('../../core/api/bseIndiaApi');

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

module.exports = {
  getResultTranscript,
};
