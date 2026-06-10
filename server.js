const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const app = express()

app.use(cors())
app.use(bodyParser.json())
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now()-start}ms`))
  next()
})

app.use('/category', require('./routes/category'))
app.use('/dish', require('./routes/dish'))
app.use('/cart', require('./routes/cart'))
app.use('/order', require('./routes/order'))
app.use('/user', require('./routes/user'))
app.use('/queue', require('./routes/queue'))

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime().toFixed(0)+'s' }))
app.use((req, res) => res.status(404).json({ code: -1, msg: `Route not found: ${req.method} ${req.path}` }))
app.use((err, req, res, next) => { console.error('[server]', err); res.status(500).json({ code: -1, msg: 'Internal server error' }) })

app.listen(3001, () => { console.log('点餐后端服务已启动: http://localhost:3001') })
