const fs = require('fs');
let code = fs.readFileSync('../frontend/src/components/LiveMatchDashboard.tsx', 'utf8');

// Replace the early return for scheduled match 
code = code.replace(/  if \(matchDetails\?\.status === "scheduled"\) \{[\s\S]*?  const isCompleted = matchDetails\?\.status === "completed";/m, `  const isScheduled = matchDetails?.status === "scheduled";
  const isCompleted = matchDetails?.status === "completed";`);

fs.writeFileSync('../frontend/src/components/LiveMatchDashboard.tsx', code);
