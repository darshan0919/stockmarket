const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ModelResponse = require('../models/ModelResponse');
const BSE_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// Read the earning call prompt from file
const earningCallPrompt = fs.readFileSync(
    path.join(__dirname, '../prompts/earning_call.txt'),
    'utf-8'
);

const promptHash = crypto.createHash('sha256').update(earningCallPrompt).digest('hex');
const geminiResultAnalysis = async (attachmentName) => {
    const fileUri = `https://www.bseindia.com/xml-data/corpfiling/AttachHis/${attachmentName}`;

    const existingResponse = await ModelResponse.findOne({ attachment_name: fileUri, prompt: promptHash });
    if (existingResponse) {
        return existingResponse.response;
    }
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const response = await axios.post(
        `${BSE_API_URL}`,
        {
            "contents": [
                {
                    "parts": [
                        {
                            "text": earningCallPrompt
                        },
                        {
                            "file_data": { "mime_type": "application/pdf", "file_uri": fileUri }
                        }
                    ]
                }
            ]
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': geminiApiKey,
            },
            timeout: 200000,
        }
    );
    const extractedText = response.data.candidates[0].content.parts[0].text;
    const newModelResponse = new ModelResponse({
        attachment_name: fileUri,
        prompt: promptHash,
        response: extractedText,
    });
    await newModelResponse.save();
    return extractedText;
};

module.exports = {
    geminiResultAnalysis
};