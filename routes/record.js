// ============================================
// Fitmate - 训练打卡路由模块
// 提供打卡、历史、连续天数、统计等 API 接口
// ============================================

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const authMiddleware = require('../middleware/auth');

// ============================================
// 数据库连接池配置（从环境变量读取）
// ============================================
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fitmate',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// ============================================
// 所有打卡接口都需要登录认证
// ============================================
router.use(authMiddleware);

// ============================================
// 工具函数：计算连续打卡天数
// 逻辑：从今天开始往前数，如果今天没打卡就看昨天，
//       昨天也没打卡则从最近一次打卡日往前数
// 参数：dateSet - 包含所有打卡日期字符串的 Set
// 返回：连续天数（number）
// ============================================
function calculateStreak(dateSet) {
    if (dateSet.size === 0) return 0;

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    let streak = 0;
    let cursor = new Date(todayStr);

    // 情况1：今天已打卡，streak 从今天开始计数
    if (dateSet.has(todayStr)) {
        streak = 1;
        cursor.setDate(cursor.getDate() - 1);
    }
    // 情况2：今天没打卡，但昨天打了，streak 从昨天开始
    else {
        cursor.setDate(cursor.getDate() - 1);
        const yesterdayStr = cursor.toISOString().split('T')[0];

        if (dateSet.has(yesterdayStr)) {
            streak = 1;
            cursor.setDate(cursor.getDate() - 1);
        }
        // 情况3：今天和昨天都没打卡，连续已断
        // 从 dateSet 中最近一次打卡日往前数（仅统计历史连续）
        else {
            // dateSet 按日期倒序排列，取第一个即最近打卡日
            const sortedDates = Array.from(dateSet).sort((a, b) => b.localeCompare(a));
            const latestDate = new Date(sortedDates[0]);
            streak = 1;
            latestDate.setDate(latestDate.getDate() - 1);

            while (true) {
                const dateStr = latestDate.toISOString().split('T')[0];
                if (dateSet.has(dateStr)) {
                    streak++;
                    latestDate.setDate(latestDate.getDate() - 1);
                } else {
                    break;
                }
            }

            return streak;
        }
    }

    // 继续往前数连续天数
    while (true) {
        const dateStr = cursor.toISOString().split('T')[0];
        if (dateSet.has(dateStr)) {
            streak++;
            cursor.setDate(cursor.getDate() - 1);
        } else {
            break;
        }
    }

    return streak;
}

