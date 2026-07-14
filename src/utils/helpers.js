// Format currency to IDR
export const formatPrice = (amount) => {
  if (!amount) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

// Format date
export const formatDate = (timestamp) => {
  if (!timestamp) return '-'
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

// Generate slug from text
export const generateSlug = (text) => {
  if (!text) return ''
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Generate order ID
export const generateOrderId = () => {
  const prefix = 'PK'
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `${prefix}-${year}${month}${day}-${random}`
}

// Truncate text
export const truncateText = (text, maxLength = 100) => {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

// Get status color
export const getStatusColor = (status) => {
  const colors = {
    'pending': 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20',
    'paid': 'text-blue-500 bg-blue-50 dark:bg-blue-900/20',
    'settlement': 'text-green-500 bg-green-50 dark:bg-green-900/20',
    'success': 'text-green-500 bg-green-50 dark:bg-green-900/20',
    'failed': 'text-red-500 bg-red-50 dark:bg-red-900/20',
    'cancel': 'text-red-500 bg-red-50 dark:bg-red-900/20',
    'expire': 'text-gray-500 bg-gray-50 dark:bg-gray-900/20',
    'holding': 'text-orange-500 bg-orange-50 dark:bg-orange-900/20',
    'available': 'text-green-500 bg-green-50 dark:bg-green-900/20',
    'withdraw': 'text-purple-500 bg-purple-50 dark:bg-purple-900/20',
    'draft': 'text-gray-500 bg-gray-50 dark:bg-gray-900/20',
    'published': 'text-green-500 bg-green-50 dark:bg-green-900/20',
    'out_of_stock': 'text-red-500 bg-red-50 dark:bg-red-900/20',
    'pending_payment': 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20',
    'processed': 'text-blue-500 bg-blue-50 dark:bg-blue-900/20',
    'completed': 'text-green-500 bg-green-50 dark:bg-green-900/20',
    'rejected': 'text-red-500 bg-red-50 dark:bg-red-900/20'
  }
  return colors[status] || 'text-gray-500 bg-gray-50 dark:bg-gray-900/20'
}

// Get status label
export const getStatusLabel = (status) => {
  const labels = {
    'pending': 'Menunggu',
    'paid': 'Dibayar',
    'settlement': 'Selesai',
    'success': 'Berhasil',
    'failed': 'Gagal',
    'cancel': 'Dibatalkan',
    'expire': 'Kadaluarsa',
    'holding': 'Ditahan',
    'available': 'Tersedia',
    'withdraw': 'Ditarik',
    'draft': 'Draft',
    'published': 'Published',
    'out_of_stock': 'Habis',
    'pending_payment': 'Menunggu Pembayaran',
    'processed': 'Diproses',
    'completed': 'Selesai',
    'rejected': 'Ditolak'
  }
  return labels[status] || status
}

// Validate email
export const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// Validate phone number
export const isValidPhone = (phone) => {
  return /^[0-9]{10,13}$/.test(phone)
}

// Generate random ID
export const generateId = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// Debounce function
export const debounce = (func, wait = 300) => {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

// Check if product is out of stock
export const isOutOfStock = (product) => {
  if (!product) return true
  if (product.unlimited) return false
  return product.stock <= 0
}

// Calculate seller level based on sales
export const getSellerLevel = (totalSales) => {
  if (totalSales >= 1000) return 'Diamond'
  if (totalSales >= 500) return 'Platinum'
  if (totalSales >= 200) return 'Gold'
  if (totalSales >= 50) return 'Silver'
  return 'Bronze'
}

// Get seller level color
export const getSellerLevelColor = (level) => {
  const colors = {
    'Bronze': 'text-orange-500',
    'Silver': 'text-gray-400',
    'Gold': 'text-yellow-500',
    'Platinum': 'text-gray-300',
    'Diamond': 'text-blue-400'
  }
  return colors[level] || 'text-gray-500'
}