# 小灶点餐 — 后端

基于 Express 的点餐系统后端 API，使用 JSON 文件作为数据库。

## 启动

```bash
npm install
node server.js
```

服务启动后访问 http://localhost:3001/health

## API 接口

| 模块 | 接口 | 方法 | 说明 |
|------|------|------|------|
| 分类 | `/category/list` | GET | 分类列表 |
| 菜品 | `/dish/list` | GET | 按分类查菜品 |
| 菜品 | `/dish/detail` | GET | 菜品详情 |
| 菜品 | `/dish/search` | GET | 搜索菜品 |
| 菜品 | `/dish/recommended` | GET | 推荐菜品 |
| 购物车 | `/cart/list` | GET | 购物车列表 |
| 购物车 | `/cart/add` | POST | 加入购物车 |
| 购物车 | `/cart/update` | POST | 更新数量 |
| 购物车 | `/cart/clear` | POST | 清空购物车 |
| 订单 | `/order/create` | POST | 创建订单 |
| 订单 | `/order/list` | GET | 订单列表（分页） |
| 订单 | `/order/detail` | GET | 订单详情 |
| 订单 | `/order/cancel` | POST | 取消订单 |
| 订单 | `/order/confirm` | POST | 确认取餐 |
| 用户 | `/user/login` | POST | 微信登录 |
| 用户 | `/user/info` | GET | 用户信息 |
| 用户 | `/user/favorites` | GET | 收藏列表 |
| 用户 | `/user/favorite/toggle` | POST | 收藏/取消 |
| 排队 | `/queue/join` | POST | 取号排队 |
| 排队 | `/queue/status` | GET | 排队状态 |
| 排队 | `/queue/cancel` | POST | 取消排队 |

## 安全特性

- ✅ 价格后端计算（防止前端篡改）
- ✅ 用户信息脱敏（不返回 openid）
- ✅ 输入参数校验

## 测试

```bash
node test-integration.js
```

## 目录结构

```
├── server.js             # 入口
├── db.js                 # JSON 数据库
├── utils/response.js     # 统一响应
└── routes/
    ├── category.js       # 分类
    ├── dish.js           # 菜品
    ├── cart.js           # 购物车
    ├── order.js          # 订单
    ├── user.js           # 用户
    └── queue.js          # 排队
```
