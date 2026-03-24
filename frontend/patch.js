const fs = require('fs');

let content = fs.readFileSync('src/components/LiveMatchDashboard.tsx', 'utf8');

content = `import { InteractiveAnalyst } from "./InteractiveAnalyst";\n` + content;

// Replace fetchInsight definition
content = content.replace(/import { InteractiveAnalyst } from "\.\/InteractiveAnalyst";\s+if \(filteredEvents\.length === 0\) \{[\s\S]*?\}\s+try \{[\s\S]*?\} catch \{[\s\S]*?\}\s+\};\s+return/m, "return");

// Find the AI tactical section and replace it with InteractiveAnalyst 
content = content.replace(/<div className="flex items-center gap-2 border-b border-cyan-300\/15[\s\S]*?<BrainCircuit[\s\S]*?<\/div>\s*<\/div>/, '<InteractiveAnalyst events={filteredEvents} matchId={matchId} />');

fs.writeFileSync('src/components/LiveMatchDashboard.tsx', content);
