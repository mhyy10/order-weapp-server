const fs = require('fs')
const path = require('path')
const DB_PATH = path.join(__dirname, 'db.json')

const DEFAULT_DB = {
  categories: [],
  dishes: [],
  users: [{ id: 1, nickname: '用户1', avatar: '', phone: '', createdAt: new Date().toISOString() }],
  orders: [],
  carts: {},
  favorites: [],
  queues: [],
  coupons: [
    { id: 1, name: '新客满50减10', type: 'reduction', value: 10, threshold: 50, startDate: '2026-01-01', endDate: '2026-12-31', total: 1000, claimed: 0, isActive: true },
    { id: 2, name: '满100减20', type: 'reduction', value: 20, threshold: 100, startDate: '2026-01-01', endDate: '2026-12-31', total: 500, claimed: 0, isActive: true },
    { id: 3, name: '全场8折券', type: 'discount', value: 0.8, threshold: 30, startDate: '2026-01-01', endDate: '2026-12-31', total: 200, claimed: 0, isActive: true }
  ],
  userCoupons: [],
  reviews: [],
  admins: [{ id: 1, username: 'admin', password: 'admin123', name: '店长' }]
}

class Database {
  constructor() {
    this.data = this._load()
    this._saveTimer = null
  }

  _load() {
    try {
      if (fs.existsSync(DB_PATH)) {
        return { ...DEFAULT_DB, ...JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')) }
      }
    } catch (e) { console.warn('[DB] Load failed:', e.message) }
    return { ...DEFAULT_DB }
  }

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer)
    this._saveTimer = setTimeout(() => this._save(), 500)
  }

  _save() {
    try { fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2), 'utf-8') }
    catch (e) { console.error('[DB] Save failed:', e.message) }
  }

  saveSync() {
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._save() }
  }

  get(key) { return this.data[key] }
  set(key, value) { this.data[key] = value; this._scheduleSave() }
  find(key, fn) { return (this.data[key] || []).find(fn) }
  filter(key, fn) { return (this.data[key] || []).filter(fn) }
  push(key, item) { if (!this.data[key]) this.data[key] = []; this.data[key].push(item); this._scheduleSave(); return item }
  splice(key, fn) { const arr = this.data[key]||[]; const i = arr.findIndex(fn); if(i>-1){arr.splice(i,1);this._scheduleSave();return true} return false }
  update(key, fn, transformer) { const item = (this.data[key]||[]).find(fn); if(item){transformer(item);this._scheduleSave();return item} return null }
  upsert(key, predicate, createFn, updateFn) {
    let item = (this.data[key] || []).find(predicate)
    if (!item) { item = createFn(); if(!this.data[key]) this.data[key]=[]; this.data[key].push(item) }
    else if (updateFn) { updateFn(item) }
    this._scheduleSave()
    return item
  }
}

const db = new Database()
process.on('exit', () => db.saveSync())
process.on('SIGINT', () => { db.saveSync(); process.exit(0) })
process.on('SIGTERM', () => { db.saveSync(); process.exit(0) })
module.exports = db
