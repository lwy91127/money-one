const https = require('https');

const CACHE_TTL_MS = 1000 * 60 * 30;
const memoryCache = new Map();

const REQUEST_TIMEOUT_MS = 900;

function getText(url, headers = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = https
      .get(url, { headers: { 'User-Agent': 'Mozilla/5.0 money-manager-miniapp', ...headers } }, (response) => {
        let body = '';
        response.on('data', (chunk) => {
          body += chunk;
          if (body.length > 1024 * 1024) {
            request.destroy(new Error('Search response is too large.'));
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
      reject(new Error(`Search request timed out after ${timeoutMs}ms.`));
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
  return JSON.parse(await getCachedText(url, headers));
}

function keyFrom(name, event) {
  return process.env[name] || event?.apiKeys?.[name] || event?.[name] || '';
}

function normalizeKind(value) {
  const raw = String(value || '').toLowerCase();
  if (raw.includes('fund') || raw.includes('基金')) return 'fund';
  if (raw.includes('etf')) return 'etf';
  if (raw.includes('bond') || raw.includes('债')) return 'bond';
  return 'stock';
}

function uniqueItems(items) {
  const seen = new Set();
  return items
    .filter((item) => item.symbol && item.name)
    .filter((item) => {
      const key = `${item.symbol}:${item.currency}:${item.kind}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}

function matchesRequestedKind(item, kind) {
  if (!kind) return true;
  const rawKind = String(item.kind || '').toLowerCase();
  const source = String(item.source || '').toLowerCase();
  if (kind === 'fund') return rawKind.includes('fund') || source.includes('fund');
  return !rawKind.includes('fund') && !source.includes('fund');
}

async function searchTwelveData(keywords, event) {
  const apiKey = keyFrom('TWELVE_DATA_API_KEY', event);
  if (!apiKey) return [];
  const search = new URLSearchParams({ symbol: keywords, apikey: apiKey });
  const payload = await getJson(`https://api.twelvedata.com/symbol_search?${search.toString()}`);
  return (payload.data || []).map((item) => ({
    symbol: item.symbol,
    name: item.instrument_name || item.name || item.symbol,
    kind: normalizeKind(item.instrument_type || item.type),
    market: item.exchange || item.country || 'Global',
    currency: item.currency || 'USD',
    source: 'twelve_data'
  }));
}

async function searchFmp(keywords, event) {
  const apiKey = keyFrom('FMP_API_KEY', event);
  if (!apiKey) return [];
  const search = new URLSearchParams({ query: keywords, limit: '12', apikey: apiKey });
  const payload = await getJson(`https://financialmodelingprep.com/api/v3/search?${search.toString()}`);
  return (Array.isArray(payload) ? payload : []).map((item) => ({
    symbol: item.symbol,
    name: item.name || item.symbol,
    kind: normalizeKind(item.type),
    market: item.exchangeShortName || item.stockExchange || 'Global',
    currency: item.currency || 'USD',
    source: 'fmp'
  }));
}

async function searchYahoo(keywords) {
  const search = new URLSearchParams({ q: keywords, quotesCount: '12', newsCount: '0', listsCount: '0' });
  const payload = await getJson(`https://query2.finance.yahoo.com/v1/finance/search?${search.toString()}`);
  return (payload.quotes || [])
    .filter((item) => item.symbol && (item.shortname || item.longname))
    .map((item) => ({
      symbol: item.symbol,
      name: item.shortname || item.longname || item.symbol,
      kind: normalizeKind(item.quoteType),
      market: item.exchDisp || item.exchange || 'Global',
      currency: item.currency || inferCurrencyFromYahoo(item.symbol),
      source: 'yahoo'
    }));
}

function inferCurrencyFromYahoo(symbol) {
  const raw = String(symbol || '').toUpperCase();
  if (raw.endsWith('.HK')) return 'HKD';
  if (raw.endsWith('.SS') || raw.endsWith('.SZ')) return 'CNY';
  return 'USD';
}

async function searchEastmoney(keywords) {
  const token = 'D43BF722C8E33B6DDA2A3F26DD9EEC80';
  const search = new URLSearchParams({ input: keywords, type: '14', token, count: '12' });
  const payload = await getJson(`https://searchapi.eastmoney.com/api/suggest/get?${search.toString()}`);
  const data = payload?.QuotationCodeTable?.Data || payload?.data || [];
  return data.map((item) => {
    const typeText = item.SecurityTypeName || item.TypeName || item.MktName || '';
    const quoteId = String(item.QuoteID || item.QuoteId || '');
    const marketText = item.MktName || item.MarketType || item.MarketName || quoteId || 'CN';
    const kind = normalizeKind(typeText);
    const currency = typeText.includes('港') || marketText.includes('HK') ? 'HKD' : typeText.includes('美') || marketText.includes('US') ? 'USD' : 'CNY';
    return {
      symbol: item.Code || item.Symbol || item.SecurityCode,
      name: item.Name || item.SecurityName || item.ShortName,
      kind,
      market: marketText,
      currency,
      source: kind === 'fund' ? 'eastmoney_fund' : 'eastmoney'
    };
  });
}

async function searchFundByCode(keywords) {
  const code = String(keywords || '').trim();
  if (!/^\d{6}$/.test(code)) return [];
  const text = await getCachedText(`https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`);
  const match = text.match(/jsonpgz\((.*)\);?/);
  if (!match) return [];
  const data = JSON.parse(match[1]);
  if (!data?.fundcode || !data?.name) return [];
  return [
    {
      symbol: data.fundcode,
      name: data.name,
      kind: 'fund',
      market: 'CN Fund',
      currency: 'CNY',
      source: 'eastmoney_fund'
    }
  ];
}

async function searchAlphaVantage(keywords, event) {
  const apiKey = keyFrom('ALPHA_VANTAGE_API_KEY', event);
  if (!apiKey) return [];
  const search = new URLSearchParams({ function: 'SYMBOL_SEARCH', keywords, apikey: apiKey });
  const payload = await getJson(`https://www.alphavantage.co/query?${search.toString()}`);
  return (payload.bestMatches || []).map((item) => ({
    symbol: item['1. symbol'],
    name: item['2. name'],
    kind: normalizeKind(item['3. type']),
    market: item['4. region'],
    currency: item['8. currency'],
    source: 'alpha_vantage'
  }));
}

function providersFor(kind) {
  if (kind === 'fund') return [searchFundByCode, searchEastmoney, searchTwelveData, searchFmp, searchYahoo, searchAlphaVantage];
  if (kind === 'stock') return [searchEastmoney, searchYahoo, searchTwelveData, searchFmp, searchAlphaVantage];
  return [searchFundByCode, searchEastmoney, searchYahoo, searchTwelveData, searchFmp, searchAlphaVantage];
}

async function searchAllProviders(keywords, event) {
  const kind = String(event?.kind || '').toLowerCase();
  const errors = [];
  for (const provider of providersFor(kind)) {
    try {
      const items = uniqueItems((await provider(keywords, event)).filter((item) => matchesRequestedKind(item, kind)));
      if (items.length) {
        return { items, errors: [] };
      }
    } catch (error) {
      errors.push({ provider: provider.name, message: error.message });
    }
  }
  return { items: [], errors };
}

module.exports = {
  matchesRequestedKind,
  normalizeKind,
  searchAllProviders,
  uniqueItems
};
