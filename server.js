require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const recordRouter = require('./routes/record');

const app = express();
const PORT = process.env.PORT || 3000;

// 允许前端页面跨域调用后端接口。
app.use(cors());

// 解析 JSON 请求体，供 POST /api/record 使用。
app.use(express.json());

// 方便课程演示时通过 http://localhost:3000/training-record.html 打开前端页面。
app.use(express.static(path.join(__dirname)));

// 挂载训练打卡相关接口。
app.use('/api/record', recordRouter);

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Fitmate backend is running'
    });
});

app.listen(PORT, () => {
    console.log(`Fitmate backend is running on http://localhost:${PORT}`);
});
