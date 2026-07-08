(function () {
    const API_BASE = getApiBase();
    const HISTORY_PAGE_SIZE = 10;
    const LOGIN_PAGE = 'login.html';

    let isRedirectingToLogin = false;

    const form = document.getElementById('recordForm');
    const submitBtn = document.getElementById('submitBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const pageAlert = document.getElementById('pageAlert');
    const historyLoading = document.getElementById('historyLoading');
    const historyList = document.getElementById('historyList');
    const emptyState = document.getElementById('emptyState');
    const emptyTitle = document.getElementById('emptyTitle');
    const emptyText = document.getElementById('emptyText');
    const historySummary = document.getElementById('historySummary');
    const trainingDate = document.getElementById('trainingDate');
    const trainingContent = document.getElementById('trainingContent');
    const trainingDuration = document.getElementById('trainingDuration');
    const caloriesBurned = document.getElementById('caloriesBurned');
    const trainingNote = document.getElementById('trainingNote');

    const statEls = {
        streak: document.getElementById('streakDays'),
        weekly: document.getElementById('weeklyCount'),
        monthly: document.getElementById('monthlyCount'),
        total: document.getElementById('totalCount')
    };

    document.addEventListener('DOMContentLoaded', initPage);

    function initPage() {
        if (!form) {
            return;
        }

        trainingDate.value = getToday();
        trainingDate.max = getToday();
        form.addEventListener('submit', handleSubmit);
        refreshBtn.addEventListener('click', () => {
            hideAlert();
            refreshPageData();
        });

        // 页面加载时先检查 token，没有 token 就提示并跳转登录页。
        if (!getToken()) {
            handleUnauthorized('未检测到登录 token，请先登录后再进行训练打卡。');
            return;
        }

        refreshPageData();
    }

    function getApiBase() {
        const customBase = readStorageValue('fitmateApiBase');

        if (customBase) {
            return customBase.replace(/\/$/, '');
        }

        // 直接双击打开 HTML 演示时，默认请求本机 Express 服务。
        if (window.location.protocol === 'file:') {
            return 'http://localhost:3000/api/record';
        }

        return '/api/record';
    }

    function getToken() {
        const tokenKeys = ['token', 'authToken', 'jwt', 'jwtToken', 'fitmate_token'];

        for (const key of tokenKeys) {
            const value = readStorageValue(key);
            if (value) {
                return normalizeToken(value);
            }
        }

        return '';
    }

    function readStorageValue(key) {
        // 兼容 localStorage 和 sessionStorage，但不新增登录状态。
        const storages = [];

        try {
            storages.push(window.localStorage);
        } catch (error) {
            // localStorage 不可用时继续尝试 sessionStorage。
        }

        try {
            storages.push(window.sessionStorage);
        } catch (error) {
            // sessionStorage 不可用时返回空值。
        }

        for (const storage of storages) {
            try {
                const value = storage.getItem(key);
                if (value) {
                    return value;
                }
            } catch (error) {
                // 某些浏览器隐私模式可能禁用 storage，直接忽略。
            }
        }

        return '';
    }

    function normalizeToken(value) {
        const token = value.trim();

        // 有些登录页会保存完整的 "Bearer xxx"，这里统一去掉前缀。
        if (token.toLowerCase().startsWith('bearer ')) {
            return token.slice(7).trim();
        }

        return token;
    }

    async function requestJson(url, options = {}) {
        const token = getToken();

        if (!token) {
            handleUnauthorized('未检测到登录 token，请先登录后再进行训练打卡。');
            throw createRequestError('未检测到登录 token，请先登录后再进行训练打卡。', 401);
        }

        let response;

        try {
            response = await fetch(url, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                    ...(options.headers || {})
                }
            });
        } catch (error) {
            throw createRequestError('无法连接后端接口，请确认后端服务已启动，且接口地址正确。');
        }

        const data = await readJsonSafely(response);

        if (response.status === 401) {
            const message = data.message || '登录已过期，请重新登录。';
            handleUnauthorized(message);
            throw createRequestError(message, 401);
        }

        if (!response.ok || data.success === false) {
            throw createRequestError(getFriendlyApiMessage(data.message, response.status), response.status);
        }

        return data;
    }

    function createRequestError(message, status) {
        const error = new Error(message);
        error.status = status;
        return error;
    }

    async function readJsonSafely(response) {
        try {
            return await response.json();
        } catch (error) {
            return {
                success: false,
                message: response.ok ? '接口返回格式不正确。' : '接口请求失败，请检查后端服务。'
            };
        }
    }

    function getFriendlyApiMessage(message = '', status) {
        if (status === 409 || /已经.*打卡|重复|唯一|ER_DUP_ENTRY/i.test(message)) {
            return '今天已经打卡过了，请不要重复提交。';
        }

        return message || '接口请求失败，请稍后再试。';
    }

    async function handleSubmit(event) {
        event.preventDefault();
        hideAlert();

        if (!validateForm()) {
            showAlert('warning', '请先检查表单内容，再提交打卡。');
            return;
        }

        setSubmitLoading(true);

        try {
            await requestJson(API_BASE, {
                method: 'POST',
                body: JSON.stringify(buildPayload())
            });

            showAlert('success', '打卡成功，历史记录和统计数据已刷新。');
            clearFormAfterSubmit();
            await refreshPageData();
        } catch (error) {
            if (error.status !== 401) {
                showAlert('danger', error.message);
            }
        } finally {
            setSubmitLoading(false);
        }
    }

    function buildPayload() {
        const caloriesValue = caloriesBurned.value.trim();

        return {
            training_date: trainingDate.value,
            training_content: trainingContent.value.trim(),
            training_duration: Number(trainingDuration.value),
            calories_burned: caloriesValue === '' ? null : Number(caloriesValue),
            note: trainingNote.value.trim() || null
        };
    }

    function validateForm() {
        let isValid = true;
        const duration = Number(trainingDuration.value);
        const caloriesValue = caloriesBurned.value.trim();
        const calories = Number(caloriesValue);

        clearInvalidState();

        if (!trainingDate.value) {
            trainingDate.classList.add('is-invalid');
            isValid = false;
        }

        if (trainingDate.value && isFutureDate(trainingDate.value)) {
            trainingDate.classList.add('is-invalid');
            showAlert('warning', '不能提交未来日期的训练记录。');
            isValid = false;
        }

        if (!trainingContent.value.trim()) {
            trainingContent.classList.add('is-invalid');
            isValid = false;
        }

        if (!Number.isFinite(duration) || duration <= 0) {
            trainingDuration.classList.add('is-invalid');
            isValid = false;
        }

        if (caloriesValue !== '' && (!Number.isFinite(calories) || calories < 0)) {
            caloriesBurned.classList.add('is-invalid');
            isValid = false;
        }

        form.classList.add('was-validated');
        return isValid;
    }

    function clearInvalidState() {
        [trainingDate, trainingContent, trainingDuration, caloriesBurned].forEach((field) => {
            field.classList.remove('is-invalid');
        });
    }

    async function refreshPageData() {
        await Promise.allSettled([
            loadHistory(),
            loadStreak(),
            loadStats()
        ]);
    }

    async function loadHistory() {
        setHistoryLoading(true);

        try {
            const result = await requestJson(`${API_BASE}/history?page=1&pageSize=${HISTORY_PAGE_SIZE}`);
            const records = Array.isArray(result.data) ? result.data : [];
            const total = Number(result.total) || 0;

            renderHistory(records);
            historySummary.textContent = total > 0
                ? `共 ${total} 条记录，当前展示最近 ${records.length} 条。`
                : '暂无训练记录。';
        } catch (error) {
            if (error.status !== 401) {
                historyList.innerHTML = '';
                showEmptyState('历史记录加载失败', '请确认已经登录，并且后端服务正在运行。');
                historySummary.textContent = '历史记录加载失败。';
                showAlert('danger', error.message);
            }
        } finally {
            setHistoryLoading(false);
        }
    }

    async function loadStreak() {
        try {
            const result = await requestJson(`${API_BASE}/streak`);
            statEls.streak.textContent = formatNumber(result.current_streak);

            // 如果 stats 接口失败，streak 接口里的 total_days 可以作为累计次数兜底展示。
            if (statEls.total.textContent === '--') {
                statEls.total.textContent = formatNumber(result.total_days);
            }
        } catch (error) {
            if (error.status !== 401) {
                statEls.streak.textContent = '--';
            }
        }
    }

    async function loadStats() {
        try {
            const result = await requestJson(`${API_BASE}/stats`);
            const stats = result.data || {};

            statEls.weekly.textContent = formatNumber(stats.weekly);
            statEls.monthly.textContent = formatNumber(stats.monthly);
            statEls.total.textContent = formatNumber(stats.total);

            if (stats.streak !== undefined) {
                statEls.streak.textContent = formatNumber(stats.streak);
            }
        } catch (error) {
            if (error.status !== 401) {
                statEls.weekly.textContent = '--';
                statEls.monthly.textContent = '--';
                statEls.total.textContent = '--';
                showAlert('warning', error.message);
            }
        }
    }

    function renderHistory(records) {
        historyList.innerHTML = '';

        if (records.length === 0) {
            showEmptyState('暂无训练记录', '完成第一次训练后，就可以在这里看到历史打卡。');
            return;
        }

        emptyState.classList.add('d-none');
        const fragment = document.createDocumentFragment();

        records.forEach((record) => {
            const item = document.createElement('article');
            const caloriesText = formatCalories(record.calories_burned);

            item.className = 'history-item';
            item.innerHTML = `
                <div class="history-item__top">
                    <span class="history-date">${escapeHtml(formatDate(record.training_date))}</span>
                </div>
                <div class="history-meta">
                    <span class="history-meta__item">${escapeHtml(formatDuration(record.training_duration))}</span>
                    ${caloriesText ? `<span class="history-meta__item">${escapeHtml(caloriesText)}</span>` : ''}
                </div>
                <div class="history-content">${escapeHtml(record.training_content || '未填写训练内容')}</div>
                ${record.note ? `<p class="history-note">${escapeHtml(record.note)}</p>` : ''}
            `;
            fragment.appendChild(item);
        });

        historyList.appendChild(fragment);
    }

    function showEmptyState(title, text) {
        emptyTitle.textContent = title;
        emptyText.textContent = text;
        emptyState.classList.remove('d-none');
    }

    function clearFormAfterSubmit() {
        const currentDate = trainingDate.value || getToday();

        form.reset();
        trainingDate.value = currentDate;
        clearInvalidState();
        form.classList.remove('was-validated');
    }

    function handleUnauthorized(message) {
        showAlert('danger', `${message} 即将跳转到登录页面。`);
        setHistoryLoading(false);
        historySummary.textContent = '请先登录后查看训练记录。';
        showEmptyState('请先登录', '登录后即可提交训练打卡并查看历史记录。');
        disableForm();

        if (isRedirectingToLogin) {
            return;
        }

        isRedirectingToLogin = true;
        window.setTimeout(() => {
            window.location.href = LOGIN_PAGE;
        }, 1200);
    }

    function disableForm() {
        form.querySelectorAll('input, textarea, button').forEach((element) => {
            element.disabled = true;
        });
        refreshBtn.disabled = true;
    }

    function setSubmitLoading(isLoading) {
        submitBtn.disabled = isLoading || isRedirectingToLogin;
        submitBtn.textContent = isLoading ? '提交中...' : '提交打卡';
    }

    function setHistoryLoading(isLoading) {
        historyLoading.classList.toggle('d-none', !isLoading);
        refreshBtn.disabled = isLoading || isRedirectingToLogin;
    }

    function showAlert(type, message) {
        pageAlert.className = `alert alert-${type}`;
        pageAlert.textContent = message;
    }

    function hideAlert() {
        pageAlert.className = 'alert d-none';
        pageAlert.textContent = '';
    }

    function getToday() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function isFutureDate(value) {
        return /^\d{4}-\d{2}-\d{2}$/.test(value) && value > getToday();
    }

    function formatDate(value) {
        if (!value) {
            return '未知日期';
        }

        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
            return value.slice(0, 10);
        }

        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('zh-CN');
    }

    function formatDuration(value) {
        const duration = Number(value);
        return Number.isFinite(duration) && duration > 0 ? `${duration} 分钟` : '未记录时长';
    }

    function formatCalories(value) {
        if (value === null || value === undefined || value === '') {
            return '';
        }

        const calories = Number(value);
        return Number.isFinite(calories) && calories >= 0 ? `${calories} 千卡` : '';
    }

    function formatNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? String(number) : '--';
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
})();
