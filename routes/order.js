const express = require('express')
const router = express.Router()
const db = require('../db')
const { success, error } = require('../utils/response')
const { useCoupon } = require('./coupon')

// 统一推送：同时走 Socket.IO（管理后台）和原生 WebSocket（小程序）
function notify(req, userId, event, data) {
  // Socket.IO 推送（管理后台用）
  if (req.io) {
    if (userId) {
      req.io.to(`user_${userId}`).emit(event, data)
    } else {
      req.io.emit(event, data)
    }
  }
  // 原生 WebSocket 推送（小程序用）
  if (req.wsBroadcast && userId) {
    req.wsBroadcast(userId, event, data)
  }
}

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
  const { userId, tableNo, dineType, peopleCount, items, note, userCouponId } = req.body
  if (!userId || !items || items.length === 0) return error(req, res, '缺少必要参数')

  // 数值校验
  const qty = parseInt(peopleCount) || 1
  if (qty < 1 || qty > 50) return error(req, res, '人数不合法')

  // 后端重新计算价格，防止前端篡改
  const subtotal = calculateOrderTotal(items)
  let couponDiscount = 0
  let couponId = null

  // 优惠券计算
  if (userCouponId) {
    const uc = db.find('userCoupons', uc => uc.id == userCouponId && uc.userId == userId && uc.status === 'available')
    if (uc) {
      const coupon = db.find('coupons', c => c.id === uc.couponId)
      if (coupon && coupon.isActive) {
        if (coupon.type === 'reduction' && subtotal >= coupon.threshold) {
          couponDiscount = coupon.value
          couponId = coupon.id
        } else if (coupon.type === 'discount' && subtotal >= coupon.threshold) {
          couponDiscount = Math.round(subtotal * (1 - coupon.value))
          couponId = coupon.id
        }
      }
    }
  }

  const baseDiscount = subtotal >= 100 ? 5 : 0
  const serviceFee = dineType === 'dine_in' ? qty * 3 : 0
  const total = subtotal - baseDiscount - couponDiscount + serviceFee

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
    discount: baseDiscount,
    couponDiscount,
    couponId,
    total,
    note: note || '',
    status: 'pending',
    createdAt: now.toISOString()
  }
  db.push('orders', order)

  // 使用优惠券
  if (userCouponId && couponDiscount > 0) {
    useCoupon(userCouponId, orderId)
  }

  // Clear cart
  const carts = db.get('carts') || {}
  carts[userId] = []
  db.set('carts', carts)

  // WebSocket 推送：新订单通知
  notify(req, null, 'order:new', { orderId, userId: parseInt(userId), tableNo, total })

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

// 商家接单：pending → confirmed
router.post('/accept', (req, res) => {
  const { id } = req.body
  if (!id) return error(req, res, '缺少 id')
  const order = db.find('orders', o => o.id == id)
  if (!order) return error(req, res, '订单不存在', 404)
  if (order.status !== 'pending') return error(req, res, '当前状态不可接单')
  db.update('orders', o => o.id == id, o => { o.status = 'confirmed' })
  order.status = 'confirmed'
  notify(req, order.userId, 'order:status', { orderId: id, status: 'confirmed' })
  success(res, order)
})

// 商家出餐：confirmed → ready
router.post('/ready', (req, res) => {
  const { id } = req.body
  if (!id) return error(req, res, '缺少 id')
  const order = db.find('orders', o => o.id == id)
  if (!order) return error(req, res, '订单不存在', 404)
  if (order.status !== 'confirmed') return error(req, res, '当前状态不可出餐')
  db.update('orders', o => o.id == id, o => { o.status = 'ready' })
  order.status = 'ready'
  notify(req, order.userId, 'order:status', { orderId: id, status: 'ready' })
  success(res, order)
})

router.post('/cancel', (req, res) => {
  const { id } = req.body
  if (!id) return error(req, res, '缺少 id')
  const order = db.update('orders', o => o.id == id, o => { o.status = 'cancelled' })
  if (!order) return error(req, res, '订单不存在', 404)
  notify(req, order.userId, 'order:status', { orderId: id, status: 'cancelled' })
  success(res, order)
})

// 确认取餐：ready → completed
router.post('/complete', (req, res) => {
  const { id } = req.body
  if (!id) return error(req, res, '缺少 id')
  const order = db.find('orders', o => o.id == id)
  if (!order) return error(req, res, '订单不存在', 404)
  if (order.status !== 'ready') return error(req, res, '当前状态不可完成')
  db.update('orders', o => o.id == id, o => { o.status = 'completed' })
  order.status = 'completed'
  notify(req, order.userId, 'order:status', { orderId: id, status: 'completed' })
  success(res, order)
})

module.exports = router
