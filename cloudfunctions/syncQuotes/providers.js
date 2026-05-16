const https = require('https');

const CACHE_TTL_MS = 1000 * 60 * 10;
const REQUEST_TIMEOUT_MS = 900;
const memoryCache = new Map();

function getText(url, headers = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = https
      .get(url, { headers: { 'User-Agent': 'Mozilla/5.0 money-manager-miniapp', ...headers } }, (response) => {
        let body = '';
        response.on('data', (chunk) => {
          body += chunk;
          if (body.length > 1024 * 1024) {
            request.destroy(new Error('Quote response is too large.'));
          }
        });
        response.on('end', () => {
          if (settled) return;
          settled = true;
          if (response.statusCode && response.statusCode >= 400) {
            reject(new Error(`HTTP ${response.statusCode}`));
            return;
          }
          resolve(body);
        });
      })
      .on('error', (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      });
    request.setTimeout(timeoutMs, () => {
      if (settled) return;
      settled = true;
      request.destroy();
      reject(new Error(`Quote request timed out after ${timeoutMs}ms.`));
    });
  });
}

async function getCachedText(url, headers) {
  const key = `${url}:${JSON.stringify(headers || {})}`;
  const cached = memoryCache.get(key);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return cached.value;
  const value = await getText(url, headers);
  memoryCache.set(key, { createdAt: Date.now(), value });
  return value;
}

async function getJson(url, headers) {
  const text = await getCachedText(url, headers);
  return JSON.parse(text);
}

function keyFrom(name, event) {
  return process.env[name] || event?.apiKeys?.[name] || event?.[name] || '';
}

