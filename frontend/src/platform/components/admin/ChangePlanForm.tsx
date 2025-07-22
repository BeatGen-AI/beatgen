import React, { useState } from 'react'
import { Settings, Loader2, CheckCircle, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card'
import { Label } from '../../../components/ui/label'
import { Alert, AlertDescription } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog'
import { adminApi, AdminUserSearch } from '../../api/admin'

interface ChangePlanFormProps {
  selectedUser: AdminUserSearch | null
  onSuccess: (updatedCredits: any) => void
}

type TierType = 'free' | 'starter' | 'creator' | 'pro'

const TIER_INFO = {
  free: {
    name: 'Free',
    credits: 10,
    rollover: false,
    color: 'bg-gray-500',
    description: '10 credits/month, no rollover'
  },
  starter: {
    name: 'Starter',
    credits: 50,
    rollover: true,
    color: 'bg-blue-500',
    description: '50 credits/month with rollover'
  },
  creator: {
    name: 'Creator',
    credits: 150,
    rollover: true,
    color: 'bg-purple-500',
    description: '150 credits/month with rollover'
  },
  pro: {
    name: 'Pro',
    credits: -1, // unlimited
    rollover: false,
    color: 'bg-yellow-500',
    description: 'Unlimited credits'
  }
}

export const ChangePlanForm: React.FC<ChangePlanFormProps> = ({ selectedUser, onSuccess }) => {
  const [newTier, setNewTier] = useState<TierType | ''>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  const currentTier = selectedUser?.credits?.subscription_tier as TierType
  const currentTierInfo = currentTier ? TIER_INFO[currentTier] : null
  const newTierInfo = newTier ? TIER_INFO[newTier] : null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    // Validation
    if (!selectedUser) {
      setError('Please search for and select a user first')
      return
    }

    if (!newTier) {
      setError('Please select a new plan')
      return
    }

    if (newTier === currentTier) {
      setError('User is already on the selected plan')
      return
    }

    setShowConfirmDialog(true)
  }

  const handleConfirm = async () => {
    if (!selectedUser || !newTier) return

    setLoading(true)
    setShowConfirmDialog(false)

    try {
      const response = await adminApi.changeUserTier(selectedUser.id, {
        new_tier: newTier
      })

      setSuccess(`Successfully changed ${selectedUser.email} from ${currentTierInfo?.name} to ${newTierInfo?.name}`)
      setNewTier('')
      onSuccess(response.credits)
    } catch (err: any) {
      if (err.response?.status === 403) {
        setError('You do not have permission to perform this action')
      } else if (err.response?.status === 404) {
        setError('User not found or plan could not be changed')
      } else {
        setError(err.response?.data?.detail || 'Failed to change user plan')
      }
    } finally {
      setLoading(false)
    }
  }

  const getTierLevel = (tier: TierType) => {
    const levels = { free: 0, starter: 1, creator: 2, pro: 3 }
    return levels[tier] || 0
  }

  const isUpgrade = newTier && currentTier && getTierLevel(newTier) > getTierLevel(currentTier)
  const isDowngrade = newTier && currentTier && getTierLevel(newTier) < getTierLevel(currentTier)

  const isFormValid = selectedUser && newTier && newTier !== currentTier

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Change Plan
          </CardTitle>
          <CardDescription>
            Change a user's subscription tier and credit allocation
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!selectedUser ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please search for and select a user above to change their plan
              </AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Current Plan Display */}
              {currentTierInfo && (
                <div className="space-y-2">
                  <Label>Current Plan</Label>
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className={currentTierInfo.color}>
                          {currentTierInfo.name}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {currentTierInfo.description}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">
                          {selectedUser.credits?.is_unlimited ? '∞' : selectedUser.credits?.balance} credits
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Current balance
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* New Plan Selection */}
              <div className="space-y-2">
                <Label htmlFor="new-tier">New Plan</Label>
                <Select 
                  value={newTier} 
                  onValueChange={(value: TierType) => setNewTier(value)}
                  disabled={loading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a new plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIER_INFO).map(([tier, info]) => (
                      <SelectItem 
                        key={tier} 
                        value={tier}
                        disabled={tier === currentTier}
                      >
                        <div className="flex items-center gap-2">
                          <Badge className={info.color} variant="outline">
                            {info.name}
                          </Badge>
                          <span>{info.description}</span>
                          {tier === currentTier && (
                            <span className="text-xs text-muted-foreground">(current)</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Plan Change Preview */}
              {newTier && newTierInfo && currentTierInfo && (
                <div className="space-y-2">
                  <Label>Plan Change Preview</Label>
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      {isUpgrade && <TrendingUp className="h-4 w-4 text-green-600" />}
                      {isDowngrade && <TrendingDown className="h-4 w-4 text-orange-600" />}
                      <span className="font-medium">
                        {isUpgrade ? 'Upgrade' : isDowngrade ? 'Downgrade' : 'Plan Change'}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="font-medium text-muted-foreground">From</div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className={currentTierInfo.color} variant="outline">
                            {currentTierInfo.name}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {currentTierInfo.credits === -1 ? 'Unlimited' : currentTierInfo.credits} credits/month
                        </div>
                      </div>
                      
                      <div>
                        <div className="font-medium text-muted-foreground">To</div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className={newTierInfo.color}>
                            {newTierInfo.name}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {newTierInfo.credits === -1 ? 'Unlimited' : newTierInfo.credits} credits/month
                        </div>
                      </div>
                    </div>

                    {/* Feature Changes */}
                    <div className="mt-3 pt-3 border-t">
                      <div className="text-xs space-y-1">
                        <div className="flex justify-between">
                          <span>Rollover:</span>
                          <span>
                            {currentTierInfo.rollover ? '✓' : '✗'} → {newTierInfo.rollover ? '✓' : '✗'}
                          </span>
                        </div>
                        {isUpgrade && newTierInfo.credits > 0 && currentTierInfo.credits > 0 && (
                          <div className="text-green-600">
                            • User will receive upgrade bonus credits
                          </div>
                        )}
                        {newTierInfo.credits === -1 && (
                          <div className="text-blue-600">
                            • User will have unlimited credits
                          </div>
                        )}
                        {isDowngrade && (
                          <div className="text-orange-600">
                            • Monthly allocation will be reduced
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>{success}</AlertDescription>
                </Alert>
              )}

              <Button 
                type="submit" 
                disabled={!isFormValid || loading}
                className="w-full"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Settings className="h-4 w-4 mr-2" />
                )}
                {loading ? 'Changing Plan...' : `Change to ${newTierInfo?.name || 'Selected'} Plan`}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Plan Change</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to change <strong>{selectedUser?.email}</strong>'s plan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <div className="space-y-2 text-sm">
              <div><strong>User:</strong> {selectedUser?.email}</div>
              <div><strong>Current Plan:</strong> {currentTierInfo?.name}</div>
              <div><strong>New Plan:</strong> {newTierInfo?.name}</div>
              <div><strong>Change Type:</strong> {
                isUpgrade ? (
                  <span className="text-green-600 font-medium">Upgrade</span>
                ) : isDowngrade ? (
                  <span className="text-orange-600 font-medium">Downgrade</span>
                ) : (
                  'Plan Change'
                )
              }</div>
              {isUpgrade && (
                <div className="text-green-600 text-xs">
                  • User will receive upgrade bonus credits
                </div>
              )}
              {newTierInfo?.credits === -1 && (
                <div className="text-blue-600 text-xs">
                  • User will have unlimited credits
                </div>
              )}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Changing...
                </>
              ) : (
                'Confirm Change'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}