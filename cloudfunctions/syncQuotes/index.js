const { queryBestQuote } = require('./providers');

exports.main = async (event) => {
  const symbols = Array.isArray(event.symbols) ? event.symbols : [];
  const results = await Promise.all(
    symbols.slice(0, 8).map(async (instrument) => ({
      instrument,
      result: await queryBestQuote(instrument, event)
    }))
  );
  const quotes = results.map((item) => item.result.quote);
  const errors = results
    .filter((item) => item.result.errors.length)
    .map((item) => ({ symbol: item.instrument.symbol, providers: item.result.errors }));

  return { quotes, errors };
};
