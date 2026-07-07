-- ============================================
-- Fitmate 训练打卡模块 - 数据库初始化脚本
-- ============================================

-- 创建 training_record 表（训练打卡记录表）
CREATE TABLE IF NOT EXISTS `training_record` (
    -- 主键，自增 ID
    `id` INT NOT NULL AUTO_INCREMENT,
    -- 用户 ID，外键关联 user 表
    `user_id` INT NOT NULL,
    -- 打卡日期
    `training_date` DATE NOT NULL,
    -- 训练内容描述
    `training_content` VARCHAR(500) NOT NULL,
    -- 训练时长（分钟）
    `training_duration` INT DEFAULT NULL,
    -- 消耗卡路里（可选）
    `calories_burned` INT DEFAULT NULL,
    -- 备注（可选）
    `note` VARCHAR(500) DEFAULT NULL,
    -- 记录创建时间
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- 主键
    PRIMARY KEY (`id`),
    -- 唯一索引：同一用户同一天不能重复打卡
    UNIQUE INDEX `idx_user_date` (`user_id`, `training_date`),
    -- 外键约束：关联 user 表
    CONSTRAINT `fk_training_record_user` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='训练打卡记录表';