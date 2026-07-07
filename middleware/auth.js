// ============================================
// Fitmate - JWT 认证中间件
// 从请求头 Authorization: Bearer <token> 中解析用户 ID
// ============================================

const jwt = require('jsonwebtoken');

// 从环境变量读取 JWT 密钥
const JWT_SECRET = process.env.JWT_SECRET || 'fitmate_jwt_secret_default';

/**
 * JWT 认证中间件
 * 验证 token 并将解析出的 user_id 挂载到 req.userId 上
 */
const authMiddleware = (req, res, next) => {
    try {
        // 1. 从请求头中获取 Authorization 字段
        const authHeader = req.headers.authorization;

        // 2. 检查是否存在且格式正确（Bearer token）
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: '未提供认证令牌，请先登录'
            });
        }

        // 3. 提取 token（去掉 "Bearer " 前缀）
        const token = authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: '认证令牌格式错误'
            });
        }

        // 4. 验证 token 并解码
        const decoded = jwt.verify(token, JWT_SECRET);

        // 5. 将解析出的 user_id 挂载到 request 对象上，供后续路由使用
        req.userId = decoded.userId || decoded.id;

        // 6. 验证通过，继续执行下一个中间件或路由处理函数
        next();
    } catch (error) {
        // Token 过期或无效
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: '登录已过期，请重新登录'
            });
        }

        return res.status(401).json({
            success: false,
            message: '认证令牌无效'
        });
    }
};

module.exports = authMiddleware;