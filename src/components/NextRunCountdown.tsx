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
      if (!lastRunAt) {
        setTimeLeft('Waiting for first run...');
        return;
      }

      const lastRunDate = new Date(lastRunAt);
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
  }, [lastRunAt, intervalMinutes, isCronActive]);

  return (
    <Card className="mb-8">
      <CardContent className="flex items-center p-4">
        <Clock className="mr-3 h-5 w-5 text-primary" />
        <p className="text-sm font-medium">
          Next automatic run: <span className="font-semibold">{timeLeft}</span>
        </p>
      </CardContent>
    </Card>
  );
};