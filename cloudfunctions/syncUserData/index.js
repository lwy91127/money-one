const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const COLLECTION = 'user_portfolios';

function newest(localValue, remoteValue) {
  if (!remoteValue) return localValue;
  if (!localValue) return remoteValue;
  return String(localValue.updatedAt || '') >= String(remoteValue.updatedAt || '') ? localValue : remoteValue;
}

function mergeById(localItems = [], remoteItems = []) {
  const ids = new Set([...localItems.map((item) => item.id), ...remoteItems.map((item) => item.id)]);
  const conflicts = [];
  const merged = [];
  ids.forEach((id) => {
    const localValue = localItems.find((item) => item.id === id);
    const remoteValue = remoteItems.find((item) => item.id === id);
    if (localValue && remoteValue && localValue.updatedAt !== remoteValue.updatedAt && JSON.stringify(localValue) !== JSON.stringify(remoteValue)) {
      conflicts.push({ id, local: localValue, remote: remoteValue });
    }
    merged.push(newest(localValue, remoteValue));
  });
  return { merged, conflicts };
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const db = cloud.database();
  const localData = event.data || {};
  const existing = await db.collection(COLLECTION).where({ _openid: openid }).limit(1).get();
  const remoteDoc = existing.data[0];
  const remoteData = remoteDoc?.data || {};

  const collections = ['accountGroups', 'accounts', 'assetTypes', 'instruments', 'transactions', 'quotes', 'fxRates', 'snapshots'];
  const mergedData = { ...remoteData, ...localData };
  const conflicts = [];

  collections.forEach((name) => {
    const result = mergeById(localData[name] || [], remoteData[name] || []);
    mergedData[name] = result.merged;
    conflicts.push(...result.conflicts.map((conflict) => ({ collection: name, ...conflict })));
  });

  mergedData.settings = { ...(remoteData.settings || {}), ...(localData.settings || {}) };
  mergedData.syncMeta = {
    enabled: true,
    status: conflicts.length ? 'conflict' : 'synced',
    lastSyncedAt: new Date().toISOString(),
    pendingOperationCount: 0
  };

  if (remoteDoc) {
    await db.collection(COLLECTION).doc(remoteDoc._id).update({ data: { data: mergedData, updatedAt: new Date() } });
  } else {
    await db.collection(COLLECTION).add({ data: { data: mergedData, createdAt: new Date(), updatedAt: new Date() } });
  }

  return { data: mergedData, conflicts };
};
