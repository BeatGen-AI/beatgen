import React, { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, TrendingUp, TrendingDown, Plus, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { useUser } from '../../context/UserContext';

export const CreditsHistory: React.FC = () => {
  const { creditsHistory: history, creditsHistoryLoading: isLoading, refreshCreditsHistory } = useUser();

  useEffect(() => {
    // Load credits history when component mounts
    if (!history) {
      refreshCreditsHistory(50);
    }
  }, [history, refreshCreditsHistory]);

  const getTransactionIcon = (type: string, amount: number) => {
    if (amount > 0) {
      return <Plus className="h-4 w-4 text-green-500" />;
    } else {
      return <TrendingDown className="h-4 w-4 text-red-500" />;
    }
  };

  const getTransactionBadge = (type: string) => {
    const typeConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
      monthly_allocation: { label: 'Monthly', variant: 'default' },
      usage: { label: 'Usage', variant: 'secondary' },
      subscription_upgrade: { label: 'Upgrade', variant: 'default' },
      subscription_cancellation: { label: 'Cancellation', variant: 'destructive' },
      refund: { label: 'Refund', variant: 'outline' },
      purchase: { label: 'Purchase', variant: 'default' },
      admin_adjustment: { label: 'Adjustment', variant: 'outline' },
    };

    const config = typeConfig[type] || { label: type, variant: 'secondary' };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credit History</CardTitle>
        <CardDescription>Your recent credit transactions</CardDescription>
      </CardHeader>
      <CardContent>
        {!history || history.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No transactions yet
          </div>
        ) : (
          <div className="space-y-4">
            {history.map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-start justify-between p-4 rounded-lg border"
              >
                <div className="flex items-start gap-3">
                  {getTransactionIcon(transaction.type, transaction.amount)}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{transaction.description}</p>
                      {getTransactionBadge(transaction.type)}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(transaction.created_at), 'MMM d, yyyy h:mm a')}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${transaction.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Balance: {transaction.balance_after}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};