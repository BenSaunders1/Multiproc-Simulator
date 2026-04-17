import { SimulatorState, Instruction, CoreState, InstructionType } from './types';

export const INITIAL_MEMORY_SIZE = 16;
export const CACHE_SIZE = 4;

export const createInitialState = (program0: Instruction[], program1: Instruction[], cacheEnabled: boolean = false): SimulatorState => ({
  cores: [
    {
      id: 0,
      pc: 0,
      registers: { r0: 0, r1: 0, r2: 0, r3: 0 },
      cache: new Array(CACHE_SIZE).fill(null).map(() => ({ address: null, value: 0, state: 'I' })),
      status: 'idle',
      program: program0,
    },
    {
      id: 1,
      pc: 0,
      registers: { r0: 0, r1: 0, r2: 0, r3: 0 },
      cache: new Array(CACHE_SIZE).fill(null).map(() => ({ address: null, value: 0, state: 'I' })),
      status: 'idle',
      program: program1,
    },
  ],
  sharedMemory: new Array(INITIAL_MEMORY_SIZE).fill(0),
  memoryOwners: new Array(INITIAL_MEMORY_SIZE).fill(null),
  mutexes: [null, null],
  cycle: 0,
  logs: ['Simulator initialized.'],
  cacheEnabled,
});

export const stepSimulator = (state: SimulatorState): SimulatorState => {
  const newState = JSON.parse(JSON.stringify(state)) as SimulatorState;
  newState.cycle += 1;

  const coreIndices = newState.cores.map((_, i) => i);
  // Shuffle core indices to randomize execution order within the cycle
  for (let i = coreIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [coreIndices[i], coreIndices[j]] = [coreIndices[j], coreIndices[i]];
  }

  coreIndices.forEach(idx => {
    const core = newState.cores[idx];
    if (core.status === 'halted') return;
    if (core.pc >= core.program.length) {
      core.status = 'halted';
      return;
    }

    const instr = core.program[core.pc];
    core.lastInstruction = `${instr.type} ${instr.args.join(', ')}`;
    
    let advancedPc = true;

    switch (instr.type) {
      case 'MOV': {
        const [dest, val] = instr.args;
        core.registers[dest as string] = typeof val === 'number' ? val : core.registers[val as string];
        break;
      }
      case 'ADD': {
        const [dest, s1, s2] = instr.args;
        const v1 = typeof s1 === 'number' ? s1 : core.registers[s1 as string];
        const v2 = typeof s2 === 'number' ? s2 : core.registers[s2 as string];
        core.registers[dest as string] = v1 + v2;
        break;
      }
      case 'SUB': {
        const [dest, s1, s2] = instr.args;
        const v1 = typeof s1 === 'number' ? s1 : core.registers[s1 as string];
        const v2 = typeof s2 === 'number' ? s2 : core.registers[s2 as string];
        core.registers[dest as string] = v1 - v2;
        break;
      }
      case 'LOAD': {
        const [dest, addr] = instr.args;
        const address = typeof addr === 'number' ? addr : core.registers[addr as string];
        
        if (!newState.cacheEnabled) {
          core.registers[dest as string] = newState.sharedMemory[address] || 0;
          break;
        }

        const cacheIdx = address % CACHE_SIZE;
        const cacheLine = core.cache[cacheIdx];
        
        if (cacheLine.state === 'V' && cacheLine.address === address) {
          // Cache Hit
          core.registers[dest as string] = cacheLine.value;
          newState.logs.push(`Core ${core.id} Cache HIT at [${address}]`);
        } else {
          // Cache Miss
          const val = newState.sharedMemory[address] || 0;
          core.registers[dest as string] = val;
          core.cache[cacheIdx] = { address, value: val, state: 'V' };
          newState.logs.push(`Core ${core.id} Cache MISS at [${address}]`);
        }
        break;
      }
      case 'STORE': {
        const [src, addr] = instr.args;
        const address = typeof addr === 'number' ? addr : core.registers[addr as string];
        const value = typeof src === 'number' ? src : core.registers[src as string];
        
        // Write-through to main memory
        newState.sharedMemory[address] = value;
        newState.memoryOwners[address] = core.id;
        
        if (!newState.cacheEnabled) {
          break;
        }

        // Update local cache
        const cacheIdx = address % CACHE_SIZE;
        core.cache[cacheIdx] = { address, value, state: 'V' };
        
        // Snooping: Invalidate other cores' caches
        newState.cores.forEach(otherCore => {
          if (otherCore.id !== core.id) {
            const otherCacheIdx = address % CACHE_SIZE;
            const otherLine = otherCore.cache[otherCacheIdx];
            if (otherLine.state === 'V' && otherLine.address === address) {
              otherLine.state = 'I';
              newState.logs.push(`Core ${otherCore.id} Cache INVALIDATED at [${address}]`);
            }
          }
        });
        
        break;
      }
      case 'LOCK': {
        const [mutexId] = instr.args;
        const id = typeof mutexId === 'number' ? mutexId : core.registers[mutexId as string];
        
        // Ensure we only have 2 mutexes (0 and 1)
        if (id < 0 || id > 1) {
          newState.logs.push(`Core ${core.id} ERROR: Invalid mutex ID ${id}`);
          core.status = 'halted';
          break;
        }

        if (newState.mutexes[id] === null) {
          newState.mutexes[id] = core.id;
          core.status = 'running';
          newState.logs.push(`Core ${core.id} acquired Mutex ${id}`);
        } else if (newState.mutexes[id] === core.id) {
          // Already owns it
          core.status = 'running';
        } else {
          core.status = 'waiting';
          advancedPc = false; // Stay on LOCK instruction
        }
        break;
      }
      case 'UNLOCK': {
        const [mutexId] = instr.args;
        const id = typeof mutexId === 'number' ? mutexId : core.registers[mutexId as string];
        
        if (id < 0 || id > 1) {
          newState.logs.push(`Core ${core.id} ERROR: Invalid mutex ID ${id}`);
          core.status = 'halted';
          break;
        }

        if (newState.mutexes[id] === core.id) {
          newState.mutexes[id] = null;
          newState.logs.push(`Core ${core.id} released Mutex ${id}`);
        }
        break;
      }
      case 'JMP': {
        const [target] = instr.args;
        core.pc = target as number;
        advancedPc = false;
        break;
      }
      case 'BEQ': {
        const [r1, r2, target] = instr.args;
        const v1 = typeof r1 === 'number' ? r1 : core.registers[r1 as string];
        const v2 = typeof r2 === 'number' ? r2 : core.registers[r2 as string];
        if (v1 === v2) {
          core.pc = target as number;
          advancedPc = false;
        }
        break;
      }
      case 'HALT': {
        core.status = 'halted';
        newState.logs.push(`Core ${core.id} halted.`);
        break;
      }
      case 'NOP':
        break;
    }

    if (advancedPc) {
      core.pc += 1;
    }
  });

  // Limit logs
  if (newState.logs.length > 50) {
    newState.logs = newState.logs.slice(-50);
  }

  return newState;
};

