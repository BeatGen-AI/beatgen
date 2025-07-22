import React, { useState } from 'react'
import { Plus, Loader2, CheckCircle, AlertCircle, Coins } from 'lucide-react'
import { Input } from '../../../components/ui/input'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card'
import { Label } from '../../../components/ui/label'
import { Textarea } from '../../../components/ui/textarea'
import { Alert, AlertDescription } from '../../../components/ui/alert'
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

interface AddCreditsFormProps {
  selectedUser: AdminUserSearch | null
  onSuccess: (updatedCredits: any) => void
}

export const AddCreditsForm: React.FC<AddCreditsFormProps> = ({ selectedUser, onSuccess }) => {
  const [amount, setAmount] = useState<string>('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    // Validation
    if (!selectedUser) {
      setError('Please search for and select a user first')
      return
    }

    const numAmount = parseInt(amount)
    if (!amount.trim() || isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid positive number for credits')
      return
    }

    if (!description.trim()) {
      setError('Please provide a description for this credit addition')
      return
    }

    if (description.trim().length < 10) {
      setError('Description must be at least 10 characters long')
      return
    }

    if (selectedUser.credits?.subscription_tier === 'pro') {
      setError('Cannot add credits to Pro users (they have unlimited credits)')
      return
    }

    setShowConfirmDialog(true)
  }

  const handleConfirm = async () => {
    if (!selectedUser) return

    setLoading(true)
    setShowConfirmDialog(false)

    try {
      const response = await adminApi.addCreditsToUser(selectedUser.id, {
        amount: parseInt(amount),
        description: description.trim()
      })

      setSuccess(`Successfully added ${amount} credits to ${selectedUser.email}`)
      setAmount('')
      setDescription('')
      onSuccess(response.credits)
    } catch (err: any) {
      if (err.response?.status === 403) {
        setError('You do not have permission to perform this action')
      } else if (err.response?.status === 404) {
        setError('User not found or credits could not be added')
      } else {
        setError(err.response?.data?.detail || 'Failed to add credits')
      }
    } finally {
      setLoading(false)
    }
  }

  const isFormValid = selectedUser && amount.trim() && !isNaN(parseInt(amount)) && 
                     parseInt(amount) > 0 && description.trim().length >= 10

  const currentBalance = selectedUser?.credits?.balance || 0
  const newBalance = selectedUser?.credits?.is_unlimited 
    ? '∞ (Unlimited)' 
    : (typeof currentBalance === 'number' ? currentBalance + parseInt(amount || '0') : currentBalance)

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Credits
          </CardTitle>
          <CardDescription>
            Add one-time credits to a user's account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!selectedUser ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please search for and select a user above to add credits
              </AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Credit Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="50"
                    min="1"
                    max="10000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={loading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter a positive number (1-10,000)
                  </p>
                </div>

                {selectedUser.credits && (
                  <div className="space-y-2">
                    <Label>Credit Balance Preview</Label>
                    <div className="p-3 bg-muted rounded-md">
                      <div className="flex items-center justify-between text-sm">
                        <span>Current:</span>
                        <span className="font-mono">
                          {selectedUser.credits.is_unlimited ? '∞' : selectedUser.credits.balance}
                        </span>
                      </div>
                      {amount && parseInt(amount) > 0 && !selectedUser.credits.is_unlimited && (
                        <>
                          <div className="flex items-center justify-between text-sm text-muted-foreground">
                            <span>Adding:</span>
                            <span className="font-mono">+{amount}</span>
                          </div>
                          <hr className="my-1" />
                          <div className="flex items-center justify-between text-sm font-medium">
                            <span>New Balance:</span>
                            <span className="font-mono">{newBalance}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Reason for adding credits (e.g., compensation for service issue, promotional bonus, etc.)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={loading}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Provide a clear reason for this credit addition (min. 10 characters)
                </p>
              </div>

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
                  <Coins className="h-4 w-4 mr-2" />
                )}
                {loading ? 'Adding Credits...' : `Add ${amount || '0'} Credits`}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Credit Addition</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to add <strong>{amount} credits</strong> to{' '}
              <strong>{selectedUser?.email}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <div className="space-y-2 text-sm">
              <div><strong>User:</strong> {selectedUser?.email}</div>
              <div><strong>Amount:</strong> {amount} credits</div>
              <div><strong>Current Balance:</strong> {
                selectedUser?.credits?.is_unlimited 
                  ? '∞ (Unlimited)' 
                  : selectedUser?.credits?.balance || 0
              }</div>
              {!selectedUser?.credits?.is_unlimited && (
                <div><strong>New Balance:</strong> {newBalance}</div>
              )}
              <div><strong>Reason:</strong> {description}</div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Adding...
                </>
              ) : (
                'Confirm Addition'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}