function numberValue(value) {
  if (value === undefined || value === null || value === '' || value === '-') return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

function amount(value) {
  const numeric = numberValue(value);
  return numeric === undefined ? undefined : numeric.toFixed(4);
}

function staleQuote(instrument, source, raw) {
  return {
    instrumentId: instrument.instrumentId,
    symbol: instrument.symbol,
    price: { amount: '0.0000', currency: instrument.currency || 'USD' },
    asOf: new Date().toISOString().slice(0, 10),
    source,
    stale: true,
    raw
  };
}

function quoteFrom(instrument, source, price, asOf, raw) {
  const normalized = amount(price);
  if (!normalized) return staleQuote(instrument, source, raw);
  return {
    instrumentId: instrument.instrumentId,
    symbol: instrument.symbol,
    price: { amount: normalized, currency: instrument.currency || raw?.currency || 'USD' },
    asOf: asOf || new Date().toISOString().slice(0, 10),
    source,
    stale: false,
    raw
  };
}

function isCnCurrency(instrument) {
  return String(instrument.currency || '').toUpperCase() === 'CNY';
}

function isHkCurrency(instrument) {
  return String(instrument.currency || '').toUpperCase() === 'HKD';
}

function isFundLike(instrument) {
  const kind = String(instrument.kind || '').toLowerCase();
  const market = String(instrument.market || '').toLowerCase();
  const source = String(instrument.source || '').toLowerCase();
  return kind.includes('fund') || kind.includes('etf') || market.includes('fund') || source.includes('fund');
}

function eastmoneySecId(instrument) {
  const raw = String(instrument.symbol || '').trim().toUpperCase();
  const symbol = raw.replace(/\.(SS|SH|SZ|HK)$/i, '');
  if (isHkCurrency(instrument)) return `116.${symbol.padStart(5, '0')}`;
  if (!isCnCurrency(instrument)) return '';
  if (/^(6|9|5|11)/.test(symbol)) return `1.${symbol}`;
  if (/^(0|2|3|15|12)/.test(symbol)) return `0.${symbol}`;
  return '';
}

function yahooSymbol(instrument) {
  const raw = String(instrument.symbol || '').trim().toUpperCase();
  if (!raw) return '';
  if (raw.includes('.')) return raw;
  if (isHkCurrency(instrument) && /^\d{1,5}$/.test(raw)) return `${raw.padStart(4, '0')}.HK`;
  if (isCnCurrency(instrument) && /^\d{6}$/.test(raw)) {
    return /^(6|9|5|11)/.test(raw) ? `${raw}.SS` : `${raw}.SZ`;
  }
  return raw;
}

async function quoteTwelveData(instrument, event) {
  const apiKey = keyFrom('TWELVE_DATA_API_KEY', event);
  if (!apiKey) return undefined;
  const search = new URLSearchParams({ symbol: String(instrument.symbol), apikey: apiKey });
  const payload = await getJson(`https://api.twelvedata.com/quote?${search.toString()}`);
  if (payload.status === 'error' || payload.code) return staleQuote(instrument, 'twelve_data', payload);
  return quoteFrom(
    { ...instrument, currency: payload.currency || instrument.currency },
    'twelve_data',
    payload.close || payload.price || payload.previous_close,
    payload.datetime,
    payload
  );
}

async function quoteFmp(instrument, event) {
  const apiKey = keyFrom('FMP_API_KEY', event);
  if (!apiKey) return undefined;
  const symbol = encodeURIComponent(String(instrument.symbol));
  const payload = await getJson(`https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${encodeURIComponent(apiKey)}`);
  const item = Array.isArray(payload) ? payload[0] : undefined;
  if (!item) return staleQuote(instrument, 'fmp', payload);
  const asOf = item.timestamp ? new Date(Number(item.timestamp) * 1000).toISOString().slice(0, 10) : undefined;
  return quoteFrom(instrument, 'fmp', item.price, asOf, item);
}

async function quoteYahoo(instrument) {
  const symbol = yahooSymbol(instrument);
  if (!symbol) return undefined;
  const payload = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`);
  const result = payload?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta) return staleQuote(instrument, 'yahoo', payload);
  const timestamp = result.timestamp?.[result.timestamp.length - 1] || meta.regularMarketTime;
  const asOf = timestamp ? new Date(Number(timestamp) * 1000).toISOString().slice(0, 10) : undefined;
  return quoteFrom(
    { ...instrument, currency: meta.currency || instrument.currency },
    'yahoo',
    meta.regularMarketPrice || meta.previousClose,
    asOf,
    meta
  );
}

async function quoteEastmoneyStock(instrument) {
  const secid = eastmoneySecId(instrument);
  if (!secid) return undefined;
  const fields = 'f43,f57,f58,f60,f169,f170,f152';
  const payload = await getJson(`https://push2.eastmoney.com/api/qt/stock/get?secid=${encodeURIComponent(secid)}&fields=${fields}`);
  const data = payload?.data;
  if (!data) return staleQuote(instrument, 'eastmoney', payload);
  const scale = Number(data.f152 || 2);
  const divisor = Number.isFinite(scale) ? Math.pow(10, scale) : 100;
  const price = numberValue(data.f43) === undefined ? undefined : Number(data.f43) / divisor;
  const previousClose = numberValue(data.f60) === undefined ? undefined : Number(data.f60) / divisor;
  return quoteFrom(
    { ...instrument, symbol: data.f57 || instrument.symbol },
    'eastmoney',
    price || previousClose,
    new Date().toISOString().slice(0, 10),
    data
  );
}

async function quoteEastmoneyFund(instrument) {
  const symbol = String(instrument.symbol || '').trim();
  if (!/^\d{6}$/.test(symbol)) return undefined;
  const text = await getCachedText(`https://fundgz.1234567.com.cn/js/${symbol}.js?rt=${Date.now()}`);
  const match = text.match(/jsonpgz\((.*)\);?/);
  if (!match) return staleQuote(instrument, 'eastmoney_fund', text);
  const data = JSON.parse(match[1]);
  return quoteFrom(
    { ...instrument, currency: 'CNY' },
    'eastmoney_fund',
    data.gsz || data.dwjz,
    (data.gztime || data.jzrq || '').slice(0, 10),
    data
  );
}

async function quoteAlphaVantage(instrument, event) {
  const apiKey = keyFrom('ALPHA_VANTAGE_API_KEY', event);
  if (!apiKey) return undefined;
  const base = 'https://www.alphavantage.co/query';
  const global = new URLSearchParams({
    function: 'GLOBAL_QUOTE',
    symbol: String(instrument.symbol),
    apikey: apiKey
  });
  const payload = await getJson(`${base}?${global.toString()}`);
  const quote = payload?.['Global Quote'];
  if (quote?.['05. price']) {
    return quoteFrom(instrument, 'alpha_vantage', quote['05. price'], quote['07. latest trading day'], quote);
  }
  const daily = new URLSearchParams({
    function: 'TIME_SERIES_DAILY',
    symbol: String(instrument.symbol),
    outputsize: 'compact',
    apikey: apiKey
  });
  const dailyPayload = await getJson(`${base}?${daily.toString()}`);
  const series = dailyPayload?.['Time Series (Daily)'];
  if (!series) return staleQuote(instrument, 'alpha_vantage', dailyPayload);
  const latestDate = Object.keys(series).sort().reverse()[0];
  return quoteFrom(instrument, 'alpha_vantage', series[latestDate]?.['4. close'], latestDate, dailyPayload?.['Meta Data']);
}

function providerOrderFor(instrument) {
  if (isFundLike(instrument) && isCnCurrency(instrument)) return [quoteEastmoneyFund, quoteEastmoneyStock, quoteYahoo, quoteTwelveData, quoteFmp, quoteAlphaVantage];
  if (isCnCurrency(instrument)) return [quoteEastmoneyStock, quoteYahoo, quoteTwelveData, quoteFmp, quoteAlphaVantage];
  if (isHkCurrency(instrument)) return [quoteEastmoneyStock, quoteYahoo, quoteTwelveData, quoteFmp, quoteAlphaVantage];
  return [quoteTwelveData, quoteFmp, quoteYahoo, quoteAlphaVantage];
}

async function queryBestQuote(instrument, event) {
  const providers = providerOrderFor(instrument);
  const errors = [];
  for (const provider of providers) {
    try {
      const quote = await provider(instrument, event);
      if (!quote) continue;
      if (!quote.stale && Number(quote.price.amount) > 0) return { quote, errors: [] };
      errors.push({ provider: provider.name, message: 'stale quote', raw: quote.raw });
    } catch (error) {
      errors.push({ provider: provider.name, message: error.message });
    }
  }
  return { quote: staleQuote(instrument, 'fallback', errors), errors };
}

module.exports = {
  eastmoneySecId,
  quoteFrom,
  queryBestQuote,
  staleQuote,
  yahooSymbol
};
