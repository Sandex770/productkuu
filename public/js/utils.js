// File: public/js/utils.js

// ============================================
// FORMATTING
// ============================================

export function formatPrice(price) {
    if (!price && price !== 0) return '0';
    return new Intl.NumberFormat('id-ID').format(price);
}

export function formatDate(date) {
    if (!date) return '-';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '-';
    
    return d.toLocaleDateString('id-ID', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

export function formatDateShort(date) {
    if (!date) return '-';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '-';
    
    return d.toLocaleDateString('id-ID', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

export function formatRelativeTime(date) {
    if (!date) return '-';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '-';
    
    const now = new Date();
    const diff = now - d;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Baru saja';
    if (minutes < 60) return `${minutes} menit yang lalu`;
    if (hours < 24) return `${hours} jam yang lalu`;
    if (days < 7) return `${days} hari yang lalu`;
    if (days < 30) return `${Math.floor(days / 7)} minggu yang lalu`;
    if (days < 365) return `${Math.floor(days / 30)} bulan yang lalu`;
    return `${Math.floor(days / 365)} tahun yang lalu`;
}

// ============================================
// STRING UTILITIES
// ============================================

export function generateSlug(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function generateOrderId() {
    const prefix = 'PK';
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}-${date}-${random}`;
}

export function generateId() {
    return Math.random().toString(36).substring(2, 10) + 
           Date.now().toString(36).substring(2, 6);
}

export function truncateText(text, maxLength = 100) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

export function capitalize(text) {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
}

export function titleCase(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// ============================================
// VALIDATION
// ============================================

export function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePhone(phone) {
    return /^[0-9+\-\s()]{8,15}$/.test(phone);
}

export function validatePrice(price) {
    return !isNaN(price) && price > 0;
}

export function validateRequired(value) {
    return value !== null && value !== undefined && value.toString().trim() !== '';
}

// ============================================
// STORAGE HELPERS
// ============================================

export function getFromStorage(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch {
        return defaultValue;
    }
}

export function saveToStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}

export function removeFromStorage(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch {
        return false;
    }
}

// ============================================
// ARRAY HELPERS
// ============================================

export function groupBy(array, key) {
    return array.reduce((result, item) => {
        const group = item[key] || 'undefined';
        if (!result[group]) result[group] = [];
        result[group].push(item);
        return result;
    }, {});
}

export function sortBy(array, key, order = 'asc') {
    return [...array].sort((a, b) => {
        const aVal = a[key] || 0;
        const bVal = b[key] || 0;
        if (order === 'asc') return aVal > bVal ? 1 : -1;
        return aVal < bVal ? 1 : -1;
    });
}

export function paginate(array, page = 1, limit = 20) {
    const start = (page - 1) * limit;
    const end = start + limit;
    return {
        data: array.slice(start, end),
        total: array.length,
        page,
        limit,
        pages: Math.ceil(array.length / limit)
    };
}

// ============================================
// FILE HELPERS
// ============================================

export function getFileExtension(filename) {
    return filename.split('.').pop() || '';
}

export function getFileSize(size) {
    if (size < 1024) return `${size} B`;
    if (size < 1048576) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1073741824) return `${(size / 1048576).toFixed(1)} MB`;
    return `${(size / 1073741824).toFixed(1)} GB`;
}

// ============================================
// COLOR HELPERS
// ============================================

export function getStatusColor(status) {
    const colors = {
        'published': 'success',
        'draft': 'warning',
        'pending': 'warning',
        'paid': 'success',
        'settlement': 'success',
        'failed': 'danger',
        'expire': 'danger',
        'active': 'success',
        'inactive': 'danger',
        'approved': 'success',
        'rejected': 'danger',
        'processing': 'info'
    };
    return colors[status] || 'info';
}

export function getStatusLabel(status) {
    const labels = {
        'published': 'Published',
        'draft': 'Draft',
        'pending': 'Pending',
        'paid': 'Paid',
        'settlement': 'Settlement',
        'failed': 'Failed',
        'expire': 'Expired',
        'active': 'Active',
        'inactive': 'Inactive',
        'approved': 'Approved',
        'rejected': 'Rejected',
        'processing': 'Processing'
    };
    return labels[status] || status;
}

// ============================================
// EXPORT
// ============================================

export default {
    formatPrice,
    formatDate,
    formatDateShort,
    formatRelativeTime,
    generateSlug,
    generateOrderId,
    generateId,
    truncateText,
    capitalize,
    titleCase,
    validateEmail,
    validatePhone,
    validatePrice,
    validateRequired,
    getFromStorage,
    saveToStorage,
    removeFromStorage,
    groupBy,
    sortBy,
    paginate,
    getFileExtension,
    getFileSize,
    getStatusColor,
    getStatusLabel
};