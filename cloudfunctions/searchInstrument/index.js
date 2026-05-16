const { searchAllProviders } = require('./providers');

exports.main = async (event) => {
  const keywords = String(event.keywords || '').trim();
  if (!keywords) return { items: [] };

  const { items, errors } = await searchAllProviders(keywords, event);
  return {
    items,
    errors,
    rawMessage: errors.length ? '部分行情源不可用，已返回可用结果。' : ''
  };
};
