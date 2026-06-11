const express = require('express')
const router = express.Router()
const db = require('../db')
const { success, error } = require('../utils/response')

// 提交评价
router.post('/create', (req, res) => {
  try {
    const { orderId, userId, rating, content, tags } = req.body
    if (!userId) return error(req, res, '缺少必填参数: userId')
    if (!orderId) return error(req, res, '缺少必填参数: orderId')
    if (!rating) return error(req, res, '缺少必填参数: rating')
    const r = parseInt(rating)
    if (!Number.isInteger(r) || r < 1 || r > 5) return error(req, res, '缺少必填参数: rating(1-5)')
    if (!content) return error(req, res, '缺少必填参数: content')

    // 检查订单是否存在且已完成
    const order = db.find('orders', o => o.id === orderId && o.userId == userId)
    if (!order) return error(req, res, '订单不存在')
    if (order.status !== 'completed') return error(req, res, '只能评价已完成的订单')

    // 检查是否已评价
    const existing = db.find('reviews', rv => rv.orderId === orderId)
    if (existing) return error(req, res, '该订单已评价')

    const review = {
      id: Date.now(),
      orderId,
      userId: parseInt(userId),
      rating: r,
      content: content || '',
      tags: tags || [],
      createdAt: new Date().toISOString()
    }
    db.push('reviews', review)
    success(res, review)
  } catch (err) {
    console.error('[review/create]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 评价列表
router.get('/list', (req, res) => {
  try {
    const { dishId, minRating, page = 1, pageSize = 20 } = req.query
    let reviews = db.filter('reviews', r => true)

    // 按菜品筛选（通过订单中的菜品匹配）
    if (dishId) {
      const orders = db.get('orders') || []
      const orderIds = orders
        .filter(o => o.items && o.items.some(i => i.dishId == dishId))
        .map(o => o.id)
      reviews = reviews.filter(r => orderIds.includes(r.orderId))
    }

    // 按最低评分筛选
    if (minRating) {
      reviews = reviews.filter(r => r.rating >= parseInt(minRating))
    }

    // 按时间倒序
    reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    // 分页
    const p = Math.max(1, parseInt(page))
    const ps = Math.min(50, Math.max(1, parseInt(pageSize)))
    const total = reviews.length
    const list = reviews.slice((p - 1) * ps, p * ps)

    // 附加用户信息
    const users = db.get('users') || []
    const result = list.map(r => {
      const user = users.find(u => u.id === r.userId)
      return {
        ...r,
        nickname: user ? user.nickname : '匿名用户',
        avatar: user ? user.avatar : ''
      }
    })

    success(res, { reviews: result, total, page: p, pageSize: ps })
  } catch (err) {
    console.error('[review/list]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 查询某订单的评价
router.get('/by-order', (req, res) => {
  try {
    const { orderId } = req.query
    if (!orderId) return error(req, res, '缺少 orderId')
    const review = db.find('reviews', r => r.orderId === orderId)
    success(res, review || null)
  } catch (err) {
    console.error('[review/by-order]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

module.exports = router