// ============================================
// POST /api/record — 提交训练打卡
// ============================================
router.post('/', async (req, res) => {
    try {
        const userId = req.userId;
        const {
            training_date,
            training_content,
            training_duration,
            calories_burned,
            note
        } = req.body;

        // 1. 校验必填字段：训练内容不能为空
        if (!training_content || training_content.trim() === '') {
            return res.status(400).json({
                success: false,
                message: '训练内容不能为空'
            });
        }

        // 2. 训练日期默认为今天
        const recordDate = training_date || new Date().toISOString().split('T')[0];

        // 3. 检查该日期是否已打卡（手动查询，给出友好提示）
        const [existing] = await pool.query(
            'SELECT id FROM training_record WHERE user_id = ? AND training_date = ?',
            [userId, recordDate]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: '该日期已经打过卡了，无需重复打卡'
            });
        }

        // 4. 插入打卡记录
        const [result] = await pool.query(
            `INSERT INTO training_record (user_id, training_date, training_content, training_duration, calories_burned, note)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, recordDate, training_content.trim(), training_duration || null, calories_burned || null, note || null]
        );

        // 5. 查询刚插入的完整记录返回给前端
        const [records] = await pool.query(
            'SELECT * FROM training_record WHERE id = ?',
            [result.insertId]
        );

        return res.status(201).json({
            success: true,
            message: '打卡成功',
            data: records[0]
        });

    } catch (error) {
        // 捕获唯一索引冲突（并发场景下的兜底处理）
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: '该日期已经打过卡了，无需重复打卡'
            });
        }

        console.error('提交打卡失败:', error);
        return res.status(500).json({
            success: false,
            message: '服务器内部错误，请稍后再试'
        });
    }
});

// ============================================
// GET /api/record/history — 获取打卡历史（分页）
// ============================================
router.get('/history', async (req, res) => {
    try {
        const userId = req.userId;

        // 1. 解析分页参数，设置默认值
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 10));
        const offset = (page - 1) * pageSize;

        // 2. 查询总数
        const [countResult] = await pool.query(
            'SELECT COUNT(*) AS total FROM training_record WHERE user_id = ?',
            [userId]
        );
        const total = countResult[0].total;

        // 3. 查询分页数据，按日期倒序
        const [records] = await pool.query(
            'SELECT * FROM training_record WHERE user_id = ? ORDER BY training_date DESC, created_at DESC LIMIT ? OFFSET ?',
            [userId, pageSize, offset]
        );

        return res.json({
            success: true,
            data: records,
            total,
            page,
            pageSize
        });

    } catch (error) {
        console.error('获取打卡历史失败:', error);
        return res.status(500).json({
            success: false,
            message: '服务器内部错误，请稍后再试'
        });
    }
});

// ============================================
// GET /api/record/streak — 获取连续打卡天数
// ============================================
router.get('/streak', async (req, res) => {
    try {
        const userId = req.userId;

        // 1. 查询该用户所有打卡日期，按日期倒序
        const [rows] = await pool.query(
            'SELECT DISTINCT training_date FROM training_record WHERE user_id = ? ORDER BY training_date DESC',
            [userId]
        );

        const totalDays = rows.length;

        // 2. 如果没有打卡记录，直接返回 0
        if (totalDays === 0) {
            return res.json({
                success: true,
                current_streak: 0,
                total_days: 0
            });
        }

        // 3. 将打卡日期转为 Set，传给公共函数计算连续天数
        const dateSet = new Set(rows.map(r => {
            const d = r.training_date;
            return d instanceof Date ? d.toISOString().split('T')[0] : d;
        }));

        const streak = calculateStreak(dateSet);

        return res.json({
            success: true,
            current_streak: streak,
            total_days: totalDays
        });

    } catch (error) {
        console.error('获取连续打卡天数失败:', error);
        return res.status(500).json({
            success: false,
            message: '服务器内部错误，请稍后再试'
        });
    }
});

// ============================================
// GET /api/record/stats — 获取打卡统计信息
// 返回：本周次数、本月次数、总次数、连续天数
// ============================================
router.get('/stats', async (req, res) => {
    try {
        const userId = req.userId;

        // 1. 计算本周一和本周日的日期
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0=周日, 1=周一, ..., 6=周六

        // 本周一（如果今天是周日，本周一是往前推6天）
        const monday = new Date(today);
        monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        const mondayStr = monday.toISOString().split('T')[0];

        // 本周日
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        const sundayStr = sunday.toISOString().split('T')[0];

        // 2. 本月第一天
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const firstDayStr = firstDayOfMonth.toISOString().split('T')[0];

        // 3. 并行查询：本周次数、本月次数、总次数、所有打卡日期
        const [weeklyResult] = await pool.query(
            'SELECT COUNT(*) AS count FROM training_record WHERE user_id = ? AND training_date BETWEEN ? AND ?',
            [userId, mondayStr, sundayStr]
        );

        const [monthlyResult] = await pool.query(
            'SELECT COUNT(*) AS count FROM training_record WHERE user_id = ? AND training_date >= ?',
            [userId, firstDayStr]
        );

        const [totalResult] = await pool.query(
            'SELECT COUNT(*) AS count FROM training_record WHERE user_id = ?',
            [userId]
        );

        const [dateRows] = await pool.query(
            'SELECT DISTINCT training_date FROM training_record WHERE user_id = ? ORDER BY training_date DESC',
            [userId]
        );

        const weekly = weeklyResult[0].count;
        const monthly = monthlyResult[0].count;
        const total = totalResult[0].count;

        // 4. 计算连续打卡天数（复用公共函数）
        const dateSet = new Set(dateRows.map(r => {
            const d = r.training_date;
            return d instanceof Date ? d.toISOString().split('T')[0] : d;
        }));
        const streak = calculateStreak(dateSet);

        return res.json({
            success: true,
            data: {
                weekly,
                monthly,
                total,
                streak
            }
        });

    } catch (error) {
        console.error('获取打卡统计失败:', error);
        return res.status(500).json({
            success: false,
            message: '服务器内部错误，请稍后再试'
        });
    }
});

module.exports = router;