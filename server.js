const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const http = require('http')
const { Server } = require('socket.io')
const WebSocket = require('ws')

const app = express()
const server = http.createServer(app)
const io = new Server(server, { cors: { origin: '*' } })

app.use(cors())
app.use(bodyParser.json())
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now()-start}ms`))
  next()
})

// 将 io 和 wss 广播函数注入到 req 中
// req.io — Socket.IO 实例（供管理后台使用）
// req.wsBroadcast — 原生 WebSocket 广播函数（供小程序使用）
app.use((req, res, next) => {
  req.io = io
  req.wsBroadcast = wsBroadcast
  next()
})

app.use('/category', require('./routes/category'))
app.use('/dish', require('./routes/dish'))
app.use('/cart', require('./routes/cart'))
app.use('/order', require('./routes/order'))
app.use('/user', require('./routes/user'))
app.use('/queue', require('./routes/queue'))
app.use('/coupon', require('./routes/coupon'))
app.use('/review', require('./routes/review'))
app.use('/address', require('./routes/address'))
app.use('/points', require('./routes/points'))
app.use('/delivery', require('./routes/delivery'))
app.use('/admin', require('./routes/admin'))
app.use(express.static('admin'))

// ============ Socket.IO（管理后台用） ============
io.on('connection', (socket) => {
  console.log(`[Socket.IO] 客户端连接: ${socket.id}`)
  socket.on('join', (userId) => {
    socket.join(`user_${userId}`)
    console.log(`[Socket.IO] 用户 ${userId} 加入房间`)
  })
  socket.on('disconnect', () => {
    console.log(`[Socket.IO] 客户端断开: ${socket.id}`)
  })
})

// ============ 原生 WebSocket（微信小程序用） ============
const wss = new WebSocket.Server({ server, path: '/ws' })
const wsClients = new Map() // userId -> Set<WebSocket>

wss.on('connection', (ws, req) => {
  console.log(`[WS] 小程序客户端连接: ${req.socket.remoteAddress}`)

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw)
      if (msg.event === 'join' && msg.data) {
        const userId = String(msg.data)
        ws._userId = userId
        if (!wsClients.has(userId)) wsClients.set(userId, new Set())
        wsClients.get(userId).add(ws)
        console.log(`[WS] 用户 ${userId} 加入`)
      }
    } catch (e) { /* 忽略非JSON消息 */ }
  })

  ws.on('close', () => {
    if (ws._userId && wsClients.has(ws._userId)) {
      wsClients.get(ws._userId).delete(ws)
      if (wsClients.get(ws._userId).size === 0) wsClients.delete(ws._userId)
    }
  })

  ws.on('error', (err) => console.warn('[WS] 错误:', err.message))
})

// 向指定用户推送原生 WebSocket 消息
function wsBroadcast(userId, event, data) {
  const clients = wsClients.get(String(userId))
  if (!clients) return
  const msg = JSON.stringify({ event, data })
  clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg)
  })
}

// 向所有原生 WebSocket 客户端广播
function wsBroadcastAll(event, data) {
  const msg = JSON.stringify({ event, data })
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg)
  })
}

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime().toFixed(0)+'s' }))

// ============ 订单超时自动取消 ============
const ORDER_TIMEOUT_MS = 30 * 60 * 1000 // 30 分钟未接单自动取消

function autoCancelExpiredOrders() {
  try {
    const db = require('./db')
    const { earnPoints } = require('./routes/points')
    const now = Date.now()
    const orders = db.get('orders') || []

    let cancelled = 0
    orders.forEach(order => {
      if (order.status !== 'pending') return
      const created = new Date(order.createdAt).getTime()
      if (now - created > ORDER_TIMEOUT_MS) {
        // 超时自动取消
        order.status = 'cancelled'
        order.cancelledAt = new Date().toISOString()
        order.cancelReason = '超时未接单，系统自动取消'

        // 退还优惠券
        if (order.couponId && order.couponDiscount > 0) {
          const userCoupon = db.find('userCoupons', uc =>
            uc.usedOrderId === order.id && uc.status === 'used'
          )
          if (userCoupon) {
            userCoupon.status = 'available'
            userCoupon.usedOrderId = null
            userCoupon.usedAt = null
          }
        }

        // 退还积分
        if (order.pointsUsed > 0) {
          earnPoints(order.userId, order.pointsUsed, 'order_cancel', order.id, '订单超时取消退还积分')
        }

        // 推送通知
        wsBroadcast(order.userId, 'order:status', {
          orderId: order.id,
          status: 'cancelled',
          reason: '超时未接单，系统自动取消'
        })
        io.to(`user_${order.userId}`).emit('order:status', {
          orderId: order.id,
          status: 'cancelled',
          reason: '超时未接单，系统自动取消'
        })

        cancelled++
      }
    })

    if (cancelled > 0) {
      db._scheduleSave()
      console.log(`[AutoCancel] 自动取消了 ${cancelled} 个超时订单`)
    }
  } catch (err) {
    console.error('[AutoCancel] 错误:', err)
  }
}

// 每 5 分钟扫描一次
setInterval(autoCancelExpiredOrders, 5 * 60 * 1000)
// 启动时也执行一次
setTimeout(autoCancelExpiredOrders, 10 * 1000)
app.use((req, res) => res.status(404).json({ code: -1, msg: `Route not found: ${req.method} ${req.path}` }))
app.use((err, req, res, next) => { console.error('[server]', err); res.status(500).json({ code: -1, msg: 'Internal server error' }) })

server.listen(3001, () => { console.log('点餐后端服务已启动: http://localhost:3001 (Socket.IO + 原生WS 已启用)') })

module.exports = { app, io, wss, wsBroadcast, wsBroadcastAll }
