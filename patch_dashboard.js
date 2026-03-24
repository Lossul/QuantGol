const fs = require('fs');

let content = fs.readFileSync('frontend/src/components/LiveMatchDashboard.tsx', 'utf8');

if (!content.includes('InteractiveAnalyst')) {
    content = `import { InteractiveAnalyst } from "./InteractiveAnalyst";\n` + content;
    
    // Replace fetchInsight definition entirely
    content = content.replace(/const fetchInsight = async \(\) => \{[\s\S]*?\}\s*;\s*return \(\s*<section/m, "return (<section");
    
    // Replace the UI box
    content = content.replace(/<div className="flex items-center gap-2 border-b border-cyan-300\/15 bg-\[#071536\] px-4 py-3">[\s\S]*?<BrainCircuit className="h-5 w-5 text-fuchsia-400" \/>[\s\S]*?<\/div>\s*<\/div>/, '<InteractiveAnalyst events={filteredEvents} matchId={matchId} />');
    
    fs.writeFileSync('frontend/src/components/LiveMatchDashboard.tsx', content);
}
