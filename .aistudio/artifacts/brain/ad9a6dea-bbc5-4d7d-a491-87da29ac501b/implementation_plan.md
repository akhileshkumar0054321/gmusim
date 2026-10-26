# GNUSim8085 Memory Tracking & Execution Engine Implementation Plan [COMPLETED]

Enhance the Intel 8085 microprocessor simulator so that running code immediately executes to completion, accurately updates all registers and condition flags according to processor rules, and automatically tracks, jumps to, and highlights destination memory addresses where answers are stored.

## Status: Successfully Implemented and Verified

- **Memory Write Event Tracking**: `CPU8085` records all target destination writes (`recentWrites` and `lastWrittenAddress`).
- **Target Memory Auto-Focus**: The Memory Inspector and Left Panel memory group box automatically jump to and highlight written answer locations (e.g., `2050H`) with an amber badge.
- **Run to Completion (F9)**: Code runs continuously to `HLT`, updating registers, flags, and memory answers in real time.
- **Big Console Reporting**: All memory answer writes, step counts, and cycle metrics are logged with line numbers in the Big Console.

> [!IMPORTANT]
> The following decisions were confirmed during the clarification interview:
> - **Memory Tracking**: The Memory Inspector and Left Panel memory box will automatically jump to and highlight the exact memory address(es) written to by instructions like `STA`, `MOV M, A`, `SHLD`, and `STAX`.
> - **Execution Mode**: Clicking **Run (F9)** will execute the program continuously to completion (`HLT` or breakpoint), logging the written answer memory location and final register/flag values in the big console and memory viewer.

- **Confirmed Decision 1**: Automatic address jumping to target memory locations whenever data is written to memory.
- **Confirmed Decision 2**: Run-to-completion mode displaying the final answer in memory and registers without requiring manual step-through.

---

## 1. Overview & Core Concept

When users write and run 8085 assembly programs—such as adding two numbers, calculating a factorial, sorting an array, or transferring a data block—the result is written into memory (e.g., `STA 2050H` or `MOV M, A`).

Currently, the CPU correctly updates memory bytes in its 64KB array, but the UI memory inspector remains at its initial address unless manually navigated. This plan introduces:
1. **Target Memory Auto-Focus**: Whenever a memory write instruction executes (`STA addr`, `SHLD addr`, `MOV M, r`, `STAX B/D`), the simulator tracks the written address and automatically scrolls the Memory Inspector and Left Panel memory box directly to that location, applying a clear visual highlight.
2. **Comprehensive Instruction & Flag Validation**: Ensure all arithmetic (`ADD`, `ADI`, `ADC`, `ACI`, `SUB`, `SUI`, `SBB`, `SBI`, `INR`, `DCR`, `DAA`), logical (`ANA`, `ANI`, `ORA`, `ORI`, `XRA`, `XRI`, `CMP`, `CPI`, `RLC`, `RRC`, `RAL`, `RAR`, `CMA`, `CMC`, `STC`), data transfer, and branching instructions update `S`, `Z`, `AC`, `P`, and `CY` condition flags strictly per the Intel 8085 hardware specification.
3. **Spacious Output Logging in Console**: The Big Console will explicitly report memory writes (e.g., `Memory [2050H] updated to 78H (120 decimal)`), allowing students and engineers to see the exact answer without searching.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Writing & Loading Code**:
   - The user enters assembly instructions into the editor (or selects an example like 16-bit Addition, Factorial, or Memory Store).
   - The user specifies an optional load address in **"Load me at"** (e.g., `4200h` or `2000h`).
2. **Assembling (F8)**:
   - Clicking **Assemble (gear icon or F8)** parses the code, calculates memory addresses, generates machine code, and outputs a success confirmation in the Big Console.
