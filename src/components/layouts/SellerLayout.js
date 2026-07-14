import React, { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Package, 
  Wallet, 
  ShoppingBag, 
  CreditCard,
  User,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { motion, AnimatePresence } from 'framer-motion'

const SellerLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()

  const menuItems = [
    { path: '/seller/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/seller/products', label: 'Produk', icon: Package },
    { path: '/seller/wallet', label: 'Wallet', icon: Wallet },
    { path: '/seller/transactions', label: 'Transaksi', icon: ShoppingBag },
    { path: '/seller/withdraw', label: 'Withdraw', icon: CreditCard },
    { path: '/seller/profile', label: 'Profil Toko', icon: User },
    { path: '/seller/settings', label: 'Pengaturan', icon: Settings },
  ]

  const isActive = (path) => location.pathname === path

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return React.createElement(
    'div',
    { className: "min-h-screen bg-gray-50 dark:bg-gray-900" },
    // Mobile Header
    React.createElement(
      'div',
      { className: "lg:hidden fixed top-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4" },
      React.createElement(
        'div',
        { className: "flex items-center justify-between" },
        React.createElement(
          'button',
          { onClick: () => setSidebarOpen(true), className: "p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" },
          React.createElement(Menu, { className: "w-6 h-6" })
        ),
        React.createElement(Link, { to: "/", className: "font-bold text-xl" }, "ProductKuu"),
        React.createElement('div', { className: "w-8" })
      )
    ),

    // Sidebar Overlay
    React.createElement(
      AnimatePresence,
      null,
      sidebarOpen && React.createElement(
        motion.div,
        {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          exit: { opacity: 0 },
          className: "fixed inset-0 bg-black/50 z-40 lg:hidden",
          onClick: () => setSidebarOpen(false)
        }
      )
    ),

    // Sidebar
    React.createElement(
      motion.div,
      {
        className: `fixed top-0 left-0 h-full w-72 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 z-50 transform transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`,
      },
      React.createElement(
        'div',
        { className: "flex flex-col h-full" },
        // Header
        React.createElement(
          'div',
          { className: "p-6 border-b border-gray-200 dark:border-gray-700" },
          React.createElement(
            'div',
            { className: "flex items-center justify-between" },
            React.createElement(Link, { to: "/", className: "flex items-center gap-2" },
              React.createElement('div', { className: "w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center" },
                React.createElement('span', { className: "text-white font-bold" }, "P")
              ),
              React.createElement('span', { className: "font-bold text-xl" }, "ProductKuu")
            ),
            React.createElement(
              'button',
              { onClick: () => setSidebarOpen(false), className: "lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" },
              React.createElement(X, { className: "w-5 h-5" })
            )
          )
        ),

        // Menu
        React.createElement(
          'nav',
          { className: "flex-1 overflow-y-auto p-4" },
          React.createElement(
            'div',
            { className: "space-y-1" },
            menuItems.map((item) =>
              React.createElement(
                Link,
                {
                  key: item.path,
                  to: item.path,
                  className: `flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    isActive(item.path)
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`
                },
                React.createElement(item.icon, { className: "w-5 h-5" }),
                React.createElement('span', { className: "flex-1" }, item.label),
                isActive(item.path) && React.createElement(ChevronRight, { className: "w-4 h-4" })
              )
            )
          )
        ),

        // Footer
        React.createElement(
          'div',
          { className: "p-4 border-t border-gray-200 dark:border-gray-700" },
          React.createElement(
            'button',
            {
              onClick: handleLogout,
              className: "flex items-center gap-3 w-full px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            },
            React.createElement(LogOut, { className: "w-5 h-5" }),
            React.createElement('span', null, "Logout")
          ),
          React.createElement(
            'div',
            { className: "mt-3 px-4 py-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg" },
            React.createElement('p', { className: "text-sm font-medium" }, user?.displayName || 'Seller'),
            React.createElement('p', { className: "text-xs text-gray-500" }, user?.email)
          )
        )
      )
    ),

    // Main Content
    React.createElement(
      'div',
      { className: `lg:ml-72 min-h-screen transition-all duration-300 ${
        sidebarOpen ? 'ml-72' : 'ml-0'
      }` },
      React.createElement(
        'div',
        { className: "p-4 md:p-8 mt-16 lg:mt-0" },
        children
      )
    )
  )
}

export default SellerLayout