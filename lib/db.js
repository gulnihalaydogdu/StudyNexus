let _db = null;

export function setDatabase(database) {
    _db = database;
}

export function getDatabase() {
    if (!_db) throw new Error('Veritabanı henüz başlatılmadı.');
    return _db;
}

export function dbRun(sql, params = []) {
    const info = _db.prepare(sql).run(...params);
    return { lastID: Number(info.lastInsertRowid), changes: info.changes };
}

export function dbGet(sql, params = []) {
    return _db.prepare(sql).get(...params);
}

export function dbAll(sql, params = []) {
    return _db.prepare(sql).all(...params);
}
