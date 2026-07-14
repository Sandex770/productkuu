import React from 'react'

function App() {
  return React.createElement(
    'div',
    { 
      style: { 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#f3f4f6',
        fontFamily: 'sans-serif'
      }
    },
    React.createElement(
      'div',
      { 
        style: { 
          textAlign: 'center',
          padding: '2rem',
          backgroundColor: 'white',
          borderRadius: '1rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }
      },
      React.createElement('h1', { 
        style: { 
          fontSize: '2rem', 
          fontWeight: 'bold', 
          color: '#4f46e5',
          marginBottom: '0.5rem'
        } 
      }, 'ProductKuu'),
      React.createElement('p', { 
        style: { 
          color: '#6b7280',
          marginBottom: '0.5rem'
        } 
      }, 'Website sedang dalam perbaikan'),
      React.createElement('p', { 
        style: { 
          color: '#9ca3af',
          fontSize: '0.875rem'
        } 
      }, 'Vercel Deployment Test - ', new Date().toLocaleString())
    )
  )
}

export default App