const express = require('express')
const router = express.Router()
const db = require('../db')
const { success, error } = require('../utils/response')

/**
 * POST /track/event — 通用事件埋点
 * body: { event: string, userId?: string, data?: object }
 * 事件类型：group_buy_click / voice_order_click / feature_vote / group_buy_contact / ...
 */
router.post('/event', (req, res) => {
  try {
    const { event, userId, data } = req.body
    if (!event) return error(req, res, '缺少 event 参数')

    const record = {
      id: 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      event,
      userId: userId || null,
      data: data || {},
      createdAt: new Date().toISOString()
    }
    db.push('trackEvents', record)
    success(res, { id: record.id })
  } catch (err) {
    console.error('[track/event]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

/**
 * GET /track/stats — 埋点统计（供管理后台查看）
 * query: { event?: string }
 */
router.get('/stats', (req, res) => {
  try {
    const { event } = req.query
    let events = db.get('trackEvents') || []
    if (event) {
      events = events.filter(e => e.event === event)
    }

    // 按事件类型聚合
    const stats = {}
    events.forEach(e => {
      if (!stats[e.event]) {
        stats[e.event] = { count: 0, uniqueUsers: new Set(), latest: e.createdAt }
      }
      stats[e.event].count++
      if (e.userId) stats[e.event].uniqueUsers.add(e.userId)
      if (e.createdAt > stats[e.event].latest) stats[e.event].latest = e.createdAt
    })

    // Set → count
    const result = {}
    for (const [key, val] of Object.entries(stats)) {
      result[key] = { count: val.count, uniqueUsers: val.uniqueUsers.size, latest: val.latest }
    }

    success(res, result)
  } catch (err) {
    console.error('[track/stats]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

module.exports = router
