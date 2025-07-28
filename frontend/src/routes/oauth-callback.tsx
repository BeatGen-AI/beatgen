import { createFileRoute } from '@tanstack/react-router'
import React, { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Card, CardContent } from '../components/ui/card'

// OAuth callback route - this will render at the path '/oauth-callback'
export const Route = createFileRoute('/oauth-callback')({
  component: OAuthCallbackPage,
})

function OAuthCallbackPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('Processing authentication...')
  
  useEffect(() => {
    const processOAuthCallback = async () => {
      try {
        // Get parameters from URL
        const urlParams = new URLSearchParams(window.location.search)
        const accessToken = urlParams.get('access_token')
        const userId = urlParams.get('user_id')
        
        if (!accessToken) {
          console.error('No access token found in redirect')
          setStatus('error')
          setMessage('Authentication failed: No access token received')
          return
        }
        
        console.log('OAuth callback successful with token and user ID:', userId)
        
        // Store the token
        localStorage.setItem('access_token', accessToken)
        console.log('OAuth authentication successful, token stored')
        
        // Set success status
        setStatus('success')
        setMessage('Authentication successful! Redirecting...')
        
        // Redirect to home or requested page
        setTimeout(() => {
          const redirectTo = localStorage.getItem('auth_redirect') || '/'
          localStorage.removeItem('auth_redirect') // Clear redirect
          window.location.href = redirectTo
        }, 1500)
      } catch (error) {
        console.error('OAuth callback processing failed:', error)
        setStatus('error')
        setMessage('Authentication failed. Please try again.')
        
        // Redirect to login page after showing error
        setTimeout(() => {
          window.location.href = '/login?error=oauth_failed'
        }, 3000)
      }
    }
    
    processOAuthCallback()
  }, [])
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white p-4">
      <Card className="w-full max-w-sm bg-gray-900 text-white border-gray-800 shadow-lg">
        <CardContent className="p-6 text-center">
          <h1 className="text-2xl font-semibold mb-4">
            {status === 'loading' ? 'Completing Sign-In' : 
             status === 'success' ? 'Sign-In Successful' : 
             'Sign-In Failed'}
          </h1>
          
          <div className="my-6 flex justify-center">
            {status === 'loading' && (
              <Loader2 className="animate-spin text-blue-500" size={40} />
            )}
          </div>
          
          <p className="text-gray-300">
            {message}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}