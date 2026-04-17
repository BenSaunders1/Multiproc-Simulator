import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  FastForward, 
  Cpu, 
  Database, 
  Terminal, 
  Lock, 
  Unlock,
  Info,
  ChevronRight,
  Code2,
  Sun,
  Moon
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { Instruction, SimulatorState, InstructionType } from './types';
import { createInitialState, stepSimulator, parseProgram, programToText } from './simulator';

const INSTRUCTIONS: InstructionType[] = [
  'MOV', 'ADD', 'SUB', 'LOAD', 'STORE', 'LOCK', 'UNLOCK', 'JMP', 'BEQ', 'HALT', 'NOP'
];

const REGISTERS = ['r0', 'r1', 'r2', 'r3'];

const PRESETS = {
  race: {
    name: "Race Condition",
    description: "Both cores increment a shared counter at address 0 without locks. Final value might be 1 instead of 2.",
    p0: `LOAD r1, 0
NOP // Delay to increase race chance
ADD r1, r1, 1
STORE r1, 0
HALT`,
    p1: `LOAD r1, 0
ADD r1, r1, 1
STORE r1, 0
HALT`,
  },
  mutex: {
    name: "Mutex Lock",
    description: "Cores use dedicated Mutex 0 to synchronize access to the counter at address 0.",
    p0: `LOCK 0 // Acquire Mutex 0
LOAD r1, 0
ADD r1, r1, 1
STORE r1, 0
UNLOCK 0 // Release Mutex 0
HALT`,
    p1: `LOCK 0 // Acquire Mutex 0
LOAD r1, 0
ADD r1, r1, 1
STORE r1, 0
UNLOCK 0 // Release Mutex 0
HALT`,
  },
  pingpong: {
    name: "Ping Pong",
    description: "Core 0 writes 1, Core 1 waits for 1 then writes 2.",
    p0: `MOV r1, 1
STORE r1, 0 // Write 1 to memory[0]
HALT`,
    p1: `LOAD r1, 0
BEQ r1, 0, 0 // Wait until memory[0] != 0
MOV r1, 2
STORE r1, 0 // Write 2 to memory[0]
HALT`,
  },
  cache_demo: {
    name: "Cache Coherence",
    description: "Demonstrates the VI protocol. Core 0 experiences a cache miss, then a hit. Core 1 then writes to the same address, invalidating Core 0's cache.",
    p0: `LOAD r1, 0 // Miss -> Valid
LOAD r2, 0 // Hit
NOP // Wait for Core 1
NOP // Wait for Core 1 STORE
LOAD r3, 0 // Miss (Invalidated by Core 1)
HALT`,
    p1: `NOP
NOP
MOV r1, 42
STORE r1, 0 // Invalidates Core 0's cache
HALT`,
  },
  deadlock: {
    name: "Deadlock",
    description: "Core 0 locks Mutex 0 while Core 1 locks Mutex 1. They then each attempt to lock the other's mutex, causing both cores to freeze in a waiting state.",
    p0: `LOCK 0 // Core 0 locks Mutex 0
NOP // Yield to ensure Core 1 gets time
LOCK 1 // Core 0 waits for Mutex 1
// Will never reach here
UNLOCK 1
UNLOCK 0
HALT`,
    p1: `LOCK 1 // Core 1 locks Mutex 1
NOP // Yield to ensure Core 0 gets time
LOCK 0 // Core 1 waits for Mutex 0
// Will never reach here
UNLOCK 0
UNLOCK 1
HALT`,
  }
};

