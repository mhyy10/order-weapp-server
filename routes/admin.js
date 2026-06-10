const express = require('express')
const router = express.Router()
const db = require('../db')
const { success, error } = require('../utils/response')

// 商家登录
router.post('/login', (req, res) => {
  const { username, password } = req.body
  if (!username || !password) return error(req, res, '缺少参数')
  const admin = db.find('admins', a => a.username === username && a.password === password)
  if (!admin) return error(req, res, '用户名或密码错误')
  success(res, { id: admin.id, name: admin.name, token: 'admin_' + admin.id })
})

// 数据概览
router.get('/stats', (req, res) => {
  const today = new Date().toISOString().slice(0, 10)
  const orders = db.get('orders') || []
  const todayOrders = orders.filter(o => o.createdAt && o.createdAt.startsWith(today))
  const todayRevenue = todayOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + (o.total || 0), 0)
  const waitingQueues = db.filter('queues', q => q.status === 'waiting').length
  const totalDishes = (db.get('dishes') || []).length
  success(res, {
    todayOrders: todayOrders.length,
    todayRevenue,
    waitingQueues,
    totalDishes,
    totalOrders: orders.length,
    pendingOrders: orders.filter(o => o.status === 'pending').length
  })
})

// 菜品管理
router.get('/dishes', (req, res) => {
  const dishes = db.get('dishes') || []
  const categories = db.get('categories') || []
  const result = dishes.map(d => ({ ...d, categoryName: (categories.find(c => c.id === d.categoryId) || {}).name || '' }))
  success(res, result)
})

router.post('/dishes', (req, res) => {
  const dish = req.body
  if (!dish.name || !dish.categoryId) return error(req, res, '缺少必要参数')
  dish.id = Date.now()
  dish.sales = 0
  dish.rating = 0
  dish.isAvailable = true
  db.push('dishes', dish)
  success(res, dish)
})

router.put('/dishes', (req, res) => {
  const { id, ...updates } = req.body
  if (!id) return error(req, res, '缺少 id')
  const dish = db.update('dishes', d => d.id == id, d => Object.assign(d, updates))
  if (!dish) return error(req, res, '菜品不存在', 404)
  success(res, dish)
})

router.delete('/dishes', (req, res) => {
  const { id } = req.body
  if (!id) return error(req, res, '缺少 id')
  const removed = db.splice('dishes', d => d.id == id)
  success(res, { deleted: !!removed })
})

// 分类管理
router.get('/categories', (req, res) => {
  success(res, db.get('categories') || [])
})

router.post('/categories', (req, res) => {
  const cat = req.body
  if (!cat.name) return error(req, res, '缺少分类名')
  cat.id = Date.now()
  cat.isActive = true
  db.push('categories', cat)
  success(res, cat)
})

router.put('/categories', (req, res) => {
  const { id, ...updates } = req.body
  if (!id) return error(req, res, '缺少 id')
  const cat = db.update('categories', c => c.id == id, c => Object.assign(c, updates))
  if (!cat) return error(req, res, '分类不存在', 404)
  success(res, cat)
})

// 订单管理
router.get('/orders', (req, res) => {
  const { status, page = 1, pageSize = 20 } = req.query
  let orders = db.get('orders') || []
  if (status) orders = orders.filter(o => o.status === status)
  orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  const p = Math.max(1, parseInt(page))
  const ps = Math.min(50, Math.max(1, parseInt(pageSize)))
  const total = orders.length
  success(res, { orders: orders.slice((p - 1) * ps, p * ps), total, page: p, pageSize: ps })
})

router.put('/orders', (req, res) => {
  const { id, status } = req.body
  if (!id || !status) return error(req, res, '缺少参数')

  // 合法状态流转校验
  const validTransitions = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['ready', 'cancelled'],
    ready: ['completed', 'cancelled'],
    completed: [],
    cancelled: []
  }
  const order = db.find('orders', o => o.id == id)
  if (!order) return error(req, res, '订单不存在', 404)
  if (!validTransitions[order.status] || !validTransitions[order.status].includes(status)) {
    return error(req, res, `不允许从 ${order.status} 变更为 ${status}`)
  }

  db.update('orders', o => o.id == id, o => { o.status = status })

  // 双通道推送：Socket.IO（管理后台）+ 原生 WebSocket（小程序）
  if (req.io) {
    req.io.to(`user_${order.userId}`).emit('order:status', { orderId: id, status })
  }
  if (req.wsBroadcast) {
    req.wsBroadcast(order.userId, 'order:status', { orderId: id, status })
  }
  success(res, { ...order, status })
})

// 评价列表
router.get('/reviews', (req, res) => {
  const reviews = db.get('reviews') || []
  const users = db.get('users') || []
  const result = reviews.map(r => {
    const user = users.find(u => u.id === r.userId)
    return { ...r, nickname: user ? user.nickname : '匿名' }
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  success(res, result)
})

// 优惠券管理
router.get('/coupons', (req, res) => {
  success(res, db.get('coupons') || [])
})

router.post('/coupons', (req, res) => {
  const coupon = req.body
  if (!coupon.name || !coupon.type) return error(req, res, '缺少必要参数')
  coupon.id = Date.now()
  coupon.claimed = 0
  coupon.isActive = true
  db.push('coupons', coupon)
  // 双通道推送：新优惠券通知
  if (req.io) {
    req.io.emit('coupon:new', { id: coupon.id, name: coupon.name })
  }
  if (req.wsBroadcast) {
    // 通知所有已连接的小程序用户
    const wss = require('../server').wss
    if (wss) {
      const msg = JSON.stringify({ event: 'coupon:new', data: { id: coupon.id, name: coupon.name } })
      wss.clients.forEach(ws => {
        if (ws.readyState === 1) ws.send(msg)  // 1 = WebSocket.OPEN
      })
    }
  }
  success(res, coupon)
})

router.put('/coupons', (req, res) => {
  const { id, ...updates } = req.body
  if (!id) return error(req, res, '缺少 id')
  const coupon = db.update('coupons', c => c.id == id, c => Object.assign(c, updates))
  if (!coupon) return error(req, res, '优惠券不存在', 404)
  success(res, coupon)
})

module.exports = router
