import React from 'react'
import { motion } from 'framer-motion'

const CategoryCard = ({ category }) => {
  return React.createElement(
    motion.div,
    {
      whileHover: { y: -4, scale: 1.02 },
      className: "bg-white dark:bg-gray-800 rounded-xl shadow-soft p-4 text-center cursor-pointer transition-all hover:shadow-soft-lg"
    },
    React.createElement('div', { className: "text-3xl mb-2" }, category.icon),
    React.createElement('h3', { className: "font-medium text-sm" }, category.name),
    React.createElement('p', { className: "text-xs text-gray-500" }, category.count, " produk")
  )
}

export default CategoryCard