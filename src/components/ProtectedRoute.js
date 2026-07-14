import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import LoadingScreen from './LoadingScreen'

const ProtectedRoute = ({ role }) => {
  const { user, userRole, loading } = useAuth()

  if (loading) {
    return React.createElement(LoadingScreen, null)
  }

  if (!user) {
    return React.createElement(Navigate, { to: "/login", replace: true })
  }

  if (role && userRole !== role) {
    return React.createElement(Navigate, { to: "/", replace: true })
  }

  return React.createElement(Outlet, null)
}

export default ProtectedRoute