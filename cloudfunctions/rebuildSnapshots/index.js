function amount(value) {
  return Number(value && value.amount ? value.amount : 0);
}

exports.main = async (event) => {
  const data = event.data || {};
  const homeCurrency = data.settings?.homeCurrency || 'CNY';
  const accounts = data.accounts || [];
  const transactions = data.transactions || [];
  const dates = [...new Set(transactions.map((tx) => tx.tradeDate))].sort();
  const snapshots = dates.map((date) => {
    const byAccount = accounts.map((account) => {
      const total = transactions
        .filter((tx) => tx.accountId === account.id && tx.tradeDate <= date && !tx.deletedAt)
        .reduce((sum, tx) => {
          const sign = ['withdraw', 'transfer_out', 'sell', 'liability_payment'].includes(tx.type) ? -1 : 1;
          return sum + sign * amount(tx.amount);
        }, 0);
      return { accountId: account.id, value: { amount: total.toFixed(4), currency: account.currency } };
    });
    const totalAssets = byAccount
      .filter((item) => accounts.find((account) => account.id === item.accountId)?.category !== 'liability')
      .reduce((sum, item) => sum + amount(item.value), 0);
    const totalLiabilities = byAccount
      .filter((item) => accounts.find((account) => account.id === item.accountId)?.category === 'liability')
      .reduce((sum, item) => sum + Math.abs(amount(item.value)), 0);
    return {
      id: `snapshot_${date}`,
      date,
      totalAssets: { amount: totalAssets.toFixed(4), currency: homeCurrency },
      totalLiabilities: { amount: totalLiabilities.toFixed(4), currency: homeCurrency },
      netWorth: { amount: (totalAssets - totalLiabilities).toFixed(4), currency: homeCurrency },
      byAccount,
      byAssetType: [],
      createdAt: new Date().toISOString()
    };
  });
  return { snapshots };
};
