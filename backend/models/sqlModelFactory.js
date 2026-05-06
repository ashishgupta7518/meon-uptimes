const { getDb } = require('../config/db');

const parseJsonField = (value) => {
  if (value === null || value === undefined || value === '') {
    return [];
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  return value;
};

const formatDateOnly = (value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return value;
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toCamelCase = (key) => key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
const toSnakeCase = (key) => key.replace(/([A-Z])/g, (match) => `_${match.toLowerCase()}`);

const normalizeObjectKeys = (object, converter) => {
  if (Array.isArray(object)) {
    return object.map((item) => normalizeObjectKeys(item, converter));
  }
  if (object && typeof object === 'object' && !(object instanceof Date)) {
    return Object.entries(object).reduce((acc, [key, value]) => {
      acc[converter(key)] = normalizeObjectKeys(value, converter);
      return acc;
    }, {});
  }
  return object;
};

const tryParseDateValue = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return new Date(value);
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed;
  }
  return value;
};

const normalizeRow = (row, config = {}) => {
  const snakeRow = { ...(row || {}) };
  const normalized = normalizeObjectKeys(snakeRow, toCamelCase);

  if (config.jsonFields) {
    config.jsonFields.forEach((field) => {
      const camelField = toCamelCase(field);
      if (camelField in normalized) {
        normalized[camelField] = parseJsonField(normalized[camelField]);
      }
    });
  }

  Object.entries(normalized).forEach(([key, value]) => {
    if (key === 'day') {
      normalized[key] = formatDateOnly(value);
      return;
    }

    if (key.endsWith('At')) {
      normalized[key] = tryParseDateValue(value);
    }
  });

  if ('downAlertSent' in normalized) {
    normalized.downAlertSent = Boolean(normalized.downAlertSent);
  }

  if ('enabled' in normalized) {
    normalized.enabled = Boolean(normalized.enabled);
  }

  if ('useTls' in normalized) {
    normalized.useTls = Boolean(normalized.useTls);
  }

  if ('secure' in normalized) {
    normalized.secure = Boolean(normalized.secure);
  }

  if (normalized.id != null) {
    normalized._id = normalized.id;
  }

  return normalized;
};

const compareValue = (actual, expected) => {
  if (typeof expected === 'boolean') {
    return Boolean(actual) === expected;
  }

  if (actual instanceof Date && typeof expected === 'string') {
    const formattedActual = formatDateOnly(actual);
    if (formattedActual === expected) {
      return true;
    }
  }

  if (expected instanceof RegExp) {
    return expected.test(String(actual ?? ''));
  }

  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if ('$or' in expected) {
      return expected.$or.some((subFilter) => compareRow(actual, subFilter));
    }

    if ('$gte' in expected || '$lte' in expected || '$gt' in expected || '$lt' in expected) {
      let actualValue;
      if (actual instanceof Date) {
        actualValue = actual.getTime();
      } else if (typeof actual === 'string') {
        const numericValue = Number(actual);
        actualValue = Number.isNaN(numericValue) ? Date.parse(actual) : numericValue;
      } else {
        actualValue = Number(actual);
      }

      if ('$gte' in expected && actualValue < Number(expected.$gte)) return false;
      if ('$lte' in expected && actualValue > Number(expected.$lte)) return false;
      if ('$gt' in expected && actualValue <= Number(expected.$gt)) return false;
      if ('$lt' in expected && actualValue >= Number(expected.$lt)) return false;
      return true;
    }

    if ('$in' in expected) {
      return Array.isArray(expected.$in) && expected.$in.includes(actual);
    }

    if ('$ne' in expected) {
      return actual !== expected.$ne;
    }

    if ('$regex' in expected) {
      const regex = expected.$regex instanceof RegExp ? expected.$regex : new RegExp(expected.$regex, expected.$options || 'i');
      return regex.test(String(actual ?? ''));
    }

    return Object.entries(expected).every(([subKey, subValue]) => compareValue(actual?.[subKey], subValue));
  }

  return String(actual ?? '') === String(expected ?? '');
};

const normalizeFilterKeys = (filter) => normalizeObjectKeys(filter, toCamelCase);
const normalizeWriteKeys = (object) => normalizeObjectKeys(object, toSnakeCase);

const stripDocumentMeta = (object = {}) =>
  Object.fromEntries(
    Object.entries(object).filter(([key, value]) => !['id', '_id', 'save', 'createdAt', 'updatedAt'].includes(key) && typeof value !== 'function')
  );

