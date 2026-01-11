const translations: Record<string, string> = {
  "logic.waiting": "Waiting for process to start.",
  "logic.checking": "Checking price...",
  "logic.processFailed": "Process failed. Check logs for details.",
  "logic.noCompetitor": "Error: Could not find any competitors for this product.",
  "logic.outOfStock": "Error: Your product is not in the top 10 (out of stock or uncompetitive).",
  "logic.onlySellerSetMax": "You are the only seller. Setting price to max.",
  "logic.onlySellerAtMax": "You are the only seller and already at max price.",
  "logic.maximizeProfit": "Maximizing profit against #2.",
  "logic.cheapestOptimal": "You are the cheapest; price is optimal.",
  "logic.attackFromMax": "Attacking {{competitorStoreName}} (rank #{{rank}}) from max price.",
  "logic.holdAtMax": "Holding at max price; no valid targets above.",
  "logic.undercutting": "Undercutting {{competitorStoreName}} (rank #{{rank}}).",
  "logic.undercuttingNewTarget": "P1 is too cheap. Undercutting new target {{competitorStoreName}} (rank #{{rank}}).",
  "logic.allCompetitorsTooCheap": "All competitors are cheaper than your minimum price. Holding price.",
  "logic.holdPrice": "Holding price; no valid non-whitelisted targets found above.",
  "logic.matchingWhitelist": "Matching whitelisted leader {{competitorStoreName}}.",
  "logic.opportunisticMax": "P1 is too cheap, P3 is expensive. Setting to max price.",
  "logic.defendingVsP3": "Defending against {{competitorStoreName}} (rank #3).",
  "logic.noP3SetMax": "P1 is too cheap and no P3 exists. Setting to max price.",
  "logic.profitMaximizationVsBelow": "Maximizing profit against competitor below you ({{competitorStoreName}}).",
  "logic.updateSuccess": "Price updated successfully to Rp {{newPrice}}.",
  "logic.updateFail": "Update failed: {{errorMessage}}",
  "logic.scrapeFail": "Scrape failed: {{errorMessage}}",
  "logic.violatesMinPrice": "Proposed price Rp {{proposedPrice}} is below min price Rp {{minPrice}}. Holding price.",
  "logic.violatesMaxPrice": "Proposed price Rp {{proposedPrice}} is above max price Rp {{maxPrice}}. Holding price.",
  "logic.priceWarDetected": "Price war detected against {{rivalStoreName}}. Undercutting to Rp {{newPrice}} (Floor: Rp {{minPrice}}).",
  "logic.priceWarRecovery": "Price war recovery: Matching P2 price Rp {{newPrice}}.",
  "logic.priceWarCooldown": "Price war cooldown active against {{rivalStoreName}}. Holding minimum price Rp {{minPrice}}.",
};

export const formatMessage = (key: string, params?: Record<string, string | number | undefined>): string => {
  let message = translations[key] || key;
  if (params) {
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      if (paramValue !== undefined) {
        message = message.replace(new RegExp(`{{${paramKey}}}`, 'g'), String(paramValue));
      }
    });
  }
  return message;
};