3. **Running (F9)**:
   - Clicking **Run (orange arrow or F9)** executes all instructions up to `HLT`.
   - The simulator identifies the destination address written by the program (e.g., `2050H`).
   - The **Memory Inspector** automatically jumps to `2050H` and highlights the written cell in amber with an active pulse badge.
   - The **Left Panel Memory Group** automatically updates to `[2050] [Value: 78]` so the answer is immediately visible on the left and right.
   - The **Big Console** logs: `Answer written to Memory [2050h]: 78h (120 decimal) | Program halted in 142 clock cycles`.
4. **Step-by-Step Debugging (F5 / F6)**:
   - When stepping, each instruction updates its respective register and flags in real time. When a memory write instruction steps, the memory view instantly focuses on the modified cell.

### Visual Identity & Theme
- Consistent with GNUSim8085's classic GTK light appearance:
  - Clean etched group boxes on the left panel.
  - Cyan line indicator on the current/last instruction line in the editor.
  - Amber glow and clear badge on modified memory answer locations.
  - Big Assembler Console with distinct tags for Info, Memory Write, and Success.

---

## 3. Key Product Decisions & Trade-Offs

- **Memory Write Event Hooks**:
  - *Chosen Approach*: Track a list of recent write events `{ address, value, pc, line }` inside `CPU8085` during execution.
  - *Why*: Allows both instant batch execution and single stepping to accurately capture the exact memory location of computed answers, including multi-byte writes (e.g. `SHLD` writing 2 consecutive bytes).
- **Auto-Navigation vs. Fixed Scroll**:
  - *Chosen Approach*: On completion or single step with memory mutation, automatically adjust the base address of the Memory Inspector (`MemoryInspector.tsx` and `GtkRightPanel.tsx`) and the Left Panel memory box (`GtkLeftPanel.tsx`) to show the modified address.
  - *Why*: Directly addresses the user request that the answer must immediately appear in memory without forcing the user to type the destination address manually.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                       GNUSim8085                            │
│                                                             │
│   ┌───────────────┐     ┌───────────────────────────────┐   │
│   │   GtkEditor   │────▶│    2-Pass 8085 Assembler      │   │
│   │  (source.asm) │     │  (Opcode/Address Generation)  │   │
│   └───────────────┘     └───────────────┬───────────────┘   │
│                                         │                   │
│                                         ▼                   │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                    CPU8085 Core                     │   │
│   │                                                     │   │
│   │  • Registers: A, BC, DE, HL, PSW, PC, SP            │   │
│   │  • Flags: S, Z, AC, P, CY (ALU & DAA exact rules)   │   │
│   │  • 64KB RAM & 256 I/O Ports                         │   │
│   │  • Memory Write Hook -> Emits { addr, value }       │   │
│   └─────────────────────────────┬───────────────────────┘   │
│                                 │                           │
│                 ┌───────────────┴───────────────┐           │
│                 ▼                               ▼           │
│   ┌───────────────────────────┐   ┌─────────────────────┐   │
│   │     Memory Inspector      │   │     Big Console     │   │
│   │  • Auto-jumps to addr     │   │  • Logs Line No     │   │
│   │  • Highlights answer byte │   │  • Logs Ans & Cyc   │   │
│   │  • Left Panel mem sync    │   │  • Clear error log  │   │
│   └───────────────────────────┘   └─────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Key Components to Update (Upon Approval)
1. `src/emulator/cpu.ts`:
   - Enhance memory write tracking: retain an ordered log of memory write events (`recentWrites: { addr: number; val: number }[]`).
   - Audit ALU operations (e.g., Auxiliary Carry calculation for `ADD`, `ADC`, `SUB`, `SBB`, `INR`, `DCR`, `DAA`).
2. `src/App.tsx`:
   - Update execution runner: when `Run` completes or halts, extract the last written memory address(es).
   - Automatically switch/focus the memory view to the target address, update Left Panel memory address box, and log the answer to the Big Console.
3. `src/components/GtkRightPanel.tsx`:
   - Sync the Memory tab and Data tab with the latest target memory address and auto-scroll to the highlighted byte.
4. `src/components/GtkLeftPanel.tsx`:
   - Automatically reflect the target memory address and its computed value in the Memory group box.