const compareRow = (row, filter) => {
  if (!filter || Object.keys(filter).length === 0) {
    return true;
  }

  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') {
      return Array.isArray(value) && value.some((subFilter) => compareRow(row, subFilter));
    }

    return compareValue(row[key], value);
  });
};

const sortRows = (rows, sortObj = {}) => {
  const sortKeys = Object.entries(sortObj);
  if (sortKeys.length === 0) {
    return rows;
  }

  return [...rows].sort((left, right) => {
    for (const [key, direction] of sortKeys) {
      const a = left[key];
      const b = right[key];
      if (a === b) continue;
      const order = String(direction).toLowerCase() === 'asc' ? 1 : -1;
      if (a === null || a === undefined) return 1 * order;
      if (b === null || b === undefined) return -1 * order;
      if (a > b) return 1 * order;
      if (a < b) return -1 * order;
    }
    return 0;
  });
};

const adaptValue = (value) => {
  if (value === undefined) {
    return null;
  }
  if (value === null) {
    return null;
  }
  if (value && typeof value.toISOString === 'function') {
    return value.toISOString().slice(0, 19).replace('T', ' ');
  }
  if (Array.isArray(value) || typeof value === 'object') {
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return value;
};

const buildQueryChain = (promise) => {
  class QueryChain {
    constructor(promise) {
      this.promise = promise;
    }

    sort(sortObj) {
      this.promise = this.promise.then((rows) => sortRows(rows, sortObj));
      return this;
    }

    limit(limitCount) {
      this.promise = this.promise.then((rows) => rows.slice(0, limitCount));
      return this;
    }

    select() {
      return this;
    }

    lean() {
      return this.promise;
    }

    then(resolve, reject) {
      return this.promise.then(resolve, reject);
    }

    catch(reject) {
      return this.promise.catch(reject);
    }
  }

  return new QueryChain(promise);
};

const attachSaveMethod = (row, tableName, config) => {
  if (!row || typeof row !== 'object' || row.id == null) {
    return row;
  }

  const record = { ...row };
  record.save = async function save() {
    const updateData = normalizeWriteKeys({ ...this });
    delete updateData.id;
    delete updateData._id;
    delete updateData.save;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    const columns = Object.keys(updateData);
    const placeholders = columns.map(() => '?? = ?').join(', ');
    const params = [];

    columns.forEach((key) => {
      params.push(key, adaptValue(updateData[key]));
    });
    params.push(this.id);

    const sql = `UPDATE \`${tableName}\` SET ${placeholders} WHERE id = ?`;
    await getDb().query(sql, params);
    const updated = await findById(tableName, config, this.id);
    return updated;
  };

  return record;
};

const findById = async (tableName, config, id) => {
  const [rows] = await getDb().query(`SELECT * FROM \`${tableName}\` WHERE id = ?`, [id]);
  const row = rows[0] ? normalizeRow(rows[0], config) : null;
  return attachSaveMethod(row, tableName, config);
};

const createModel = (tableName, config = {}) => {
  const getAllRows = async () => {
    const [rows] = await getDb().query(`SELECT * FROM \`${tableName}\``);
    return rows.map((row) => normalizeRow(row, config));
  };

  const find = (filter = {}) => {
    const normalizedFilter = normalizeFilterKeys(filter);
    const promise = getAllRows().then((rows) => rows.filter((row) => compareRow(row, normalizedFilter)).map((row) => attachSaveMethod(row, tableName, config)));
    return buildQueryChain(promise);
  };

  const findOne = async (filter = {}) => {
    const rows = await find(filter).limit(1).lean();
    return rows[0] || null;
  };

  const create = async (doc = {}) => {
    const data = normalizeWriteKeys(stripDocumentMeta({ ...doc }));
    const columns = Object.keys(data);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT INTO \`${tableName}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${placeholders})`;
    const values = columns.map((column) => adaptValue(data[column]));
    const [result] = await getDb().query(sql, values);
    return findById(tableName, config, result.insertId);
  };

  const updateRowById = async (id, doc = {}) => {
    const data = normalizeWriteKeys(stripDocumentMeta({ ...doc }));
    const columns = Object.keys(data);
    if (columns.length === 0) {
      return findById(tableName, config, id);
    }
    const assignments = columns.map(() => '?? = ?').join(', ');
    const params = [];
    columns.forEach((column) => {
      params.push(column, adaptValue(data[column]));
    });
    params.push(id);
    const sql = `UPDATE \`${tableName}\` SET ${assignments} WHERE id = ?`;
    await getDb().query(sql, params);
    return findById(tableName, config, id);
  };

  const insertOrUpdate = async (filter, update, opts = {}) => {
    const existing = await findOne(filter);
    if (existing) {
      const updated = applyUpdateToDocument(existing, update, false);
      return updateRowById(existing.id, updated);
    }

    if (opts.upsert) {
      const doc = applyUpdateToDocument(filter, update, true);
      const created = await create(doc);
      return created;
    }

    return null;
  };

  const deleteById = async (id) => {
    const [result] = await getDb().query(`DELETE FROM \`${tableName}\` WHERE id = ?`, [id]);
    return result.affectedRows > 0 ? { deletedCount: result.affectedRows } : { deletedCount: 0 };
  };

  const bulkWrite = async (operations = []) => {
    for (const operation of operations) {
      if (operation.updateOne) {
        const { filter, update, upsert = false } = operation.updateOne;
        await updateOne(filter, update, { upsert });
      }
    }
    return { ok: 1, nModified: operations.length };
  };

  const updateOne = async (filter = {}, update = {}, opts = {}) => {
    const existing = await findOne(filter);

    if (existing) {
      const updatedDoc = applyUpdateToDocument(existing, update, false);
      return updateRowById(existing.id, updatedDoc);
    }

    if (opts.upsert) {
      const insertDoc = applyUpdateToDocument(filter, update, true);
      const insertData = normalizeWriteKeys(stripDocumentMeta({ ...insertDoc }));
      const insertColumns = Object.keys(insertData);
      const insertPlaceholders = insertColumns.map(() => '?').join(', ');
      const insertValues = insertColumns.map((column) => adaptValue(insertData[column]));

      const updateParts = [];
      const updateParams = [];

      if (update.$set) {
        Object.entries(update.$set).forEach(([key, value]) => {
          const snakeKey = toSnakeCase(key);
          updateParts.push(`\`${snakeKey}\` = ?`);
          updateParams.push(adaptValue(value));
        });
      }

      if (update.$inc) {
        Object.entries(update.$inc).forEach(([key, value]) => {
          const snakeKey = toSnakeCase(key);
          updateParts.push(`\`${snakeKey}\` = \`${snakeKey}\` + ?`);
          updateParams.push(Number(value));
        });
      }

      if (updateParts.length === 0) {
        updateParts.push('`updated_at` = NOW()');
      }

      const updateClause = updateParts.join(', ');
      const sql = `INSERT INTO \`${tableName}\` (${insertColumns.map((column) => `\`${column}\``).join(', ')}) VALUES (${insertPlaceholders}) ON DUPLICATE KEY UPDATE ${updateClause}`;
      const params = [...insertValues, ...updateParams];

      const [result] = await getDb().query(sql, params);
      if (result.insertId) {
        return findById(tableName, config, result.insertId);
      }

      if (result.affectedRows > 0) {
        const matchedRow = await findOne(filter);
        if (matchedRow?.id != null) {
          return findById(tableName, config, matchedRow.id);
        }
      }

      return await findOne(filter);
    }

    return null;
  };

  const findOneAndUpdate = async (filter = {}, update = {}, opts = {}) => {
    const result = await updateOne(filter, update, opts);
    if (opts.new) {
      if (result && result.id) {
        return findById(tableName, config, result.id);
      }
      return null;
    }
    return result;
  };

  const applyUpdateToDocument = (baseDoc = {}, update = {}, isInsert = false) => {
    const updated = { ...baseDoc };

    if (update.$setOnInsert && isInsert) {
      Object.entries(update.$setOnInsert).forEach(([key, value]) => {
        updated[key] = value;
      });
    }

    if (update.$set) {
      Object.entries(update.$set).forEach(([key, value]) => {
        updated[key] = value;
      });
    }

    if (update.$inc) {
      Object.entries(update.$inc).forEach(([key, value]) => {
        const current = Number(updated[key] || 0);
        updated[key] = current + Number(value);
      });
    }

    if (!('$set' in update) && !('$inc' in update) && !('$setOnInsert' in update)) {
      Object.entries(update).forEach(([key, value]) => {
        updated[key] = value;
      });
    }

    return updated;
  };

  return {
    find,
    findOne,
    create,
    updateOne,
    findOneAndUpdate,
    findById,
    findByIdAndDelete: deleteById,
    bulkWrite,
  };
};

module.exports = createModel;
