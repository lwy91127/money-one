const https = require('https');

const BASE_URL = 'https://www.alphavantage.co/query';
const CACHE_TTL_MS = 1000 * 60 * 20;
const memoryCache = new Map();

function getJson(url) {
  return new Promise((resolve, reject) => {
    const request = https
      .get(url, (response) => {
        let body = '';
        response.on('data', (chunk) => {
          body += chunk;
          if (body.length > 1024 * 1024) {
            request.destroy(new Error('Alpha Vantage response is too large.'));
          }
        });
        response.on('end', () => {
          if (response.statusCode && response.statusCode >= 400) {
            reject(new Error(`Alpha Vantage HTTP ${response.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject);
    request.setTimeout(8000, () => {
      request.destroy(new Error('Alpha Vantage request timed out.'));
    });
  });
}

async function queryAlphaVantage(params) {
  const key = JSON.stringify(params);
  const cached = memoryCache.get(key);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return cached.value;
  const searchParams = new URLSearchParams(params);
  const value = await getJson(`${BASE_URL}?${searchParams.toString()}`);
  memoryCache.set(key, { createdAt: Date.now(), value });
  return value;
}

function apiKeyFrom(event) {
  return process.env.ALPHA_VANTAGE_API_KEY || event.apiKey || '';
}

function normalizeQuote(instrument, payload) {
  const daily = payload['Time Series (Daily)'];
  if (!daily) {
    return {
      instrumentId: instrument.instrumentId,
      symbol: instrument.symbol,
      price: { amount: '0.0000', currency: instrument.currency || 'USD' },
      asOf: new Date().toISOString().slice(0, 10),
      source: 'alpha_vantage',
      stale: true,
      raw: payload
    };
  }
  const latestDate = Object.keys(daily).sort().reverse()[0];
  const close = daily[latestDate]['4. close'];
  return {
    instrumentId: instrument.instrumentId,
    symbol: instrument.symbol,
    price: { amount: Number(close).toFixed(4), currency: instrument.currency || 'USD' },
    asOf: latestDate,
    source: 'alpha_vantage',
    stale: false,
    raw: payload['Meta Data']
  };
}

function normalizeFx(base, quote, payload) {
  const rate = payload['Realtime Currency Exchange Rate'];
  if (!rate) {
    return {
      base,
      quote,
      rate: '1.0000',
      asOf: new Date().toISOString().slice(0, 10),
      source: 'alpha_vantage',
      stale: true,
      raw: payload
    };
  }
  return {
    base,
    quote,
    rate: Number(rate['5. Exchange Rate']).toFixed(4),
    asOf: `${rate['6. Last Refreshed'] || new Date().toISOString()}`,
    source: 'alpha_vantage',
    stale: false,
    raw: rate
  };
}

module.exports = {
  apiKeyFrom,
  normalizeFx,
  normalizeQuote,
  queryAlphaVantage
};
