import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HelpCircle, ShieldAlert, Crown, Swords, Info, TrendingUp } from "lucide-react";

const LogicItem = ({ icon, title, children }: { icon: React.ReactNode, title: string, children: React.ReactNode }) => (
  <div className="flex items-start space-x-4">
    <div className="flex-shrink-0 mt-1 text-primary">{icon}</div>
    <div>
      <h4 className="font-semibold">{title}</h4>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  </div>
);

export function LogicExplanationDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon">
          <HelpCircle className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pricing Logic Explanation</DialogTitle>
          <DialogDescription>
            This is how the application decides to change your product prices.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-4">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger>
                <div className="flex items-center space-x-3">
                  <ShieldAlert className="h-5 w-5 text-red-500" />
                  <span>Priority Checks</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-2">
                <LogicItem icon={<Info className="h-4 w-4" />} title="Out of Stock">
                  If your product is not found in the top 10 cheapest, it's considered out of stock or uncompetitive. No action is taken.
                </LogicItem>
                <LogicItem icon={<Info className="h-4 w-4" />} title="Whitelist Check">
                  Competitors in your whitelist are ignored for undercutting but may be price-matched in specific scenarios.
                </LogicItem>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2">
              <AccordionTrigger>
                <div className="flex items-center space-x-3">
                  <Crown className="h-5 w-5 text-yellow-500" />
                  <span>Scenario A: You are the Cheapest (#1)</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-2">
                <LogicItem icon={<Info className="h-4 w-4" />} title="Maximize Profit">
                  If the price gap with #2 is large, your price will be raised to be just slightly cheaper than them, up to your max price.
                </LogicItem>
                <LogicItem icon={<Info className="h-4 w-4" />} title="Only Seller">
                  If you are the only seller, your price will be set to your max price.
                </LogicItem>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3">
              <AccordionTrigger>
                <div className="flex items-center space-x-3">
                  <Swords className="h-5 w-5 text-blue-500" />
                  <span>Scenario B: You are NOT the Cheapest</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-2">
                <LogicItem icon={<TrendingUp className="h-4 w-4" />} title="Find Target">
                  The app scans competitors above you. The first non-whitelisted competitor becomes the target.
                </LogicItem>
                <LogicItem icon={<ShieldAlert className="h-4 w-4" />} title="Defensive Moves">
                  If no target is found (e.g., everyone above is whitelisted or too cheap), special logic applies to defend your position or match a whitelisted leader.
                </LogicItem>
                <LogicItem icon={<Info className="h-4 w-4" />} title="Reputation">
                  The logic assumes your store has a good reputation and doesn't need to be the absolute cheapest to get sales.
                </LogicItem>
                 <LogicItem icon={<Info className="h-4 w-4" />} title="Undercut">
                  The app sets your price to be slightly lower than the target's price, as long as it doesn't violate your min price.
                </LogicItem>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
           <div className="mt-4 rounded-md border bg-muted p-4 text-sm text-muted-foreground">
            <strong>Note:</strong> All price changes will strictly respect the Minimum and Maximum prices you set for each product.
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}