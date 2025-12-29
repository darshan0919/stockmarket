const axios = require('axios');

const NSE_API_URL = 'https://www.nseindia.com/api';

// NSE requires cookies and specific headers to work
const getNseAxiosInstance = () => {
    const instance = axios.create({
        baseURL: NSE_API_URL,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://www.nseindia.com/',
            'Connection': 'keep-alive',
        },
        timeout: 10000,
    });
    return instance;
};

// Helper to format date as DD-MM-YYYY
const formatDate = (date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
};

// Get cookies from NSE homepage first (required for API calls)
let cachedCookies = null;
let cookieExpiry = null;

const getNseCookies = async () => {
    // Return cached cookies if still valid (cache for 5 minutes)
    if (cachedCookies && cookieExpiry && Date.now() < cookieExpiry) {
        return cachedCookies;
    }

    try {
        const response = await axios.get('https://www.nseindia.com/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            timeout: 10000,
        });
        
        const cookies = response.headers['set-cookie'];
        if (cookies) {
            cachedCookies = cookies.map(cookie => cookie.split(';')[0]).join('; ');
            cookieExpiry = Date.now() + 5 * 60 * 1000; // 5 minutes
            return cachedCookies;
        }
    } catch (error) {
        console.error('Error getting NSE cookies:', error.message);
    }
    return null;
};

/**
 * Fetch upcoming financial results from NSE
 * API: https://www.nseindia.com/api/event-calendar?index=equities&from_date=DD-MM-YYYY&to_date=DD-MM-YYYY&subject=Financial%20Results
 */
const upcomingResults = async () => {
    try {
        const cookies = await getNseCookies();
        if (!cookies) {
            console.warn('Could not get NSE cookies, API call may fail');
        }

        const today = new Date();
        const oneYearLater = new Date(today);
        oneYearLater.setFullYear(today.getFullYear() + 1);

        const fromDate = formatDate(today);
        const toDate = formatDate(oneYearLater);

        const response = await axios.get(`${NSE_API_URL}/event-calendar`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': 'https://www.nseindia.com/',
                'Connection': 'keep-alive',
                ...(cookies && { 'Cookie': cookies }),
            },
            params: {
                index: 'equities',
                from_date: fromDate,
                to_date: toDate,
                subject: 'Financial Results',
            },
            timeout: 15000,
        });

        return response.data || [];
    } catch (error) {
        console.error('Error fetching NSE upcoming results:', error.message);
        return [];
    }
};

module.exports = {
    upcomingResults,
    getNseCookies,
    formatDate,
};

