const express = require('express')
const router = express.Router()
const db = require('../db')
const { success, error } = require('../utils/response')

router.post('/join', (req, res) => {
  try {
    const { userId, peopleCount, phone } = req.body
    if (!userId) return error(req, res, '缺少必填参数: userId')
    if (!peopleCount) return error(req, res, '缺少必填参数: people')
    const people = parseInt(peopleCount)
    if (!Number.isInteger(people) || people < 1) return error(req, res, '缺少必填参数: people(正整数)')
    const existing = db.find('queues', q => q.userId == userId && q.status === 'waiting')
    if (existing) return error(req, res, '已在排队中')
    const queues = db.filter('queues', q => q.status === 'waiting')
    const queueNo = 'A' + String(queues.length + 1).padStart(3, '0')
    const item = {
      id: Date.now(),
      userId: parseInt(userId),
      queueNo,
      peopleCount: people,
      phone: phone || '',
      status: 'waiting',
      position: queues.length + 1,
      waitEstimate: (queues.length + 1) * 5,
      createdAt: new Date().toISOString()
    }
    db.push('queues', item)
    // WebSocket 推送：新排队通知
    if (req.io) {
      req.io.emit('queue:new', { queueNo, position: item.position, userId: parseInt(userId) })
    }
    success(res, item)
  } catch (err) {
    console.error('[queue/join]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

router.get('/status', (req, res) => {
  try {
    const { userId } = req.query
    if (!userId) return error(req, res, '缺少 userId')
    const item = db.find('queues', q => q.userId == userId && q.status === 'waiting')
    if (!item) return success(res, null)
    const queues = db.filter('queues', q => q.status === 'waiting').sort((a, b) => a.id - b.id)
    const pos = queues.findIndex(q => q.userId == userId) + 1
    item.position = pos
    item.waitEstimate = pos * 5
    success(res, item)
  } catch (err) {
    console.error('[queue/status]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

router.post('/cancel', (req, res) => {
  try {
    const { userId } = req.body
    if (!userId) return error(req, res, '缺少 userId')
    db.update('queues', q => q.userId == userId && q.status === 'waiting', q => { q.status = 'cancelled' })
    success(res, { cancelled: true })
  } catch (err) {
    console.error('[queue/cancel]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 排队列表（管理后台用）
router.get('/list', (req, res) => {
  try {
    const { status } = req.query
    const page = parseInt(req.query.page) || 1
    const pageSize = parseInt(req.query.pageSize) || 20
    let queues = db.filter('queues', q => true)
    if (status) {
      queues = queues.filter(q => q.status === status)
    }
    queues.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    const total = queues.length
    const start = (page - 1) * pageSize
    const list = queues.slice(start, start + pageSize)
    success(res, { list, total, page, pageSize })
  } catch (err) {
    console.error('[queue/list]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

module.exports = router
