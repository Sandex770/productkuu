import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

console.log('=== MAIN.JS LOADED ===')
console.log('React version:', React.version)

const rootElement = document.getElementById('root')
console.log('Root element:', rootElement)

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement)
  console.log('Root created, rendering...')
  root.render(
    React.createElement(React.StrictMode, null,
      React.createElement(App, null)
    )
  )
  console.log('Render complete!')
} else {
  console.error('Root element NOT FOUND!')
}