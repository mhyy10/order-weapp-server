const express = require('express')
const router = express.Router()
const db = require('../db')
const { success, error } = require('../utils/response')

// 商家登录
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body
    if (!username || !password) return error(req, res, '缺少必填参数: username, password')
    const admin = db.find('admins', a => a.username === username && a.password === password)
    if (!admin) return error(req, res, '用户名或密码错误')
    success(res, { id: admin.id, name: admin.name, token: 'admin_' + admin.id })
  } catch (err) {
    console.error('[admin/login]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 数据概览
router.get('/stats', (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const orders = db.get('orders') || []
    const todayOrders = orders.filter(o => o.createdAt && o.createdAt.startsWith(today))
    const todayRevenue = todayOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + (o.total || 0), 0)
    const waitingQueues = db.filter('queues', q => q.status === 'waiting').length
    const totalDishes = (db.get('dishes') || []).length
    const totalUsers = (db.get('users') || []).length
    success(res, {
      todayOrders: todayOrders.length,
      todayRevenue,
      pendingOrders: orders.filter(o => o.status === 'pending').length,
      queueCount: waitingQueues,
      totalDishes,
      totalUsers,
      totalOrders: orders.length,
      waitingQueues
    })
  } catch (err) {
    console.error('[admin/stats]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 菜品管理
router.get('/dishes', (req, res) => {
  try {
    const { categoryId, keyword } = req.query
    const page = parseInt(req.query.page) || 1
    const pageSize = parseInt(req.query.pageSize) || 20
    const dishes = db.get('dishes') || []
    const categories = db.get('categories') || []
    let result = dishes.map(d => ({ ...d, categoryName: (categories.find(c => c.id === d.categoryId) || {}).name || '' }))
    if (categoryId) {
      result = result.filter(d => d.categoryId == categoryId)
    }
    if (keyword) {
      const kw = keyword.toLowerCase()
      result = result.filter(d => d.name.toLowerCase().includes(kw))
    }
    const total = result.length
    const start = (page - 1) * pageSize
    const list = result.slice(start, start + pageSize)
    success(res, { list, total, page, pageSize })
  } catch (err) {
    console.error('[admin/dishes GET]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

router.post('/dishes', (req, res) => {
  try {
    const dish = req.body
    if (!dish.name) return error(req, res, '缺少必填参数: name')
    if (!dish.price || dish.price <= 0) return error(req, res, '缺少必填参数: price(正数)')
    if (!dish.categoryId) return error(req, res, '缺少必填参数: categoryId')
    dish.id = Date.now()
    dish.sales = 0
    dish.rating = 0
    dish.isAvailable = true
    db.push('dishes', dish)
    success(res, dish)
  } catch (err) {
    console.error('[admin/dishes POST]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

router.put('/dishes', (req, res) => {
  try {
    const { id, ...updates } = req.body
    if (!id) return error(req, res, '缺少 id')
    if (updates.price !== undefined && updates.price <= 0) return error(req, res, 'price 必须为正数')
    const dish = db.update('dishes', d => d.id == id, d => Object.assign(d, updates))
    if (!dish) return error(req, res, '菜品不存在', 404)
    success(res, dish)
  } catch (err) {
    console.error('[admin/dishes PUT]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

router.delete('/dishes', (req, res) => {
  try {
    const { id } = req.body
    if (!id) return error(req, res, '缺少 id')
    const removed = db.splice('dishes', d => d.id == id)
    success(res, { deleted: !!removed })
  } catch (err) {
    console.error('[admin/dishes DELETE]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 分类管理
router.get('/categories', (req, res) => {
  try {
    success(res, db.get('categories') || [])
  } catch (err) {
    console.error('[admin/categories GET]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

router.post('/categories', (req, res) => {
  try {
    const cat = req.body
    if (!cat.name) return error(req, res, '缺少分类名')
    cat.id = Date.now()
    cat.isActive = true
    db.push('categories', cat)
    success(res, cat)
  } catch (err) {
    console.error('[admin/categories POST]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

router.put('/categories', (req, res) => {
  try {
    const { id, ...updates } = req.body
    if (!id) return error(req, res, '缺少 id')
    const cat = db.update('categories', c => c.id == id, c => Object.assign(c, updates))
    if (!cat) return error(req, res, '分类不存在', 404)
    success(res, cat)
  } catch (err) {
    console.error('[admin/categories PUT]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 订单管理
router.get('/orders', (req, res) => {
  try {
    const { status, dineType } = req.query
    const page = parseInt(req.query.page) || 1
    const pageSize = parseInt(req.query.pageSize) || 20
    let orders = db.get('orders') || []
    if (status) orders = orders.filter(o => o.status === status)
    if (dineType) orders = orders.filter(o => o.dineType === dineType)
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    const total = orders.length
    const start = (page - 1) * pageSize
    const list = orders.slice(start, start + pageSize)
    success(res, { list, total, page, pageSize })
  } catch (err) {
    console.error('[admin/orders GET]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

router.put('/orders', (req, res) => {
  try {
    const { id, status } = req.body
    if (!id) return error(req, res, '缺少必填参数: orderId')
    if (!status) return error(req, res, '缺少必填参数: status')

    // 合法状态流转校验
    const validTransitions = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['ready', 'cancelled'],
      ready: ['completed', 'delivering', 'cancelled'],
      delivering: ['completed', 'cancelled'],
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
  } catch (err) {
    console.error('[admin/orders PUT]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 评价列表
router.get('/reviews', (req, res) => {
  try {
    const { minRating } = req.query
    const page = parseInt(req.query.page) || 1
    const pageSize = parseInt(req.query.pageSize) || 20
    let reviews = db.get('reviews') || []
    if (minRating) {
      reviews = reviews.filter(r => r.rating >= parseInt(minRating))
    }
    const users = db.get('users') || []
    const result = reviews.map(r => {
      const user = users.find(u => u.id === r.userId)
      return { ...r, nickname: user ? user.nickname : '匿名' }
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    const total = result.length
    const start = (page - 1) * pageSize
    const list = result.slice(start, start + pageSize)
    success(res, { list, total, page, pageSize })
  } catch (err) {
    console.error('[admin/reviews GET]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 优惠券管理
router.get('/coupons', (req, res) => {
  try {
    const { status } = req.query
    const page = parseInt(req.query.page) || 1
    const pageSize = parseInt(req.query.pageSize) || 20
    const now = new Date().toISOString()
    let coupons = db.get('coupons') || []
    if (status === 'active') {
      coupons = coupons.filter(c => c.isActive && c.endDate >= now)
    } else if (status === 'expired') {
      coupons = coupons.filter(c => c.endDate < now || !c.isActive)
    }
    const total = coupons.length
    const start = (page - 1) * pageSize
    const list = coupons.slice(start, start + pageSize)
    success(res, { list, total, page, pageSize })
  } catch (err) {
    console.error('[admin/coupons GET]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

router.post('/coupons', (req, res) => {
  try {
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
  } catch (err) {
    console.error('[admin/coupons POST]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

router.put('/coupons', (req, res) => {
  try {
    const { id, ...updates } = req.body
    if (!id) return error(req, res, '缺少 id')
    const coupon = db.update('coupons', c => c.id == id, c => Object.assign(c, updates))
    if (!coupon) return error(req, res, '优惠券不存在', 404)
    success(res, coupon)
  } catch (err) {
    console.error('[admin/coupons PUT]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

module.exports = router
