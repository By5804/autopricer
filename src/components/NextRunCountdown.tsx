import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Clock } from 'lucide-react';
import { formatDistanceToNowStrict, addMinutes } from 'date-fns';

interface NextRunCountdownProps {
  lastRunAt: string | null;
  intervalMinutes: number;
  isCronActive: boolean;
}

export const NextRunCountdown = ({ lastRunAt, intervalMinutes, isCronActive }: NextRunCountdownProps) => {
  const [timeLeft, setTimeLeft] = useState<string | null>(null);

  useEffect(() => {
    if (!isCronActive) {
      setTimeLeft('Automation is disabled.');
      return;
    }

    const calculateTimeLeft = () => {
      // Jika belum pernah jalan, berarti akan jalan segera atau menunggu siklus berikutnya
      const lastRunDate = lastRunAt ? new Date(lastRunAt) : new Date(Date.now() - (intervalMinutes * 60 * 1000));
      const nextRunDate = addMinutes(lastRunDate, intervalMinutes);
      const now = new Date();

      if (nextRunDate <= now) {
        setTimeLeft('Running now or overdue...');
      } else {
        setTimeLeft(formatDistanceToNowStrict(nextRunDate, { addSuffix: true }));
      }
    };

    calculateTimeLeft(); // Initial calculation
    const intervalId = setInterval(calculateTimeLeft, 1000); // Update every second

    return () => clearInterval(intervalId); // Cleanup on unmount
  }, [lastRunAt, intervalMinutes, isCronActive]); // Re-run effect if interval changes

  return (
    <Card className="mb-8 border-primary/20 bg-primary/5">
      <CardContent className="flex items-center p-4">
        <Clock className="mr-3 h-5 w-5 text-primary" />
        <p className="text-sm font-medium">
          Siklus Otomasi Berikutnya: <span className="font-bold text-primary">{timeLeft}</span>
          <span className="ml-2 text-xs font-normal text-muted-foreground">(Interval: {intervalMinutes}m)</span>
        </p>
      </CardContent>
    </Card>
  );
};