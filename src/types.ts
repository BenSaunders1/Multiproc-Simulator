export type InstructionType = 
  | 'MOV' 
  | 'ADD' 
  | 'SUB'
  | 'LOAD' 
  | 'STORE' 
  | 'LOCK' 
  | 'UNLOCK' 
  | 'JMP' 
  | 'BEQ' 
  | 'HALT'
  | 'NOP';

export interface Instruction {
  type: InstructionType;
  args: (string | number)[];
  label?: string;
}

export interface CacheLine {
  address: number | null;
  value: number;
  state: 'V' | 'I';
}

export interface CoreState {
  id: number;
  pc: number;
  registers: Record<string, number>;
  cache: CacheLine[];
  status: 'idle' | 'running' | 'waiting' | 'halted';
  program: Instruction[];
  lastInstruction?: string;
}

export interface SimulatorState {
  cores: CoreState[];
  sharedMemory: number[];
  memoryOwners: (number | null)[];
  mutexes: (number | null)[];
  cycle: number;
  logs: string[];
  cacheEnabled: boolean;
}
