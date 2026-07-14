import React from 'react'

const LoadingScreen = () => {
  return React.createElement(
    'div',
    { className: "min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900" },
    React.createElement(
      'div',
      { className: "text-center" },
      React.createElement('div', { 
        className: "w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" 
      }),
      React.createElement('p', { className: "text-gray-600 dark:text-gray-400" }, "Loading...")
    )
  )
}

export default LoadingScreen