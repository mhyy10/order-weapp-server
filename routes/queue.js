const express = require('express')
const router = express.Router()
const db = require('../db')
const { success, error } = require('../utils/response')

router.post('/join', (req, res) => {
  const { userId, peopleCount, phone } = req.body
  if (!userId) return error(req, res, '缺少 userId')
  const existing = db.find('queues', q => q.userId == userId && q.status === 'waiting')
  if (existing) return error(req, res, '已在排队中')
  const queues = db.filter('queues', q => q.status === 'waiting')
  const queueNo = 'A' + String(queues.length + 1).padStart(3, '0')
  const item = {
    id: Date.now(),
    userId: parseInt(userId),
    queueNo,
    peopleCount: peopleCount || 1,
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
})

router.get('/status', (req, res) => {
  const { userId } = req.query
  if (!userId) return error(req, res, '缺少 userId')
  const item = db.find('queues', q => q.userId == userId && q.status === 'waiting')
  if (!item) return success(res, null)
  const queues = db.filter('queues', q => q.status === 'waiting').sort((a, b) => a.id - b.id)
  const pos = queues.findIndex(q => q.userId == userId) + 1
  item.position = pos
  item.waitEstimate = pos * 5
  success(res, item)
})

router.post('/cancel', (req, res) => {
  const { userId } = req.body
  if (!userId) return error(req, res, '缺少 userId')
  db.update('queues', q => q.userId == userId && q.status === 'waiting', q => { q.status = 'cancelled' })
  success(res, { cancelled: true })
})

module.exports = router
