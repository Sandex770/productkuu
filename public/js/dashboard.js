// File: public/js/dashboard.js
import { db, collections, getDocs, query, where, orderBy, limit } from './firebase-config.js';
import { formatPrice, formatDate } from './app.js';

// ============================================
// CHART RENDERER
// ============================================

export function renderSalesChart(data, elementId) {
    // Simple chart rendering using canvas
    const canvas = document.getElementById(elementId);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width || 400;
    const height = canvas.height || 200;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    if (!data || data.length === 0) {
        ctx.fillStyle = '#9CA3AF';
        ctx.font = '14px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Tidak ada data', width / 2, height / 2);
        return;
    }
    
    // Draw chart
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    const maxValue = Math.max(...data.map(d => d.value)) * 1.2;
    
    // Draw grid lines
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    
    for (let i = 0; i <= 4; i++) {
        const y = padding + chartHeight - (i / 4) * chartHeight;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
        
        ctx.fillStyle = '#6B7280';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(formatPrice(maxValue * i / 4), padding - 5, y + 3);
    }
    
    ctx.setLineDash([]);
    
    // Draw bars or line
    const barWidth = chartWidth / data.length * 0.6;
    const spacing = chartWidth / data.length;
    
    data.forEach((d, i) => {
        const x = padding + i * spacing + (spacing - barWidth) / 2;
        const barHeight = (d.value / maxValue) * chartHeight;
        const y = padding + chartHeight - barHeight;
        
        // Bar
        const gradient = ctx.createLinearGradient(x, y, x, padding + chartHeight);
        gradient.addColorStop(0, '#4F46E5');
        gradient.addColorStop(1, '#818CF8');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 4);
        ctx.fill();
        
        // Label
        ctx.fillStyle = '#6B7280';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(d.label, x + barWidth / 2, padding + chartHeight + 15);
    });
}

// ============================================
// TABLE RENDERER
// ============================================

export function renderTable(data, columns, options = {}) {
    const { 
        containerId, 
        className = 'w-full',
        showActions = true,
        actions = [],
        onAction 
    } = options;
    
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!data || data.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <i class="fas fa-inbox text-4xl mb-2"></i>
                <p>Tidak ada data</p>
            </div>
        `;
        return;
    }
    
    let html = `<div class="overflow-x-auto"><table class="${className}">`;
    
    // Header
    html += '<thead><tr class="border-b border-gray-200 dark:border-gray-700">';
    columns.forEach(col => {
        html += `<th class="text-left py-3 px-4 font-semibold text-sm">${col.label}</th>`;
    });
    if (showActions) {
        html += `<th class="text-left py-3 px-4 font-semibold text-sm">Aksi</th>`;
    }
    html += '</tr></thead>';
    
    // Body
    html += '<tbody>';
    data.forEach((row, index) => {
        html += `<tr class="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">`;
        
        columns.forEach(col => {
            const value = row[col.key] || '-';
            let displayValue = value;
            
            if (col.type === 'price') {
                displayValue = `Rp${formatPrice(value)}`;
            } else if (col.type === 'date') {
                displayValue = formatDate(value);
            } else if (col.type === 'status') {
                const statusClasses = {
                    'published': 'badge-success',
                    'draft': 'badge-warning',
                    'pending': 'badge-warning',
                    'paid': 'badge-success',
                    'settlement': 'badge-success',
                    'failed': 'badge-danger',
                    'expire': 'badge-danger',
                    'active': 'badge-success',
                    'inactive': 'badge-danger'
                };
                const statusClass = statusClasses[value] || 'badge-info';
                displayValue = `<span class="badge ${statusClass}">${value}</span>`;
            }
            
            html += `<td class="py-3 px-4 text-sm">${displayValue}</td>`;
        });
        
        if (showActions) {
            html += `<td class="py-3 px-4 text-sm">
                <div class="flex gap-2">
                    ${actions.map(action => `
                        <button onclick="(${action.handler})('${row.id}')" 
                                class="text-${action.color || 'indigo'}-600 hover:text-${action.color || 'indigo'}-700">
                            <i class="fas fa-${action.icon}"></i>
                        </button>
                    `).join('')}
                </div>
            </td>`;
        }
        
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    
    container.innerHTML = html;
}

// ============================================
// PAGINATION
// ============================================

export function renderPagination(currentPage, totalPages, onPageChange) {
    const container = document.createElement('div');
    container.className = 'flex items-center justify-between mt-4';
    
    const prevDisabled = currentPage <= 1;
    const nextDisabled = currentPage >= totalPages;
    
    container.innerHTML = `
        <button onclick="(${onPageChange})(${currentPage - 1})" 
                class="btn-secondary text-sm ${prevDisabled ? 'opacity-50 cursor-not-allowed' : ''}"
                ${prevDisabled ? 'disabled' : ''}>
            <i class="fas fa-chevron-left mr-1"></i> Sebelumnya
        </button>
        <span class="text-sm text-gray-500">
            Halaman ${currentPage} dari ${totalPages}
        </span>
        <button onclick="(${onPageChange})(${currentPage + 1})" 
                class="btn-secondary text-sm ${nextDisabled ? 'opacity-50 cursor-not-allowed' : ''}"
                ${nextDisabled ? 'disabled' : ''}>
            Selanjutnya <i class="fas fa-chevron-right ml-1"></i>
        </button>
    `;
    
    return container;
}

// ============================================
// SKELETON LOADER
// ============================================

export function skeletonLoader(count = 5, type = 'card') {
    const templates = {
        card: `
            <div class="skeleton h-48 rounded-xl"></div>
            <div class="mt-4 space-y-2">
                <div class="skeleton h-4 w-3/4"></div>
                <div class="skeleton h-4 w-1/2"></div>
                <div class="skeleton h-6 w-1/4"></div>
            </div>
        `,
        table: `
            <div class="flex items-center gap-4 py-3">
                <div class="skeleton h-12 w-12 rounded-full"></div>
                <div class="flex-1 space-y-2">
                    <div class="skeleton h-4 w-1/3"></div>
                    <div class="skeleton h-3 w-1/4"></div>
                </div>
                <div class="skeleton h-6 w-20"></div>
            </div>
        `,
        list: `
            <div class="flex items-center gap-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <div class="skeleton h-12 w-12 rounded-full"></div>
                <div class="flex-1 space-y-2">
                    <div class="skeleton h-4 w-2/3"></div>
                    <div class="skeleton h-3 w-1/3"></div>
                </div>
            </div>
        `
    };
    
    const template = templates[type] || templates.card;
    return Array(count).fill(template).join('');
}

// ============================================
// EXPORT
// ============================================

export { renderSalesChart as renderChart };