export const parseProgram = (text: string): Instruction[] => {
  const lines = text.split('\n');
  const program: Instruction[] = [];
  const labels: Record<string, number> = {};

  // First pass: find labels
  let pc = 0;
  lines.forEach(line => {
    // Remove comments starting with //, #, or ;
    const trimmed = line.split(/\/\/|#|;/)[0].trim();
    if (!trimmed) return;
    if (trimmed.endsWith(':')) {
      labels[trimmed.slice(0, -1).toUpperCase()] = pc;
    } else {
      pc++;
    }
  });

  // Second pass: parse instructions
  lines.forEach(line => {
    const trimmed = line.split(/\/\/|#|;/)[0].trim();
    if (!trimmed || trimmed.endsWith(':')) return;

    const parts = trimmed.split(/[\s,]+/).filter(p => p);
    const type = parts[0].toUpperCase() as InstructionType;
    const args = parts.slice(1).map(arg => {
      const upperArg = arg.toUpperCase();
      if (labels[upperArg] !== undefined) return labels[upperArg];
      const num = parseInt(arg);
      return isNaN(num) ? arg : num;
    });

    program.push({ type, args });
  });

  return program;
};

export const programToText = (program: Instruction[]): string => {
  return program.map(instr => `${instr.type} ${instr.args.join(', ')}`).join('\n');
};
