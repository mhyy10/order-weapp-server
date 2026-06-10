const express = require('express')
const router = express.Router()
const db = require('../db')
const { success, error } = require('../utils/response')

// 后端价格计算：根据菜品 ID 从数据库获取真实价格
function calculateOrderTotal(items) {
  const dishes = db.get('dishes') || []
  let subtotal = 0
  for (const item of items) {
    const dish = dishes.find(d => d.id == item.dishId)
    if (!dish) continue
    let price = dish.price
    // 规格加价
    if (item.spec && dish.specs) {
      for (const s of dish.specs) {
        const opt = s.options.find(o => o.name === item.spec)
        if (opt) { price = opt.price; break }
      }
    }
    // 加料加价
    if (item.addons && item.addons.length > 0 && dish.addons) {
      for (const a of item.addons) {
        const addon = dish.addons.find(ad => ad.name === a)
        if (addon) price += addon.price
      }
    }
    subtotal += price * (item.quantity || 1)
  }
  return subtotal
}

router.post('/create', (req, res) => {
  const { userId, tableNo, dineType, peopleCount, items, note } = req.body
  if (!userId || !items || items.length === 0) return error(req, res, '缺少必要参数')

  // 数值校验
  const qty = parseInt(peopleCount) || 1
  if (qty < 1 || qty > 50) return error(req, res, '人数不合法')

  // 后端重新计算价格，防止前端篡改
  const subtotal = calculateOrderTotal(items)
  const discount = subtotal >= 100 ? 5 : 0
  const serviceFee = dineType === 'dine_in' ? qty * 3 : 0
  const total = subtotal - discount + serviceFee

  const now = new Date()
  const orderId = 'ORD' + now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0') + String(Math.floor(Math.random()*1000)).padStart(3,'0')
  const order = {
    id: orderId,
    userId: parseInt(userId),
    tableNo: tableNo || '',
    dineType: dineType || 'dine_in',
    peopleCount: qty,
    items,
    subtotal,
    discount,
    total,
    note: note || '',
    status: 'pending',
    createdAt: now.toISOString()
  }
  db.push('orders', order)
  // Clear cart
  const carts = db.get('carts') || {}
  carts[userId] = []
  db.set('carts', carts)
  success(res, order)
})

router.get('/list', (req, res) => {
  const { userId, page = 1, pageSize = 20 } = req.query
  if (!userId) return error(req, res, '缺少 userId')
  const p = Math.max(1, parseInt(page))
  const ps = Math.min(50, Math.max(1, parseInt(pageSize)))
  const all = db.filter('orders', o => o.userId == userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  const total = all.length
  const orders = all.slice((p - 1) * ps, p * ps)
  success(res, { orders, total, page: p, pageSize: ps })
})

router.get('/detail', (req, res) => {
  const { id } = req.query
  if (!id) return error(req, res, '缺少 id')
  const order = db.find('orders', o => o.id == id)
  if (!order) return error(req, res, '订单不存在', 404)
  success(res, order)
})

router.post('/cancel', (req, res) => {
  const { id } = req.body
  if (!id) return error(req, res, '缺少 id')
  const order = db.update('orders', o => o.id == id, o => { o.status = 'cancelled' })
  if (!order) return error(req, res, '订单不存在', 404)
  success(res, order)
})

router.post('/confirm', (req, res) => {
  const { id } = req.body
  if (!id) return error(req, res, '缺少 id')
  const order = db.update('orders', o => o.id == id, o => { o.status = 'completed' })
  if (!order) return error(req, res, '订单不存在', 404)
  success(res, order)
})

module.exports = router
