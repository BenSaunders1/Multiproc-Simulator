const fs = require('fs');

const path = 'src/App.tsx';
let content = fs.readFileSync(path, 'utf8');

const replacements = [
    // Backgrounds
    [/bg-\[\#0A0A0A\]/g, 'bg-background transition-colors duration-300'],
    [/bg-\[\#121212\]/g, 'bg-card border-none rounded-none'],
    [/bg-\[\#1E1E1E\]/g, 'bg-card border-none rounded-none'],
    [/bg-\[\#2D2D2D\]/g, 'bg-popover border border-border'],
    [/bg-white\/5([^0-9])/g, 'bg-muted/50$1'],
    [/bg-white\/10/g, 'bg-muted'],
    [/bg-black\/20/g, 'bg-accent/50'],
    [/bg-black\/40/g, 'bg-accent'],
    
    // Text colors
    [/text-\[\#E0E0E0\]/g, 'text-foreground'],
    [/text-white\/90/g, 'text-foreground/90'],
    [/text-white\/80/g, 'text-foreground/80'],
    [/text-white\/70/g, 'text-muted-foreground'],
    [/text-white\/60/g, 'text-muted-foreground'],
    [/text-white\/50/g, 'text-muted-foreground/80'],
    [/text-white\/40/g, 'text-muted-foreground/60'],
    [/text-white\/20/g, 'text-muted-foreground/40'],
    [/text-white/g, 'text-foreground'],
    
    // Borders
    [/border-white\/5([^0-9])/g, 'border-border/50$1'],
    [/border-white\/10/g, 'border-border'],
    [/border-white\/20/g, 'border-border/80'],
];

replacements.forEach(([pattern, replacement]) => {
    content = content.replace(pattern, replacement);
});

fs.writeFileSync(path, content);
console.log("Rewrite complete.");
