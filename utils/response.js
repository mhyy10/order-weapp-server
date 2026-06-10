/**
 * 统一响应处理工具
 */

function success(res, data) {
  res.json({ code: 0, data })
}

function error(req, res, msg, status = 400) {
  console.warn(`[${req.baseUrl || ''}] ${req.method} ${req.path} -> ${msg}`)
  res.status(status).json({ code: -1, msg })
}

module.exports = { success, error }
