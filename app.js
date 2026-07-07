// ============================================
// Fitmate - AI 健身教练系统 主入口文件
// ============================================

const express = require('express');
const app = express();

// 加载环境变量（.env 文件中的配置）
require('dotenv').config();

// ============================================
// 中间件配置
// ============================================

// 解析 JSON 请求体
app.use(express.json());
// 解析 URL 编码的请求体
app.use(express.urlencoded({ extended: false }));

// ============================================
// 路由挂载
// ============================================

// 训练打卡模块路由
const recordRouter = require('./routes/record');
app.use('/api/record', recordRouter);

// TODO: 后续可在此继续挂载其他模块路由
// const userRouter = require('./routes/user');
// app.use('/api/user', userRouter);

// ============================================
// 404 处理 — 未匹配到任何路由
// ============================================
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: '接口不存在'
    });
});

// ============================================
// 全局错误处理
// ============================================
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({
        success: false,
        message: '服务器内部错误'
    });
});

// ============================================
// 启动服务
// ============================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Fitmate 服务已启动，端口: ${PORT}`);
    console.log(`打卡接口: http://localhost:${PORT}/api/record`);
});

module.exports = app;