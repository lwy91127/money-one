const { apiKeyFrom, normalizeFx, queryAlphaVantage } = require('./alphaVantage');

exports.main = async (event) => {
  const apiKey = apiKeyFrom(event);
  if (!apiKey) {
    return { fxRates: [], error: 'ALPHA_VANTAGE_API_KEY is not configured.' };
  }

  const pairs = Array.isArray(event.pairs) ? event.pairs : [];
  const fxRates = [];
  const errors = [];

  for (const pair of pairs.slice(0, 20)) {
    try {
      const payload = await queryAlphaVantage({
        function: 'CURRENCY_EXCHANGE_RATE',
        from_currency: pair.base,
        to_currency: pair.quote,
        apikey: apiKey
      });
      fxRates.push(normalizeFx(pair.base, pair.quote, payload));
    } catch (error) {
      errors.push({ pair, message: error.message });
    }
  }

  return { fxRates, errors };
};
