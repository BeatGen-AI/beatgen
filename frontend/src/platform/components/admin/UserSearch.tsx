import React, { useState } from 'react'
import { Search, User, Loader2, Mail, Calendar, Coins } from 'lucide-react'
import { Input } from '../../../components/ui/input'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card'
import { Badge } from '../../../components/ui/badge'
import { Alert, AlertDescription } from '../../../components/ui/alert'
import { adminApi, AdminUserSearch } from '../../api/admin'

interface UserSearchProps {
  onUserSelect: (user: AdminUserSearch) => void
  selectedUser?: AdminUserSearch | null
}

export const UserSearch: React.FC<UserSearchProps> = ({ onUserSelect, selectedUser }) => {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchResult, setSearchResult] = useState<AdminUserSearch | null>(null)

  const handleSearch = async () => {
    if (!email.trim()) {
      setError('Please enter an email address')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address')
      return
    }

    setLoading(true)
    setError(null)
    setSearchResult(null)

    try {
      const result = await adminApi.searchUserByEmail(email.trim())
      setSearchResult(result)
      onUserSelect(result)
    } catch (err: any) {
      if (err.response?.status === 404) {
        setError(`No user found with email: ${email.trim()}`)
      } else if (err.response?.status === 403) {
        setError('You do not have permission to perform this action')
      } else {
        setError(err.response?.data?.detail || 'Failed to search for user')
      }
      setSearchResult(null)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleSearch()
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'free': return 'bg-gray-500'
      case 'starter': return 'bg-blue-500'
      case 'creator': return 'bg-purple-500'
      case 'pro': return 'bg-gold-500'
      default: return 'bg-gray-500'
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search User
          </CardTitle>
          <CardDescription>
            Search for a user by their email address
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={loading}
              />
            </div>
            <Button 
              onClick={handleSearch} 
              disabled={loading || !email.trim()}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {loading ? 'Searching...' : 'Search'}
            </Button>
          </div>
          
          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {(searchResult || selectedUser) && (
        <Card className={selectedUser === searchResult ? 'ring-2 ring-blue-500' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              User Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const user = selectedUser || searchResult
              if (!user) return null

              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">Email:</span>
                        <span>{user.email}</span>
                      </div>
                      
                      {user.username && (
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">Username:</span>
                          <span>{user.username}</span>
                        </div>
                      )}
                      
                      {user.display_name && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium">Display Name:</span>
                          <span>{user.display_name}</span>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">Created:</span>
                        <span>{formatDate(user.created_at)}</span>
                      </div>
                    </div>

                    {user.credits && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Coins className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">Credits:</span>
                          <span className="font-mono">
                            {user.credits.is_unlimited ? '∞ (Unlimited)' : user.credits.balance}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium">Plan:</span>
                          <Badge className={getTierColor(user.credits.subscription_tier)}>
                            {user.credits.subscription_tier.charAt(0).toUpperCase() + 
                             user.credits.subscription_tier.slice(1)}
                          </Badge>
                        </div>
                        
                        {!user.credits.is_unlimited && (
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium">Monthly:</span>
                            <span>{user.credits.monthly_allocation} credits</span>
                            {user.credits.has_rollover && (
                              <Badge variant="outline" className="text-xs">
                                Rollover
                              </Badge>
                            )}
                          </div>
                        )}
                        
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium">Total Used:</span>
                          <span>{user.credits.total_used}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground">
                      User ID: {user.id}
                    </p>
                  </div>
                </div>
              )
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  )
}