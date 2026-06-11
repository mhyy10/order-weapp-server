const express = require('express')
const router = express.Router()
const db = require('../db')
const { success, error } = require('../utils/response')

router.post('/login', (req, res) => {
  try {
    const { code } = req.body
    if (!code) return error(req, res, '缺少 code')
    // 实际生产环境应调用微信 code2session 接口换取 openid
    // 这里用 code 作为模拟 openid
    const openid = 'mock_' + code
    let user = db.find('users', u => u.openid == openid)
    if (!user) {
      user = { id: Date.now(), openid, nickname: '用户' + Date.now()%10000, avatar: '', phone: '', createdAt: new Date().toISOString() }
      db.push('users', user)
    }
    success(res, { userId: user.id, token: 'token_' + user.id })
  } catch (err) {
    console.error('[user/login]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

router.get('/info', (req, res) => {
  try {
    const { userId } = req.query
    if (!userId) return error(req, res, '缺少 userId')
    const user = db.find('users', u => u.id == userId)
    if (!user) return error(req, res, '用户不存在', 404)
    // 不返回敏感信息
    const { openid, ...safeUser } = user
    success(res, safeUser)
  } catch (err) {
    console.error('[user/info]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

router.get('/favorites', (req, res) => {
  try {
    const { userId } = req.query
    if (!userId) return error(req, res, '缺少 userId')
    const favs = db.filter('favorites', f => f.userId == userId)
    const dishes = db.get('dishes') || []
    // 优化：用 Map 建索引，避免 N+1 查询
    const dishMap = new Map(dishes.map(d => [d.id, d]))
    const result = favs.map(f => {
      const dish = dishMap.get(f.dishId)
      return dish ? { ...dish, favTime: f.createdAt } : null
    }).filter(Boolean)
    success(res, result)
  } catch (err) {
    console.error('[user/favorites]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

router.post('/favorite/toggle', (req, res) => {
  try {
    const { userId, dishId } = req.body
    if (!userId || !dishId) return error(req, res, '缺少参数')
    const existing = db.find('favorites', f => f.userId == userId && f.dishId == dishId)
    if (existing) {
      db.splice('favorites', f => f.userId == userId && f.dishId == dishId)
      success(res, { favorited: false })
    } else {
      db.push('favorites', { userId: parseInt(userId), dishId: parseInt(dishId), createdAt: new Date().toISOString() })
      success(res, { favorited: true })
    }
  } catch (err) {
    console.error('[user/favorite/toggle]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

module.exports = router
