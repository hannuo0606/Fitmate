(function () {
    const API_BASE = getApiBase();
    const HISTORY_PAGE_SIZE = 10;

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
    const trainingNote = document.getElementById('trainingNote');

    const statEls = {
        streak: document.getElementById('streakDays'),
        weekly: document.getElementById('weeklyCount'),
        monthly: document.getElementById('monthlyCount'),
        total: document.getElementById('totalCount')
    };

    document.addEventListener('DOMContentLoaded', initPage);

    function initPage() {
        trainingDate.value = getToday();
        form.addEventListener('submit', handleSubmit);
        refreshBtn.addEventListener('click', () => {
            hideAlert();
            refreshPageData();
        });
        refreshPageData();
    }

    function getApiBase() {
        const customBase = readLocalStorage('fitmateApiBase');

        if (customBase) {
            return customBase.replace(/\/$/, '');
        }

        // 直接打开 HTML 文件演示时，默认请求本机 Express 服务。
        if (window.location.protocol === 'file:') {
            return 'http://localhost:3000/api/record';
        }

        return '/api/record';
    }

    function getToken() {
        const tokenKeys = ['token', 'jwtToken', 'authToken', 'fitmate_token'];

        for (const key of tokenKeys) {
            const value = readLocalStorage(key);
            if (value) {
                return normalizeToken(value);
            }
        }

        return '';
    }

    function readLocalStorage(key) {
        try {
            return localStorage.getItem(key);
        } catch (error) {
            return '';
        }
    }

    function normalizeToken(value) {
        const token = value.trim();

        // 有些登录页会把完整的 "Bearer xxx" 存进 localStorage，这里统一去掉前缀。
        if (token.toLowerCase().startsWith('bearer ')) {
            return token.slice(7).trim();
        }

        return token;
    }

    async function requestJson(url, options = {}) {
        const token = getToken();

        if (!token) {
            throw new Error('未检测到登录 token，请先登录后再进行训练打卡。');
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
            throw new Error('无法连接后端接口，请确认后端服务已启动，且接口地址正确。');
        }

        const data = await readJsonSafely(response);

        if (!response.ok || data.success === false) {
            throw new Error(data.message || '接口请求失败，请稍后再试。');
        }

        return data;
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

    async function handleSubmit(event) {
        event.preventDefault();
        hideAlert();

        if (!validateForm()) {
            return;
        }

        setSubmitLoading(true);

        try {
            await requestJson(API_BASE, {
                method: 'POST',
                body: JSON.stringify({
                    training_date: trainingDate.value || getToday(),
                    training_content: trainingContent.value.trim(),
                    training_duration: Number(trainingDuration.value),
                    note: trainingNote.value.trim() || null
                })
            });

            showAlert('success', '打卡成功，历史记录已刷新。');
            form.reset();
            trainingDate.value = getToday();
            form.classList.remove('was-validated');
            await refreshPageData();
        } catch (error) {
            showAlert('danger', error.message);
        } finally {
            setSubmitLoading(false);
        }
    }

    function validateForm() {
        let isValid = true;
        const duration = Number(trainingDuration.value);

        trainingContent.classList.remove('is-invalid');
        trainingDuration.classList.remove('is-invalid');

        if (!trainingContent.value.trim()) {
            trainingContent.classList.add('is-invalid');
            isValid = false;
        }

        if (!Number.isFinite(duration) || duration <= 0) {
            trainingDuration.classList.add('is-invalid');
            isValid = false;
        }

        form.classList.add('was-validated');
        return isValid;
    }

    async function refreshPageData() {
        await Promise.allSettled([
            loadStats(),
            loadHistory()
        ]);
    }

    async function loadStats() {
        try {
            const result = await requestJson(`${API_BASE}/stats`);
            const stats = result.data || {};

            statEls.streak.textContent = formatNumber(stats.streak);
            statEls.weekly.textContent = formatNumber(stats.weekly);
            statEls.monthly.textContent = formatNumber(stats.monthly);
            statEls.total.textContent = formatNumber(stats.total);
        } catch (error) {
            statEls.streak.textContent = '--';
            statEls.weekly.textContent = '--';
            statEls.monthly.textContent = '--';
            statEls.total.textContent = '--';
            showAlert('warning', error.message);
        }
    }

    async function loadHistory() {
        setHistoryLoading(true);

        try {
            const result = await requestJson(`${API_BASE}/history?page=1&pageSize=${HISTORY_PAGE_SIZE}`);
            const records = Array.isArray(result.data) ? result.data : [];

            renderHistory(records);
            historySummary.textContent = result.total > 0
                ? `共 ${result.total} 条记录，当前展示最近 ${records.length} 条。`
                : '暂无历史记录。';
        } catch (error) {
            historyList.innerHTML = '';
            showEmptyState('历史记录加载失败', '请确认已经登录，并且后端服务正在运行。');
            historySummary.textContent = '历史记录加载失败。';
            showAlert('danger', error.message);
        } finally {
            setHistoryLoading(false);
        }
    }

    function renderHistory(records) {
        historyList.innerHTML = '';

        if (records.length === 0) {
            showEmptyState('还没有训练记录', '完成第一次训练后，就可以在这里看到历史打卡。');
            return;
        }

        emptyState.classList.add('d-none');
        const fragment = document.createDocumentFragment();

        records.forEach((record) => {
            const item = document.createElement('article');
            item.className = 'history-item';
            item.innerHTML = `
                <div class="history-item__top">
                    <span class="history-date">${escapeHtml(formatDate(record.training_date))}</span>
                    <span class="history-duration">${escapeHtml(formatDuration(record.training_duration))}</span>
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

    function setSubmitLoading(isLoading) {
        submitBtn.disabled = isLoading;
        submitBtn.textContent = isLoading ? '提交中...' : '提交打卡';
    }

    function setHistoryLoading(isLoading) {
        historyLoading.classList.toggle('d-none', !isLoading);
        refreshBtn.disabled = isLoading;
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