export default function App() {
  const [state, setState] = useState<SimulatorState>(createInitialState(parseProgram(PRESETS.race.p0), parseProgram(PRESETS.race.p1)));
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState([500]); // ms per cycle
  const [activePreset, setActivePreset] = useState<keyof typeof PRESETS>('race');
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  
  const [core0Code, setCore0Code] = useState(PRESETS.race.p0);
  const [core1Code, setCore1Code] = useState(PRESETS.race.p1);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setState(prev => {
          const next = stepSimulator(prev);
          if (next.cores.every(c => c.status === 'halted' || c.status === 'waiting')) {
            setIsRunning(false);
          }
          return next;
        });
      }, speed[0]);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, speed]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.logs]);

  const handleReset = () => {
    setIsRunning(false);
    const p0 = parseProgram(core0Code);
    const p1 = parseProgram(core1Code);
    setState(createInitialState(p0, p1, state.cacheEnabled));
  };

  const handlePresetChange = (key: keyof typeof PRESETS) => {
    setActivePreset(key);
    setIsRunning(false);
    const p0 = PRESETS[key].p0;
    const p1 = PRESETS[key].p1;
    setCore0Code(p0);
    setCore1Code(p1);
    setState(createInitialState(parseProgram(p0), parseProgram(p1), state.cacheEnabled));
  };

  const handleLoadCode = () => {
    setIsRunning(false);
    const p0 = parseProgram(core0Code);
    const p1 = parseProgram(core1Code);
    setState(createInitialState(p0, p1, state.cacheEnabled));
  };

  const toggleCache = () => {
    setState(prev => ({ ...prev, cacheEnabled: !prev.cacheEnabled }));
  };

  const handleStep = () => {
    setIsRunning(false);
    setState(prev => stepSimulator(prev));
  };

  return (
    <div className="min-h-screen bg-background transition-colors duration-300 text-foreground font-sans p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex justify-center border-b border-border pb-8">
          <div className="flex flex-wrap items-center gap-4 bg-muted/50 p-2 rounded-xl shadow-sm border border-border backdrop-blur-md">
            <div className="flex items-center gap-2 px-4 border-r border-border">
              <span className="text-xs font-mono uppercase opacity-50">Cycle</span>
              <span className="text-xl font-mono font-bold w-12 text-center text-foreground">{state.cycle}</span>
            </div>
            
            <div className="flex items-center gap-1">
              <Button 
                variant={isRunning ? "outline" : "default"} 
                size="icon" 
                onClick={() => setIsRunning(!isRunning)}
                className={`rounded-lg ${!isRunning ? 'bg-blue-600 hover:bg-blue-700 text-foreground border-blue-600' : 'border-border text-muted-foreground hover:bg-muted'}`}
              >
                {isRunning ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </Button>
              <Button variant="outline" size="icon" onClick={handleStep} className="rounded-lg border-border text-muted-foreground hover:bg-muted">
                <FastForward className="w-5 h-5" />
              </Button>
              <Button variant="outline" size="icon" onClick={handleReset} className="rounded-lg border-border text-muted-foreground hover:bg-muted">
                <RotateCcw className="w-5 h-5" />
              </Button>
              <Button variant="secondary" onClick={handleLoadCode} className="ml-2 rounded-lg gap-2 bg-muted text-foreground hover:bg-white/20 border border-border">
                <Code2 className="w-4 h-4" /> Load Code
              </Button>
              <Button 
                variant="outline" 
                onClick={toggleCache} 
                className={`ml-2 rounded-lg gap-2 transition-colors ${state.cacheEnabled ? 'bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30'}`}
              >
                <Database className="w-4 h-4" /> Cache: {state.cacheEnabled ? 'ON' : 'OFF'}
              </Button>
            </div>

            <div className="flex items-center gap-4 px-4 border-l border-border min-w-[200px]">
              <span className="text-xs font-mono uppercase opacity-50">Speed</span>
              <Slider 
                value={speed} 
                onValueChange={setSpeed} 
                min={50} 
                max={2000} 
                step={50} 
                className="w-32"
                inverted
              />
            </div>
            
            <div className="flex items-center pl-4 border-l border-border">
              <Button variant="ghost" size="icon" onClick={() => setIsDark(!isDark)} className="rounded-full">
                {isDark ? <Sun className="w-5 h-5 text-muted-foreground" /> : <Moon className="w-5 h-5 text-muted-foreground" />}
              </Button>
            </div>
          </div>
        </header>

        {/* Presets & Info */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 bg-muted/50 border-none shadow-xl backdrop-blur-md">
            <CardHeader>
              <CardTitle className="text-lg font-mono uppercase tracking-widest opacity-80 text-foreground">Scenarios</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              {(Object.keys(PRESETS) as Array<keyof typeof PRESETS>).map((key) => (
                <Button
                  key={key}
                  variant={activePreset === key ? "default" : "outline"}
                  onClick={() => handlePresetChange(key)}
                  className={`rounded-full px-6 transition-all ${
                    activePreset === key 
                      ? 'bg-blue-600 text-foreground hover:bg-blue-700 border-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.4)]' 
                      : 'text-muted-foreground border-border hover:bg-muted/50 hover:text-foreground'
                  }`}
                >
                  {PRESETS[key].name}
                </Button>
              ))}
            </CardContent>
          </Card>
          
          <Card className="bg-muted text-foreground border-none shadow-xl backdrop-blur-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-widest font-mono text-blue-400">
                <Info className="w-4 h-4" /> Description
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm opacity-90 leading-relaxed text-foreground">
                {PRESETS[activePreset].description}
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Simulator Grid */}
        <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Core 0 */}
          <div className="lg:col-span-4 space-y-6">
            <CoreView 
              core={state.cores[0]} 
              code={core0Code} 
              onCodeChange={setCore0Code} 
              cacheEnabled={state.cacheEnabled}
            />
            
            <Card className="border-none bg-muted shadow-sm">
              <CardHeader className="py-3">
                <CardTitle className="text-xs font-mono uppercase opacity-60 text-foreground">Instruction Set</CardTitle>
              </CardHeader>
              <CardContent className="text-[10px] font-mono space-y-1 opacity-80 text-foreground">
                <p><span className="font-bold text-blue-400">MOV dest, val</span> - Set register to value</p>
                <p><span className="font-bold text-blue-400">ADD d, s1, s2</span> - d = s1 + s2</p>
                <p><span className="font-bold text-blue-400">LOAD d, addr</span> - d = mem[addr]</p>
                <p><span className="font-bold text-blue-400">STORE s, addr</span> - mem[addr] = s</p>
                <p><span className="font-bold text-blue-400">LOCK addr</span> - Atomic lock at addr</p>
                <p><span className="font-bold text-blue-400">UNLOCK addr</span> - Release lock at addr</p>
                <p><span className="font-bold text-blue-400">BEQ r1, r2, pc</span> - Branch if r1 == r2</p>
                <div className="pt-2 border-t border-border/50 opacity-50">
                  <p>Comments: //, #, or ;</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Shared Memory */}
          <div className="lg:col-span-4 space-y-6">
            <Card className="border-2 border-border/50 shadow-lg overflow-hidden h-full bg-accent/50">
              <CardHeader className="bg-muted/50 border-b border-border/50">
                <CardTitle className="flex items-center gap-2 text-sm font-mono uppercase tracking-widest text-foreground">
                  <Database className="w-4 h-4" /> Shared Memory
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-2 gap-4 mb-8">
                  {state.mutexes.map((owner, i) => (
                    <div 
                      key={i} 
                      className={`
                        p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all
                        ${owner === null ? 'bg-muted/50 border-border' : owner === 0 ? 'bg-blue-500/20 border-blue-500/50' : 'bg-orange-500/20 border-orange-500/50'}
                      `}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-[10px] font-mono uppercase opacity-50 text-foreground">Mutex {i}</span>
                        {owner !== null ? <Lock className={`w-3 h-3 ${owner === 0 ? 'text-blue-400' : 'text-orange-400'}`} /> : <Unlock className="w-3 h-3 text-muted-foreground" />}
                      </div>
                      <span className="text-xs font-mono font-bold text-foreground">
                        {owner === null ? 'UNLOCKED' : `LOCKED BY CORE ${owner}`}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-4 gap-3">
                  {state.sharedMemory.map((val, i) => {
                    const owner = state.memoryOwners[i];
                    return (
                      <motion.div
                        key={i}
                        layout
                        className={`
                          relative aspect-square flex flex-col items-center justify-center rounded-lg border-2 font-mono transition-colors
                          ${owner === null ? 'bg-muted/50 border-border/50' : owner === 0 ? 'bg-blue-500/20 border-blue-500/50' : 'bg-orange-500/20 border-orange-500/50'}
                        `}
                      >
                        <span className="absolute top-1 left-1 text-[10px] opacity-50 text-foreground">0x{i.toString(16).padStart(2, '0')}</span>
                        
                        <span className={`text-xl font-bold ${val === 0 && owner === null ? 'opacity-20 text-foreground' : 'opacity-100 text-foreground'}`}>
                          {val}
                        </span>
                        {owner !== null && (
                          <div className={`absolute bottom-1 right-1 w-2 h-2 rounded-full ${owner === 0 ? 'bg-blue-500' : 'bg-orange-500'}`} />
                        )}
                      </motion.div>
                    );
                  })}
                </div>
                
                <div className="mt-8 space-y-4">
                  <h4 className="text-xs font-mono uppercase opacity-40 tracking-widest text-foreground">System Logs</h4>
                  <ScrollArea className="h-48 rounded-lg border border-border bg-accent p-4">
                    <div ref={scrollRef} className="space-y-2">
                      {state.logs.map((log, i) => (
                        <div key={i} className="text-xs font-mono flex gap-2">
                          <span className="opacity-50 text-foreground">[{i}]</span>
                          <span className="opacity-90 text-foreground">{log}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Core 1 */}
          <div className="lg:col-span-4 space-y-6">
            <CoreView 
              core={state.cores[1]} 
              code={core1Code} 
              onCodeChange={setCore1Code} 
              cacheEnabled={state.cacheEnabled}
            />
          </div>

        </main>
      </div>
    </div>
  );
}

function CoreView({ core, code, onCodeChange, cacheEnabled }: { core: any, code: string, onCodeChange: (c: string) => void, cacheEnabled: boolean }) {
  const isCore0 = core.id === 0;
  
  return (
    <Card className={`border-2 ${isCore0 ? 'border-blue-500/30' : 'border-orange-500/30'} shadow-lg overflow-hidden bg-accent/50`}>
      <CardHeader className={`${isCore0 ? 'bg-blue-500/10' : 'bg-orange-500/10'} border-b ${isCore0 ? 'border-blue-500/20' : 'border-orange-500/20'}`}>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-mono uppercase tracking-widest text-foreground">
            <Cpu className={`w-4 h-4 ${isCore0 ? 'text-blue-400' : 'text-orange-400'}`} /> 
            Core {core.id}
          </CardTitle>
          <Badge 
            variant={core.status === 'running' ? 'default' : core.status === 'waiting' ? 'destructive' : 'secondary'}
            className="uppercase text-[10px] font-mono tracking-tighter"
          >
            {core.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs defaultValue="code" className="w-full">
          <TabsList className="w-full rounded-none h-10 bg-transparent border-b border-border/50 flex">
            <TabsTrigger value="code" className="flex-1 text-xs font-mono uppercase text-muted-foreground data-[state=active]:text-foreground">Program</TabsTrigger>
            <TabsTrigger value="editor" className="flex-1 text-xs font-mono uppercase text-muted-foreground data-[state=active]:text-foreground">Editor</TabsTrigger>
          </TabsList>
          
          <TabsContent value="code" className="m-0">
            <div className="bg-card  text-foreground p-4 font-mono text-sm h-64 overflow-y-auto">
              {core.program.map((instr: any, i: number) => (
                <div 
                  key={i} 
                  className={`
                    flex items-center gap-3 px-2 py-1 rounded transition-colors
                    ${core.pc === i ? (isCore0 ? 'bg-blue-500/30 border-l-2 border-blue-500' : 'bg-orange-500/30 border-l-2 border-orange-500') : 'opacity-60'}
                  `}
                >
                  <span className="w-6 text-right opacity-40 text-[10px]">{i}</span>
                  <span className="flex-1">
                    <span className={isCore0 ? 'text-blue-400' : 'text-orange-400'}>{instr.type}</span>
                    <span className="ml-2 text-muted-foreground">{instr.args.join(', ')}</span>
                  </span>
                  {core.pc === i && (
                    <motion.div 
                      layoutId={`pointer-${core.id}`}
                      className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" 
                    />
                  )}
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="editor" className="m-0">
            <CodeEditor value={code} onChange={onCodeChange} />
          </TabsContent>
        </Tabs>
        
        {/* Local Cache (Always Visible) */}
        {cacheEnabled && (
          <div className="border-t border-border/50 bg-accent">
            <div className="px-4 py-2 bg-muted/50 border-b border-border/50 flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Local Cache</span>
            </div>
            <div className="p-4 space-y-2">
              <div className="grid grid-cols-4 gap-2 text-[10px] font-mono uppercase opacity-50 text-foreground mb-2 px-2">
                <span>Line</span>
                <span>State</span>
                <span>Addr</span>
                <span className="text-right">Value</span>
              </div>
              {core.cache.map((line: any, i: number) => (
                <div 
                  key={i} 
                  className={`grid grid-cols-4 gap-2 items-center p-2 rounded border transition-colors ${
                    line.state === 'V' 
                      ? (isCore0 ? 'bg-blue-500/10 border-blue-500/30' : 'bg-orange-500/10 border-orange-500/30') 
                      : 'bg-muted/50 border-border/50 opacity-60'
                  }`}
                >
                  <span className="text-xs font-mono text-muted-foreground">{i}</span>
                  <span className={`text-xs font-bold ${line.state === 'V' ? 'text-green-400' : 'text-red-400'}`}>
                    [{line.state}]
                  </span>
                  <span className="text-xs font-mono text-muted-foreground">
                    {line.address !== null ? `0x${line.address.toString(16).padStart(2, '0')}` : '---'}
                  </span>
                  <span className="text-xs font-mono font-bold text-foreground text-right">
                    {line.state === 'V' ? line.value : '---'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="p-4 bg-muted/50 border-t border-border/50">
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(core.registers).map(([reg, val]: [string, any]) => (
              <div key={reg} className="flex flex-col items-center justify-center p-3 rounded-xl bg-accent/50 border border-border/50">
                <span className="text-sm font-mono opacity-40 uppercase text-foreground">{reg}</span>
                <span className="font-mono font-bold text-xl text-foreground">{val}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CodeEditor({ value, onChange }: { value: string, onChange: (v: string) => void }) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [cursorPos, setCursorPos] = useState({ top: 0, left: 0 });
  const [showSuggestions, setShowSuggestions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    onChange(val);

    const selectionStart = e.target.selectionStart;
    const textBeforeCursor = val.substring(0, selectionStart);
    const lines = textBeforeCursor.split('\n');
    const currentLine = lines[lines.length - 1];
    const words = currentLine.trim().split(/\s+/);
    const lastWord = words[words.length - 1].toUpperCase();

    if (lastWord.length > 0) {
      const filtered = INSTRUCTIONS.filter(i => i.startsWith(lastWord));
      if (filtered.length > 0) {
        setSuggestions(filtered);
        setShowSuggestions(true);
        
        // Basic position estimation
        const lineCount = lines.length;
        setCursorPos({
          top: lineCount * 20 + 10,
          left: currentLine.length * 8 + 20
        });
      } else {
        setShowSuggestions(false);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const applySuggestion = (s: string) => {
    if (!textareaRef.current) return;
    const selectionStart = textareaRef.current.selectionStart;
    const val = value;
    const textBeforeCursor = val.substring(0, selectionStart);
    const textAfterCursor = val.substring(selectionStart);
    
    const lines = textBeforeCursor.split('\n');
    const currentLine = lines[lines.length - 1];
    const words = currentLine.split(/\s+/);
    words[words.length - 1] = s + ' ';
    
    lines[lines.length - 1] = words.join(' ');
    const newVal = lines.join('\n') + textAfterCursor;
    
    onChange(newVal);
    setShowSuggestions(false);
    textareaRef.current.focus();
  };

  return (
    <div className="relative h-64 bg-card rounded-md border border-border ">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        className="w-full h-full bg-transparent text-foreground p-4 font-mono text-sm outline-none resize-none leading-[20px]"
        spellCheck={false}
        placeholder="// Write your NIOS II pseudocode here... (# and ; also supported for comments)"
      />
      <AnimatePresence>
        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute z-50 bg-popover border border-border rounded shadow-xl overflow-hidden"
            style={{ top: cursorPos.top, left: cursorPos.left }}
          >
            {suggestions.map(s => (
              <button
                key={s}
                onClick={() => applySuggestion(s)}
                className="block w-full text-left px-3 py-1 text-xs font-mono text-foreground hover:bg-blue-500 transition-colors"
              >
                {s}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
